import { describe, expect, it, vi } from "vitest";
import { persistManualStripePayment } from "../supabase/functions/_shared/subscription-stripe-persistence.ts";
import type { ReconciledStripePayment } from "../supabase/functions/_shared/subscription-stripe-reconciliation.ts";
const proof: Exclude<ReconciledStripePayment,{kind:"ignored"}> = {
  kind:"initial_payment",provider_account_id:"acct_Synthetic",provider_event_id:"evt_Synthetic",
  provider_payment_id:"pi_Synthetic",checkout_id:"cs_test_Synthetic",
  request_id:"ef110000-0000-4000-8000-000000000001",user_id:"ef220000-0000-4000-8000-000000000001",
  company_id:null,amount_cents:36300,currency:"EUR",paid_at:"2026-11-08T09:00:00Z",
  livemode:false,provider_event_type:"checkout.session.completed",provider_event_created:1794128400,
  customer_id:null,
};
const valid = { contract:"manual-stripe-payment-bridge-v1",received:true,duplicate:false,
  task_id:"ef330000-0000-4000-8000-000000000001" };
describe("single-RPC durable Stripe fiscal persistence", () => {
  it("invokes precisely one atomic RPC with typed provider correlation", async () => {
    const rpc=vi.fn(async () => ({data:valid,error:null}));
    await persistManualStripePayment(rpc,proof);
    expect(rpc).toHaveBeenCalledOnce();
    const {kind,provider_account_id,...data}=proof;
    expect(rpc).toHaveBeenCalledWith("tc_manual_subscription_apply_payment", {
      p_kind:kind,p_account:provider_account_id,p_data:data,
    });
  });
  it.each([null,{}, {received:true}, {...valid,contract:"older"}, {...valid,task_id:"other"},
    {...valid,duplicate:undefined}])("rejects missing or malformed durable acknowledgement (%j)", async data => {
    await expect(persistManualStripePayment(async () => ({data,error:null}),proof))
      .rejects.toThrow("atomic_manual_stripe_unavailable");
  });
  it("sanitizes database errors and transport failures without retrying a write", async () => {
    const failing=vi.fn(async () => ({data:valid,error:{message:"private database details"}}));
    await expect(persistManualStripePayment(failing,proof)).rejects.toThrow("atomic_manual_stripe_unavailable");
    expect(failing).toHaveBeenCalledOnce();
    const lost=vi.fn(async () => {throw Error("secret transport details");});
    await expect(persistManualStripePayment(lost,proof)).rejects.toThrow("atomic_manual_stripe_unavailable");
    expect(lost).toHaveBeenCalledOnce();
  });
});
