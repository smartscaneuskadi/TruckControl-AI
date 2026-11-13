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
const configurationState = z.enum([
  "missing",
  "invalid_format",
  "valid_format",
]);
export const stripeReadinessDetailsSchema = z
  .object({
    ...stripeReadinessSchema.shape,
    contract: z.literal("truckcontrol-stripe-readiness-v2"),
    credential_state: configurationState,
    signing_secret_state: configurationState,
  })
  .strict()
  .superRefine((value, ctx) => {
    const {
      credential_state,
      signing_secret_state,
      contract: _,
      ...report
    } = value;
    if (
      !stripeReadinessSchema.safeParse({
        ...report,
        contract: "truckcontrol-stripe-readiness-v1",
      }).success ||
      (credential_state === "valid_format") !== report.stripe_key_configured ||
      (signing_secret_state === "valid_format") !==
        report.fiscal_signing_secret_format_valid ||
      (report.key_mode !== null) !== report.stripe_key_configured ||
      report.account_checked !== (report.account_status !== null) ||
      report.webhook_checked !== (report.webhook_status !== null) ||
      (report.account_checked && !report.stripe_key_configured) ||
      (report.webhook_checked && !report.expected_account)
    )
      ctx.addIssue({
        code: "custom",
        message: "inconsistent_readiness_details",
      });
  });
export type StripeReadinessDiagnostics = Pick<
  z.infer<typeof stripeReadinessDetailsSchema>,
  "credential_state" | "signing_secret_state"
>;

async function invokeReadiness(
  client: SupabaseClient<Database>,
  action: "admin_readiness" | "admin_readiness_details",
) {
  const response = await (async () => {
    try {
      return await client.functions.invoke("truckcontrol-billing", {
        body: { action },
      });
    } catch {
      throw Error("No se ha podido comprobar Stripe. Inténtalo de nuevo.");
    }
  })();
  const { data, error } = response;
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
  return { data, error, code };
}
function ensureReadinessSuccess({
  error,
  code,
}: Awaited<ReturnType<typeof invokeReadiness>>) {
  if (error || code) {
    if (code === "authentication_required")
      throw Error("Vuelve a entrar para comprobar Stripe.");
    if (code === "platform_admin_required")
      throw Error("Solo la administración global puede comprobar Stripe.");
    throw Error("No se ha podido comprobar Stripe. Inténtalo de nuevo.");
  }
}
export async function checkStripeReadiness(
  client: SupabaseClient<Database>,
): Promise<StripeReadiness> {
  const result = await invokeReadiness(client, "admin_readiness");
  ensureReadinessSuccess(result);
  const parsed = stripeReadinessSchema.safeParse(result.data);
  if (!parsed.success)
    throw Error("La comprobación de Stripe no devolvió un resultado válido.");
  return parsed.data;
}

export async function checkStripeReadinessDetails(
  client: SupabaseClient<Database>,
): Promise<{
  report: StripeReadiness;
  diagnostics: StripeReadinessDiagnostics | null;
}> {
  const response = await invokeReadiness(client, "admin_readiness_details");
  // Older deployments reject this action before any provider request. No retry after an uncertain provider error.
  if (response.code === "invalid_request")
    return { report: await checkStripeReadiness(client), diagnostics: null };
  ensureReadinessSuccess(response);
  const result = stripeReadinessDetailsSchema.safeParse(response.data);
  if (!result.success)
    throw Error("La comprobación de Stripe no devolvió un resultado válido.");
  const {
    credential_state,
    signing_secret_state,
    contract: _,
    ...report
  } = result.data;
  return {
    report: { ...report, contract: "truckcontrol-stripe-readiness-v1" },
    diagnostics: { credential_state, signing_secret_state },
  };
}

/** Only fixed, localizable messages. Provider exception text is never rendered. */
export function stripeReadinessMessages(
  report: StripeReadiness,
  diagnostics: StripeReadinessDiagnostics | null,
): string[] {
  const messages: string[] = [];
  if (!diagnostics)
    messages.push(
      "El servidor aún no ofrece el detalle de configuración de Stripe.",
    );
  if (diagnostics?.credential_state === "missing")
    messages.push(
      "Falta guardar la clave de servidor de Stripe en el almacén seguro.",
    );
  if (diagnostics?.credential_state === "invalid_format")
    messages.push(
      "La clave de Stripe guardada no tiene un formato válido. Debe corregirse en el almacén seguro del servidor.",
    );
  if (diagnostics?.signing_secret_state === "missing")
    messages.push("Falta guardar el secreto de firma del receptor de pagos.");
  if (diagnostics?.signing_secret_state === "invalid_format")
    messages.push("El secreto de firma guardado no tiene un formato válido.");
  if (report.key_mode === "test")
    messages.push(
      "El servidor usa una clave de pruebas de Stripe; esta comprobación no habilita cobros reales.",
    );
  if (
    report.key_mode === "live" &&
    report.account_checked &&
    report.account_status === 200 &&
    !report.expected_account
  )
    messages.push(
      "La clave de Stripe pertenece a una cuenta diferente de ELEVADANCOR.",
    );
  if (report.webhook_status === 403)
    messages.push(
      "La clave no permite revisar el receptor de pagos en Stripe.",
    );
  if (
    report.webhook_status === 200 &&
    (!report.webhook_id_matches ||
      !report.webhook_url_matches ||
      !report.webhook_events_match ||
      !report.webhook_api_version_matches)
  )
    messages.push(
      "La configuración del receptor de pagos no coincide con la prevista para TruckControl.",
    );
  return messages;
}
