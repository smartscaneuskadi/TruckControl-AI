import { getSessionVerifiedUser } from "../_shared/auth-session.ts";
import { createLegacyStripeServer } from "../_shared/subscription-legacy-payment-gate.ts";
import { subscriptionFiscalCheckoutAllowed } from "../_shared/subscription-fiscal-gate.ts";
import { manualCheckoutReadiness } from "../_shared/manual-checkout-readiness.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createBillingHandler } from "./handler.ts";
import { canInspectProviderConfiguration } from "../_shared/provider-admin-access.ts";
import {
  cachedStripeReadiness,
  inspectStripeReadiness,
} from "../_shared/stripe-readiness.ts";
import {
  productionBillingOrigin,
  productionBillingOrigins,
} from "../_shared/billing-origins.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const stripeReadiness = cachedStripeReadiness(() =>
  inspectStripeReadiness(
    {
      stripeKey: Deno.env.get("STRIPE_SECRET_KEY"),
      fiscalSigningSecret: Deno.env.get("STRIPE_MANUAL_FISCAL_WEBHOOK_SECRET"),
    },
    fetch,
  ),
);
Deno.serve(
  createBillingHandler(
    {
      manualCheckoutReady: manualCheckoutReadiness(
        (key) => Deno.env.get(key),
        async (account) =>
          await client.rpc("tc_manual_stripe_checkout_ready", {
            p_account: account,
          }),
        "one_time",
      ),
      async authenticate(token) {
        return getSessionVerifiedUser(client, token);
      },
      canInspectProviders: (token) =>
        canInspectProviderConfiguration(client, token),
      stripeReadiness,
      server: createLegacyStripeServer("one_time", async (action, data) => {
        const result = await client.rpc("tc_platform_server", {
          p_action: action,
          p_data: data,
        });
        if (result.error) throw new Error("Billing database operation failed");
        return result.data;
      }),
    },
    {
      appOrigin: productionBillingOrigin(
        Deno.env.get("TRUCKCONTROL_APP_ORIGIN"),
      ),
      allowedOrigins: productionBillingOrigins,
      stripeKey: Deno.env.get("STRIPE_SECRET_KEY"),
      webhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET"),
      invoicingVerified: subscriptionFiscalCheckoutAllowed(Deno.env.get("BILLING_INVOICING_VERIFIED")),
    },
  ),
);
