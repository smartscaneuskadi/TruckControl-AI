import { manualStripeRuntimeAllowed } from "./subscription-stripe-runtime.ts";
import { stripeServerKeyMode } from "./stripe-server-key.ts";

/** Independent release switches plus native, account-specific approval. Read on each new checkout. */
export function manualCheckoutReadiness(
  env: (key: string) => string | undefined,
  readChannel: (account: string) => Promise<{ data: unknown; error: unknown }>,
  channel: "one_time" | "recurring",
) {
  return async (): Promise<boolean> => {
    const account = env("TRUCKCONTROL_MANUAL_STRIPE_ACCOUNT_ID") ?? "";
    if (!manualStripeRuntimeAllowed(env("SUPABASE_URL") ?? "", "live") ||
        env("TRUCKCONTROL_MANUAL_STRIPE_MODE") !== "live" ||
        env("BILLING_INVOICING_VERIFIED") !== "true" ||
        env("TRUCKCONTROL_MANUAL_STRIPE_PIPELINE_ENABLED") !== "true" ||
        env("TRUCKCONTROL_MANUAL_STRIPE_SCHEMA_ACCEPTED") !== "true" ||
        !/^acct_[A-Za-z0-9]+$/.test(account) ||
        stripeServerKeyMode(env("STRIPE_SECRET_KEY")) !== "live" ||
        !/^whsec_[A-Za-z0-9]+$/.test(env("STRIPE_MANUAL_FISCAL_WEBHOOK_SECRET") ?? ""))
      return false;
    if (channel === "recurring" && !/^whsec_[A-Za-z0-9]+$/.test(env("STRIPE_RECURRING_WEBHOOK_SECRET") ?? ""))
      return false;
    try {
      const result = await readChannel(account);
      return !result.error && result.data === true;
    } catch {
      return false;
    }
  };
}
