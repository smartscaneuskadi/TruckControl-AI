import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { checkStripeReadiness } from "./stripe-readiness";

const accepted = {
  contract: "truckcontrol-stripe-readiness-v1",
  checked_at: "2026-11-12T22:00:00.000Z",
  stripe_key_configured: true,
  key_mode: "live",
  fiscal_signing_secret_format_valid: true,
  account_checked: true,
  account_status: 200,
  account_id: "acct_1UZSsJCWctKw8slH",
  expected_account: true,
  charges_enabled: true,
  payouts_enabled: true,
  webhook_checked: true,
  webhook_status: 200,
  webhook_id_matches: true,
  webhook_url_matches: true,
  webhook_events_match: true,
  webhook_api_version_matches: true,
  webhook_disabled: true,
  signature_delivery_verified: false,
  payment_or_customer_mutations: 0,
};
function fixture(data: unknown, error: unknown = null) {
  const invoke = vi.fn(async () => ({ data, error }));
  return {
    client: { functions: { invoke } } as unknown as SupabaseClient<Database>,
    invoke,
  };
}
describe("Stripe readiness client contract", () => {
  it("uses the existing authenticated billing service without supplying secrets", async () => {
    const f = fixture(accepted);
    expect(await checkStripeReadiness(f.client)).toEqual(accepted);
    expect(f.invoke).toHaveBeenCalledWith("truckcontrol-billing", {
      body: { action: "admin_readiness" },
    });
  });
  it.each([
    null,
    {},
    { ...accepted, signature_delivery_verified: true },
    { ...accepted, payment_or_customer_mutations: 1 },
    { ...accepted, account_id: "acct_ForeignSynthetic" },
    { ...accepted, secret: "synthetic-private-value" },
    { ...accepted, key_mode: "test" },
  ])("rejects incompatible or overclaiming replies", async (data) => {
    await expect(checkStripeReadiness(fixture(data).client)).rejects.toThrow(
      "resultado válido",
    );
  });
  it("maps authentication failures without displaying raw errors or provider details", async () => {
    const f = fixture(null, {
      context: Response.json(
        {
          error: "platform_admin_required",
          details: "synthetic-private-value",
        },
        { status: 403 },
      ),
    });
    await expect(checkStripeReadiness(f.client)).rejects.toThrow(
      "Solo la administración global",
    );
  });
  it("does not expose unexpected error messages", async () => {
    const f = fixture(null, {
      context: Response.json(
        { error: "synthetic-private-value" },
        { status: 503 },
      ),
    });
    try {
      await checkStripeReadiness(f.client);
    } catch (error) {
      expect((error as Error).message).toBe(
        "No se ha podido comprobar Stripe. Inténtalo de nuevo.",
      );
    }
  });
});
