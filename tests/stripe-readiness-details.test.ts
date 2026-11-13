import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import {
  inspectStripeReadiness,
  describeStripeReadiness,
} from "../supabase/functions/_shared/stripe-readiness";
import {
  createBillingHandler,
  type BillingGateway,
} from "../supabase/functions/truckcontrol-billing/handler";
import {
  checkStripeReadinessDetails,
  stripeReadinessDetailsSchema,
  stripeReadinessMessages,
} from "../src/integrations/supabase/stripe-readiness";

const key = ["rk", "live", "synthetic", "A".repeat(32)].join("_");
const signing = ["whsec", "B".repeat(32)].join("_");
async function fixture(
  stripeKey: string | undefined = undefined,
  fiscalSigningSecret: string | undefined = undefined,
) {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(
      { error: { message: "private-provider-error" } },
      { status: 401 },
    ),
  );
  const config = { stripeKey, fiscalSigningSecret };
  const legacy = await inspectStripeReadiness(config, fetcher);
  return { legacy, details: describeStripeReadiness(legacy, config), fetcher };
}
const client = (invoke: ReturnType<typeof vi.fn>) =>
  ({ functions: { invoke } }) as unknown as SupabaseClient<Database>;
const request = (action = "admin_readiness_details", extras = {}) =>
  new Request("https://edge.example/truckcontrol-billing", {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic-session",
      Origin: "https://truckcontrolai.com",
    },
    body: JSON.stringify({ action, ...extras }),
  });

describe("private configuration diagnostics without credential disclosure", () => {
  it.each([
    undefined,
    "",
    "STRIPE_SECRET_KEY",
    "pending",
    "pk_live_public",
    "not-a-key",
    '"quoted-config"',
  ])(
    "distinguishes missing and invalid configuration without contacting a provider",
    async (value) => {
      const f = await fixture(value);
      expect(f.details.credential_state).toBe(
        value ? "invalid_format" : "missing",
      );
      expect(f.details.signing_secret_state).toBe("missing");
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(stripeReadinessDetailsSchema.safeParse(f.details).success).toBe(
        true,
      );
      expect(Object.keys(f.details).sort()).toEqual(
        [
          ...Object.keys(f.legacy).filter((k) => k !== "contract"),
          "contract",
          "credential_state",
          "signing_secret_state",
        ].sort(),
      );
    },
  );
  it("keeps key format separate from Stripe acceptance and delivery", async () => {
    const f = await fixture(key, signing);
    expect(f.details.credential_state).toBe("valid_format");
    expect(f.details.signing_secret_state).toBe("valid_format");
    expect(f.details.account_status).toBe(401);
    expect(f.details.expected_account).toBe(false);
    expect(f.details.signature_delivery_verified).toBe(false);
    expect(f.details.payment_or_customer_mutations).toBe(0);
    expect(JSON.stringify(f.details)).not.toContain(key);
    expect(JSON.stringify(f.details)).not.toContain(signing);
    expect(JSON.stringify(f.details)).not.toContain("private-provider-error");
  });
  it("refuses conflicting cached configuration instead of reporting a false success", async () => {
    const f = await fixture();
    expect(() => describeStripeReadiness(f.legacy, { stripeKey: key })).toThrow(
      "stripe_readiness_unavailable",
    );
  });
});

