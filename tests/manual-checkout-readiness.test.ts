import { describe, expect, it, vi } from "vitest";
import { manualCheckoutReadiness } from "../supabase/functions/_shared/manual-checkout-readiness.ts";
import { financialDatabase, withDbRole } from "./helpers/subscription-financial-db";

const account = "acct_SyntheticMerchant";
const readyEnv: Record<string, string> = {
  SUPABASE_URL: "https://kkkemaycedexymrpaqtp.supabase.co",
  TRUCKCONTROL_MANUAL_STRIPE_ACCOUNT_ID: account,
  TRUCKCONTROL_MANUAL_STRIPE_MODE: "live",
  BILLING_INVOICING_VERIFIED: "true",
  TRUCKCONTROL_MANUAL_STRIPE_PIPELINE_ENABLED: "true",
  TRUCKCONTROL_MANUAL_STRIPE_SCHEMA_ACCEPTED: "true",
  STRIPE_SECRET_KEY: "rk_live_synthetic",
  STRIPE_MANUAL_FISCAL_WEBHOOK_SECRET: "whsec_synthetic",
};

describe("manual fiscal checkout approval", () => {
  it("requires the live receiver, the issuer decision and the correct channel on every checkout", async () => {
    const env = { ...readyEnv };
    const read = vi.fn().mockResolvedValue({ data: true, error: null });
    const once = manualCheckoutReadiness(k => env[k], read, "one_time");
    const recurring = manualCheckoutReadiness(k => env[k], read, "recurring");
    for (const key of Object.keys(readyEnv)) {
      delete env[key];
      expect(await once()).toBe(false);
      env[key] = readyEnv[key];
    }
    expect(await recurring()).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(await once()).toBe(true);
    expect(read).toHaveBeenCalledWith(account);
    env.STRIPE_RECURRING_WEBHOOK_SECRET = "whsec_syntheticLifecycle";
    expect(await recurring()).toBe(true);
    read.mockResolvedValueOnce({ data: false, error: null }).mockRejectedValueOnce(new Error("unavailable"));
    expect(await once()).toBe(false);
    expect(await once()).toBe(false);
  });

  it("only the service role sees the native readiness of a currently approved live account", async () => {
    const db = await financialDatabase();
    const read = (role: string, merchant = account) => withDbRole(db, role, async () =>
      (await db.query<{ready: boolean}>("select public.tc_manual_stripe_checkout_ready($1) as ready", [merchant])).rows[0].ready);
    try {
      for (const role of ["anon", "authenticated"])
        await expect(read(role)).rejects.toThrow(/permission denied/);
      await db.query("update private.tc_settings set payments_enabled=true where id");
      expect(await read("service_role")).toBe(false);
      await db.query(`insert into private.tc_manual_stripe_channels
        (provider_account_id,mode,enabled,commercial_approved_at,approval_reference)
        values($1,'live',true,now()+interval '1 day','synthetic evidence')`, [account]);
      expect(await read("service_role")).toBe(false);
      await db.query("update private.tc_manual_stripe_channels set commercial_approved_at=now() where provider_account_id=$1", [account]);
      expect(await read("service_role")).toBe(true);
      expect(await read("service_role","acct_other")).toBe(false);
      await db.query("update private.tc_settings set payments_enabled=false where id");
      expect(await read("service_role")).toBe(false);
    } finally { await db.close(); }
  });
});
