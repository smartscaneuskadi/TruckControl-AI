import { describe, expect, it, vi } from "vitest";
import {
  inspectStripeReadiness,
  cachedStripeReadiness,
  readinessAccount,
  readinessEndpoint,
  readinessUrl,
} from "../supabase/functions/_shared/stripe-readiness";
const key = (mode = "live", kind = "sk") =>
  [kind, mode, "synthetic", "A".repeat(32)].join("_");
const secret = ["whsec", "B".repeat(32)].join("_");
const config = (extra = {}) => ({
  stripeKey: key(),
  fiscalSigningSecret: secret,
  ...extra,
});
const account = {
  object: "account",
  id: readinessAccount,
  charges_enabled: true,
  payouts_enabled: true,
};
const hook = {
  object: "webhook_endpoint",
  id: readinessEndpoint,
  livemode: true,
  url: readinessUrl,
  api_version: "2025-03-31.basil",
  status: "disabled",
  enabled_events: [
    "invoice.paid",
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ],
};
const transport = (a = account, h = hook) =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      Response.json(String(input).endsWith("/account") ? a : h),
    );
describe("internal Stripe readiness inspection", () => {
  it("requires a configured key format without exposing the value", async () => {
    const fetcher = transport();
    const data = await inspectStripeReadiness(
      config({ stripeKey: "pending" }),
      fetcher,
    );
    expect(data.stripe_key_configured).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(data)).not.toContain("pending");
  });
  it("uses exactly two canonical GETs with TLS and redirects protected", async () => {
    const fetcher = transport();
    const data = await inspectStripeReadiness(config(), fetcher);
    expect(data.expected_account).toBe(true);
    expect(data.webhook_disabled).toBe(true);
    expect(
      data.webhook_url_matches &&
        data.webhook_id_matches &&
        data.webhook_events_match &&
        data.webhook_api_version_matches,
    ).toBe(true);
    expect(data.signature_delivery_verified).toBe(false);
    expect(data.payment_or_customer_mutations).toBe(0);
    expect(fetcher.mock.calls.map((x) => String(x[0]))).toEqual([
      "https://api.stripe.com/v1/account",
      "https://api.stripe.com/v1/webhook_endpoints/" + readinessEndpoint,
    ]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options?.method).toBe("GET");
      expect(options?.redirect).toBe("error");
    }
  });
  it("does not inspect a production endpoint with a sandbox key", async () => {
    const fetcher = transport();
    const data = await inspectStripeReadiness(
      config({ stripeKey: key("test") }),
      fetcher,
    );
    expect(data.key_mode).toBe("test");
    expect(data.expected_account).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("avoids foreign webhook access and never reflects business data", async () => {
    const fetcher = transport({
      ...account,
      id: "acct_ForeignSynthetic",
      email: "private@example.invalid",
    } as typeof account);
    const data = await inspectStripeReadiness(config(), fetcher);
    expect(data.expected_account).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(data)).not.toContain("private@example.invalid");
  });
  it("supports the existing restricted key without requesting another one", async () => {
    expect(
      (
        await inspectStripeReadiness(
          config({ stripeKey: key("live", "rk") }),
          transport(),
        )
      ).expected_account,
    ).toBe(true);
  });
  it("excludes secrets and PII from successful provider responses", async () => {
    const fetcher = transport(
      {
        ...account,
        secret: key(),
        email: "private@example.invalid",
      } as typeof account,
      { ...hook, secret, unexpected_credentials: key() } as typeof hook,
    );
    const text = JSON.stringify(
      await inspectStripeReadiness(config(), fetcher),
    );
    for (const value of [
      key(),
      secret,
      "private@example.invalid",
      "unexpected_credentials",
    ])
      expect(text).not.toContain(value);
  });
  it("distinguishes rejected credentials from missing configuration without raw bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(key(), { status: 401 }));
    const data = await inspectStripeReadiness(config(), fetcher);
    expect(data.stripe_key_configured).toBe(true);
    expect(data.account_status).toBe(401);
    expect(data.expected_account).toBe(false);
    expect(JSON.stringify(data)).not.toContain(key());
  });
  it("fails closed on oversized, malformed and non-object provider replies", async () => {
    for (const body of ["X".repeat(32769), "not-json", "[]"]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body));
      await expect(inspectStripeReadiness(config(), fetcher)).rejects.toThrow(
        "stripe_readiness_unavailable",
      );
    }
  });
  it("does not propagate a provider error message containing a key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(Error(key()));
    try {
      await inspectStripeReadiness(config(), fetcher);
    } catch (error) {
      expect((error as Error).message).toBe("stripe_readiness_unavailable");
      expect((error as Error).message).not.toContain(key());
    }
  });
  it("coalesces concurrent checks and expires the read-only cache", async () => {
    const report = await inspectStripeReadiness(config(), transport());
    const inspect = vi.fn(async () => report);
    let now = 0;
    const cached = cachedStripeReadiness(inspect, () => now);
    expect(await Promise.all([cached(), cached()])).toEqual([report, report]);
    await cached();
    expect(inspect).toHaveBeenCalledTimes(1);
    now = 60001;
    await cached();
    expect(inspect).toHaveBeenCalledTimes(2);
  });
});
