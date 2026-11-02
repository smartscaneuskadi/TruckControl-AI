import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { validInvoiceAiStates } from "../../../supabase/functions/_shared/invoice-ai.ts";
import type { InvoiceAiState } from "../../../supabase/functions/_shared/invoice-ai.ts";
const messages: Record<string, string> = {
  company_access_denied:
    "Tu cuenta necesita permiso, consentimiento y una empresa activa para solicitar lectura IA.",
  invoice_ai_unavailable:
    "La lectura IA no está disponible ahora. Puedes completar los datos manualmente.",
  invoice_unavailable:
    "La factura no está disponible en esta empresa. Actualiza la bandeja.",
  invoice_already_approved:
    "La factura ya está registrada. No se solicita otra lectura.",
  invoice_ai_already_attempted:
    "Ya se solicitó una lectura de esta factura. No se repetirá el consumo; revisa los datos o complétalos manualmente.",
  invoice_ai_file_too_large:
    "La lectura IA admite originales de hasta 6 MB. Puedes revisar este documento manualmente.",
  invoice_document_invalid:
    "No se ha podido verificar el original. No se ha enviado para esta lectura.",
  invoice_ai_state_changed:
    "La factura ha cambiado o tiene otra solicitud en curso. Actualiza la bandeja.",
  invoice_ai_not_applied:
    "No se han guardado nuevos datos de IA. Comprueba el estado de la factura y tus permisos.",
  invoice_ai_not_completed:
    "No se ha podido confirmar el resultado. Comprueba el estado antes de volver a solicitarlo; no se repite la lectura automáticamente.",
};
async function safeFailure(error: unknown, data?: unknown) {
  let code: unknown =
    data && typeof data === "object" && "error" in data ? data.error : null;
  try {
    if (
      error &&
      typeof error === "object" &&
      "context" in error &&
      error.context instanceof Response
    )
      code = (await error.context.clone().json()).error;
  } catch {
    /* Do not expose remote errors or HTML. */
  }
  return new Error(
    typeof code === "string" && Object.hasOwn(messages, code)
      ? messages[code]
      : "No se ha podido confirmar la lectura IA. Actualiza la bandeja para comprobar su estado.",
  );
}
export async function loadInvoiceAiStates(
  client: SupabaseClient<Database>,
  org: string,
  ids: string[],
  signal?: AbortSignal,
): Promise<{ enabled: boolean; states: InvoiceAiState[] }> {
  const { data, error } = await client.functions.invoke("company-mail", {
    body: {
      action: "invoice_ai_status",
      organization_id: org,
      invoice_ids: ids,
    },
    signal,
  });
  signal?.throwIfAborted();
  if (error) throw await safeFailure(error, data);
  if (
    !data ||
    typeof data.enabled !== "boolean" ||
    !validInvoiceAiStates(data.states, ids) ||
    Object.keys(data).some((k) => !["enabled", "states"].includes(k))
  )
    throw Error(
      "No se ha podido comprobar el estado de lectura IA de estas facturas.",
    );
  return { enabled: data.enabled, states: data.states };
}
export async function analyzeStoredInvoice(
  client: SupabaseClient<Database>,
  org: string,
  id: string,
) {
  const { data, error } = await client.functions.invoke("company-mail", {
    body: {
      action: "analyze_invoice",
      organization_id: org,
      invoice_id: id,
      confirmed: true,
    },
  });
  if (error || data?.analyzed !== true) throw await safeFailure(error, data);
}
