import { z } from "zod";
export const googleClientSchema = z
  .string()
  .trim()
  .max(255)
  .regex(/^468881730124-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/);
export const googleSecretSchema = z
  .string()
  .trim()
  .regex(/^GOCSPX[-_][A-Za-z0-9_-]{16,240}$/);
export function parseGoogleClientFile(text: string) {
  if (new TextEncoder().encode(text).byteLength > 16384)
    throw Error("El archivo supera el máximo de 16 KB.");
  try {
    const value = JSON.parse(text),
      web = value.web;
    if (
      !web ||
      (web.project_id && web.project_id !== "truckcontrolai") ||
      (web.redirect_uris &&
        (!Array.isArray(web.redirect_uris) ||
          !web.redirect_uris.includes(
            "https://truckcontrolai.com/gmail-callback",
          )))
    )
      throw Error();
    return {
      client_id: googleClientSchema.parse(web.client_id),
      client_secret: googleSecretSchema.parse(web.client_secret),
    };
  } catch {
    throw Error(
      "Selecciona el JSON del cliente web de TruckControl con su secreto completo y el retorno correcto.",
    );
  }
}
export const providerStatusSchema = z.object({
  google: z.object({
    client_id: googleClientSchema.nullable(),
    id_valid: z.boolean(),
    secret_valid: z.boolean(),
    configured: z.boolean(),
    vault_available: z.boolean(),
    connections: z.number().int().min(0),
  }),
  auth_mail: z.object({ enabled: z.boolean(), legal_ready: z.boolean() }),
  ai: z.object({
    enabled: z.boolean(),
    monthly_budget_cents: z.number().int().min(0),
  }),
  receiving: z.object({ enabled: z.boolean(), domain: z.string().nullable() }),
  payments_enabled: z.boolean(),
  sms_enabled: z.boolean(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
