import { describe, expect, it, vi } from "vitest";
import {
  createBillingHandler,
  type BillingGateway,
} from "../supabase/functions/truckcontrol-billing/handler";
import {
  canInspectProviderConfiguration,
  type ProviderPermissionClient,
} from "../supabase/functions/_shared/provider-admin-access";
import type { StripeReadinessReport } from "../supabase/functions/_shared/stripe-readiness";

const origin = "https://truckcontrolai.com";
function fixture(authorized = true) {
  const report = {
    contract: "truckcontrol-stripe-readiness-v1",
  } as StripeReadinessReport;
  const gateway: BillingGateway = {
    authenticate: vi.fn(async (token) =>
      token === "synthetic-session"
        ? { id: "10000000-0000-4000-8000-000000000001" }
        : null,
    ),
    server: vi.fn(async () => {
      throw Error("Payment writes forbidden in readiness check");
    }),
    canInspectProviders: vi.fn(async () => authorized),
    stripeReadiness: vi.fn(async () => report),
  };
  const fetcher = vi.fn<typeof fetch>();
  const handle = createBillingHandler(
    gateway,
    { appOrigin: origin, invoicingVerified: false },
    fetcher,
  );
  return { gateway, fetcher, handle };
}
const request = (
  token = "synthetic-session",
  body: unknown = { action: "admin_readiness" },
  from = origin,
) =>
  new Request("https://project.example/functions/v1/truckcontrol-billing", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      Origin: from,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("private billing readiness action", () => {
  it("requires a live verified human session before the role check", async () => {
    const f = fixture();
    expect((await f.handle(request("expired"))).status).toBe(401);
    expect(f.gateway.canInspectProviders).not.toHaveBeenCalled();
    expect(f.gateway.stripeReadiness).not.toHaveBeenCalled();
  });
  it("denies company accounts before inspecting any credential", async () => {
    const f = fixture(false);
    expect((await f.handle(request())).status).toBe(403);
    expect(f.gateway.stripeReadiness).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("keeps the route closed when the new authorization adapter is absent", async () => {
    const f = fixture();
    delete f.gateway.canInspectProviders;
    expect((await f.handle(request())).status).toBe(403);
    expect(f.gateway.stripeReadiness).not.toHaveBeenCalled();
  });
  it("rechecks role authorization even when a readiness result was previously cached", async () => {
    const f = fixture();
    expect((await f.handle(request())).status).toBe(200);
    vi.mocked(f.gateway.canInspectProviders!).mockResolvedValue(false);
    expect((await f.handle(request())).status).toBe(403);
    expect(f.gateway.stripeReadiness).toHaveBeenCalledTimes(1);
  });
  it("rejects origins and configuration parameters without reading Stripe", async () => {
    const f = fixture();
    expect(
      (
        await f.handle(
          request(
            "synthetic-session",
            { action: "admin_readiness" },
            "https://foreign.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await f.handle(
          request("synthetic-session", {
            action: "admin_readiness",
            payments_enabled: true,
          }),
        )
      ).status,
    ).toBe(400);
    expect(f.gateway.stripeReadiness).not.toHaveBeenCalled();
  });
  it("permits only an admin read while all checkout controls remain closed", async () => {
    const f = fixture();
    const response = await f.handle(request());
    expect(response.status).toBe(200);
    expect(f.gateway.canInspectProviders).toHaveBeenCalledWith(
      "synthetic-session",
    );
    expect(f.gateway.server).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("returns a fixed failure when an internal inspector throws secret-bearing text", async () => {
    const f = fixture();
    vi.mocked(f.gateway.stripeReadiness!).mockRejectedValue(
      Error("synthetic-private-provider-content"),
    );
    const response = await f.handle(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "stripe_readiness_unavailable",
    });
  });
});

describe("provider permission adapter", () => {
  it("pins the caller's JWT rather than relying on a shared service session", async () => {
    const setHeader = vi.fn(async () => ({
      data: { google: { vault_available: false } },
      error: null,
    }));
    const rpc = vi.fn(() => ({ setHeader }));
    expect(
      await canInspectProviderConfiguration({ rpc }, "synthetic-human-token"),
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith("tc_provider_control", {
      p_action: "status",
      p_data: {},
    });
    expect(setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer synthetic-human-token",
    );
  });
  it("rejects denied, stale, malformed and partial permission responses", async () => {
    for (const value of [
      { data: null, error: { code: "42501" } },
      { data: {}, error: null },
      { data: { google: { vault_available: true } }, error: undefined },
      { data: { google: { vault_available: "true" } }, error: null },
    ]) {
      const client = {
        rpc: () => ({ setHeader: async () => value }),
      } as unknown as ProviderPermissionClient;
      expect(
        await canInspectProviderConfiguration(client, "synthetic-session"),
      ).toBe(false);
    }
  });
});