describe("diagnostic route preserves the existing verified admin boundary", () => {
  async function handler(allowed = true, authenticated = true) {
    const f = await fixture();
    const gateway: BillingGateway = {
      authenticate: vi.fn(async () =>
        authenticated ? { id: "10000000-0000-4000-8000-000000000001" } : null,
      ),
      canInspectProviders: vi.fn(async () => allowed),
      stripeReadiness: vi.fn(async () => f.legacy),
      stripeReadinessDetails: vi.fn(async () => f.details),
      server: vi.fn(async () => {
        throw Error("No writes allowed");
      }),
    };
    return {
      gateway,
      handle: createBillingHandler(gateway, {
        appOrigin: "https://truckcontrolai.com",
        invoicingVerified: false,
      }),
    };
  }
  it.each([
    [false, true, 403],
    [true, false, 401],
  ])(
    "rejects unverified sessions or non-admin users",
    async (allowed, authenticated, status) => {
      const f = await handler(Boolean(allowed), Boolean(authenticated));
      expect((await f.handle(request())).status).toBe(status);
      expect(f.gateway.stripeReadinessDetails).not.toHaveBeenCalled();
      expect(f.gateway.stripeReadiness).not.toHaveBeenCalled();
    },
  );
  it("returns the exact old v1 shape to existing clients and details only on opt-in", async () => {
    const f = await handler();
    const old = await (await f.handle(request("admin_readiness"))).json();
    expect(old.contract).toBe("truckcontrol-stripe-readiness-v1");
    expect(old.credential_state).toBeUndefined();
    expect((await (await f.handle(request())).json()).contract).toBe(
      "truckcontrol-stripe-readiness-v2",
    );
    expect(f.gateway.server).not.toHaveBeenCalled();
  });
  it("rejects injected configuration and incomplete adapters before inspection", async () => {
    const f = await handler();
    expect(
      (
        await f.handle(
          request("admin_readiness_details", { stripeKey: "private-value" }),
        )
      ).status,
    ).toBe(400);
    delete f.gateway.stripeReadinessDetails;
    expect((await f.handle(request())).status).toBe(503);
    expect(f.gateway.stripeReadiness).not.toHaveBeenCalled();
  });
  it("does not leak internal provider errors", async () => {
    const f = await handler();
    vi.mocked(f.gateway.stripeReadinessDetails!).mockRejectedValue(
      Error("private-value"),
    );
    const result = await f.handle(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      error: "stripe_readiness_unavailable",
    });
  });
});

describe("versioned client support and operator messages", () => {
  it("hides a rejected transport exception and never retries the request", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValue(new Error("private transport detail"));
    await expect(checkStripeReadinessDetails(client(invoke))).rejects.toThrow(
      "No se ha podido comprobar Stripe. Inténtalo de nuevo.",
    );
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("requests opt-in diagnostics and returns only a validated local projection", async () => {
    const f = await fixture("invalid-private-value", signing);
    const invoke = vi.fn(async () => ({ data: f.details, error: null }));
    const result = await checkStripeReadinessDetails(client(invoke));
    expect(invoke).toHaveBeenCalledWith("truckcontrol-billing", {
      body: { action: "admin_readiness_details" },
    });
    expect(result.report).toEqual(f.legacy);
    expect(result.diagnostics?.credential_state).toBe("invalid_format");
    expect(
      stripeReadinessMessages(result.report, result.diagnostics).join(" "),
    ).toContain("no tiene un formato válido");
    expect(JSON.stringify(result)).not.toContain("invalid-private-value");
  });
  it("uses legacy support only when the old server explicitly rejects the unknown action", async () => {
    const f = await fixture();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          context: Response.json({ error: "invalid_request" }, { status: 400 }),
        },
      })
      .mockResolvedValueOnce({ data: f.legacy, error: null });
    const result = await checkStripeReadinessDetails(client(invoke));
    expect(result.diagnostics).toBeNull();
    expect(invoke.mock.calls.map((c) => c[1].body.action)).toEqual([
      "admin_readiness_details",
      "admin_readiness",
    ]);
    expect(
      stripeReadinessMessages(result.report, result.diagnostics),
    ).toContain(
      "El servidor aún no ofrece el detalle de configuración de Stripe.",
    );
  });
  it.each([
    "authentication_required",
    "platform_admin_required",
    "stripe_readiness_unavailable",
    "private-value",
  ])(
    "never retries provider/authentication failures as a legacy call",
    async (error) => {
      const invoke = vi.fn(async () => ({ data: { error }, error: null }));
      await expect(
        checkStripeReadinessDetails(client(invoke)),
      ).rejects.toThrow();
      expect(invoke).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects additional fields, contradictory format flags and delivery overclaims", async () => {
    const f = await fixture();
    for (const data of [
      { ...f.details, secret: key },
      { ...f.details, credential_state: "valid_format" },
      { ...f.details, signature_delivery_verified: true },
    ])
      expect(stripeReadinessDetailsSchema.safeParse(data).success).toBe(false);
  });
  it("uses fixed operator messages for sandbox mode, foreign accounts and webhook permissions", async () => {
    const { legacy } = await fixture();
    expect(
      stripeReadinessMessages({ ...legacy, key_mode: "test" }, null).join(" "),
    ).toContain("clave de pruebas");
    expect(
      stripeReadinessMessages(
        {
          ...legacy,
          key_mode: "live",
          account_checked: true,
          account_status: 200,
        },
        null,
      ).join(" "),
    ).toContain("cuenta diferente");
    expect(
      stripeReadinessMessages({ ...legacy, webhook_status: 403 }, null).join(
        " ",
      ),
    ).toContain("no permite revisar");
  });
});
