import { getSessionVerifiedUser } from "../_shared/auth-session.ts";
import { createLegacyStripeServer } from "../_shared/subscription-legacy-payment-gate.ts";
import { subscriptionFiscalCheckoutAllowed } from "../_shared/subscription-fiscal-gate.ts";
import { manualCheckoutReadiness } from "../_shared/manual-checkout-readiness.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createRecurringHandler } from "./handler.ts";
import {
  productionBillingOrigin,
  productionBillingOrigins,
} from "../_shared/billing-origins.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
Deno.serve(
  createRecurringHandler(
    {
      manualCheckoutReady: manualCheckoutReadiness(
        (key) => Deno.env.get(key),
        async (account) =>
          await client.rpc("tc_manual_stripe_checkout_ready", {
            p_account: account,
          }),
        "recurring",
      ),
      async authenticate(token) {
        const user = await getSessionVerifiedUser(client, token);
        if (!user) return null;
        // Claims are used only after verification of this exact token. Roles
        // and billing ownership are always checked in the database.
        try {
          const payload = token
            .split(".")[1]
            .replaceAll("-", "+")
            .replaceAll("_", "/");
          const claims = JSON.parse(
            atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")),
          );
          return { id: user.id, session_id: claims.session_id };
        } catch {
          return null;
        }
      },
      async refresh<T>(
        action: "observe" | "commit",
        actor: { id: string; session_id: string },
        operation: string,
        data: Record<string, unknown>,
      ): Promise<T> {
        const result = await client
          .rpc("tc_subscription_snapshot_refresh", {
            p_action: action,
            p_actor: actor.id,
            p_session: actor.session_id,
            p_operation: operation,
            p_data: data,
          })
          .abortSignal(AbortSignal.timeout(5000));
        if (result.error) throw new Error("Subscription refresh unavailable");
        return result.data as T;
      },
      async refreshReady() {
        const result = await client
          .rpc("tc_subscription_snapshot_refresh", {
            p_action: "capabilities",
            p_actor: null,
            p_session: null,
            p_operation: null,
            p_data: {},
          })
          .abortSignal(AbortSignal.timeout(5000));
        return !result.error && result.data?.canonical_refresh === true;
      },
      server: createLegacyStripeServer("recurring", async (action, data) => {
        const result = await client.rpc("tc_recurring_billing", {
          p_action: action,
          p_data: data,
        });
        if (result.error) throw new Error("Billing operation unavailable");
        return result.data;
      }),
    },
    {
      appOrigin: productionBillingOrigin(
        Deno.env.get("TRUCKCONTROL_APP_ORIGIN"),
      ),
      allowedOrigins: productionBillingOrigins,
      enabled: Deno.env.get("BILLING_RECURRING_ENABLED") === "true",
      stripeKey: Deno.env.get("STRIPE_SECRET_KEY"),
      webhookSecret: Deno.env.get("STRIPE_RECURRING_WEBHOOK_SECRET"),
      termsVersion: Deno.env.get("BILLING_TERMS_VERSION"),
      termsUrl: Deno.env.get("BILLING_TERMS_URL"),
      // prettier-ignore
      invoicingVerified: subscriptionFiscalCheckoutAllowed(Deno.env.get("BILLING_INVOICING_VERIFIED")),
      snapshotRefreshAccepted:
        Deno.env.get("TRUCKCONTROL_SUBSCRIPTION_REFRESH_SCHEMA_ACCEPTED") !==
        "false",
    },
  ),
);
