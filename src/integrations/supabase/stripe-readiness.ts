import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const stripeReadinessSchema = z
  .object({
    contract: z.literal("truckcontrol-stripe-readiness-v1"),
    checked_at: z.string().datetime({ offset: true }),
    stripe_key_configured: z.boolean(),
    key_mode: z.enum(["live", "test"]).nullable(),
    fiscal_signing_secret_format_valid: z.boolean(),
    account_checked: z.boolean(),
    account_status: z.number().int().min(100).max(599).nullable(),
    account_id: z
      .string()
      .regex(/^acct_[A-Za-z0-9]{1,100}$/)
      .nullable(),
    expected_account: z.boolean(),
    charges_enabled: z.boolean(),
    payouts_enabled: z.boolean(),
    webhook_checked: z.boolean(),
    webhook_status: z.number().int().min(100).max(599).nullable(),
    webhook_id_matches: z.boolean(),
    webhook_url_matches: z.boolean(),
    webhook_events_match: z.boolean(),
    webhook_api_version_matches: z.boolean(),
    webhook_disabled: z.boolean().nullable(),
    signature_delivery_verified: z.literal(false),
    payment_or_customer_mutations: z.literal(0),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.expected_account &&
      (!data.account_checked ||
        data.account_status !== 200 ||
        data.account_id !== "acct_1UZSsJCWctKw8slH" ||
        data.key_mode !== "live")
    )
      ctx.addIssue({ code: "custom", message: "inconsistent_account" });
    if (
      (data.webhook_id_matches ||
        data.webhook_url_matches ||
        data.webhook_events_match ||
        data.webhook_api_version_matches) &&
      (!data.webhook_checked ||
        data.webhook_status !== 200 ||
        !data.expected_account)
    )
      ctx.addIssue({ code: "custom", message: "inconsistent_webhook" });
  });
export type StripeReadiness = z.infer<typeof stripeReadinessSchema>;

export async function checkStripeReadiness(
  client: SupabaseClient<Database>,
): Promise<StripeReadiness> {
  const { data, error } = await client.functions.invoke(
    "truckcontrol-billing",
    { body: { action: "admin_readiness" } },
  );
  let code = typeof data?.error === "string" ? data.error : null;
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const value = await context.clone().json();
        code = typeof value?.error === "string" ? value.error : code;
      } catch {
        /* Fixed safe message below. */
      }
    }
  }
  if (error || code) {
    if (code === "authentication_required")
      throw Error("Vuelve a entrar para comprobar Stripe.");
    if (code === "platform_admin_required")
      throw Error("Solo la administración global puede comprobar Stripe.");
    throw Error("No se ha podido comprobar Stripe. Inténtalo de nuevo.");
  }
  const result = stripeReadinessSchema.safeParse(data);
  if (!result.success)
    throw Error("La comprobación de Stripe no devolvió un resultado válido.");
  return result.data;
}
