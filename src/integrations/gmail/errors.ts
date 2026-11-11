const known = new Set([
  "google_client_rejected",
  "google_validation_unavailable",
  "gmail_not_configured",
  "admin_required",
  "invalid_google_credentials",
  "authorization_not_configured",
]);

/** Never show provider response bodies or arbitrary SDK error messages. */
export async function gmailFailureCode(data: unknown, error: unknown) {
  function code(value: unknown) {
    if (!value || typeof value !== "object") return undefined;
    const candidate = (value as { error?: unknown }).error;
    return typeof candidate === "string" && known.has(candidate)
      ? candidate
      : undefined;
  }
  const direct = code(data);
  if (direct) return direct;
  if (error && typeof error === "object" && "context" in error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      try {
        const raw = await response.clone().text();
        if (raw.length <= 4096) return code(JSON.parse(raw));
      } catch {
        /* No remote text is shown. */
      }
    }
  }
  return undefined;
}

export function gmailFailureMessage(code: string | undefined) {
  if (code === "google_client_rejected")
    return t(
      "Google rechaza las credenciales de Gmail empresarial. La administración debe corregir el ID y el secreto del cliente antes de volver a conectar.",
    );
  if (code === "google_validation_unavailable")
    return t(
      "No se ha podido comprobar la configuración con Google. No se ha iniciado una nueva autorización. Vuelve a comprobarla cuando haya conexión.",
    );
  if (code === "gmail_not_configured")
    return t(
      "Falta completar la configuración de Gmail empresarial en Administración → Servicios.",
    );
  if (code === "admin_required")
    return t(
      "Solo la administración global puede comprobar o sustituir estas credenciales.",
    );
  if (code === "invalid_google_credentials")
    return t(
      "Usa el ID del proyecto TruckControl y el secreto completo de ese cliente, sin asteriscos.",
    );
  return t(
    "No se ha podido verificar la configuración de Google. No se han guardado cambios.",
  );
}
import { t } from "../../i18n/runtime";
