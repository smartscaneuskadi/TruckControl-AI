import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "./database.types";
import {
  manualInvoiceCapabilitiesSchema,
  manualSubscriptionPageSchema,
  manualSubscriptionTaskSchema,
  validateManualInvoiceCommand,
} from "../../domain/manual-subscription-admin";
import type { ManualInvoiceAction, ManualSubscriptionTask } from "../../domain/manual-subscription-admin";

function failure(error: { code?: string } | null) {
  return Error(
    error?.code === "40001"
      ? "La solicitud ha cambiado en otro dispositivo. Actualiza y comprueba los datos antes de continuar."
      : error?.code === "42501"
        ? "Solo la administración global autorizada puede consultar o cambiar estas facturas."
        : error?.code === "PGRST202" || error?.code === "42883"
          ? "La facturación del servicio todavía está en preparación. Los cobros permanecen desactivados."
          : "No se ha podido confirmar la operación. Actualiza el listado antes de volver a intentarlo.",
  );
}
async function request(
  client: SupabaseClient<Database>, action: string,
  taskId: string | null = null, expected: number | null = null,
  operationId: string | null = null, input: Json = {},
  after: string | null = null, signal?: AbortSignal,
) {
  const pending = client.rpc("tc_admin_manual_subscription_invoices", {
    p_action: action, p_task_id: taskId, p_expected: expected,
    p_request_id: operationId, p_data: input, p_after: after,
  });
  const { data, error } = await (signal ? pending.abortSignal(signal) : pending);
  if (error || data === null) throw failure(error);
  return data;
}
export async function loadManualInvoiceCapabilities(client: SupabaseClient<Database>, signal?: AbortSignal) {
  return manualInvoiceCapabilitiesSchema.parse(await request(client, "capabilities", null, null, null, {}, null, signal));
}
export async function loadManualSubscriptionInvoices(client: SupabaseClient<Database>, after: string | null = null, signal?: AbortSignal) {
  if (after !== null) z.uuid().parse(after);
  const page = manualSubscriptionPageSchema.parse(await request(client, "list", null, null, null, {}, after, signal));
  const ids = page.items.map((row) => row.id);
  if (new Set(ids).size !== ids.length ||
      ids.some((id, i) => i ? id <= ids[i - 1] : after !== null && id <= after) ||
      (page.next_cursor !== null && page.next_cursor !== ids.at(-1))) {
    throw Error("No se puede confirmar esta página de facturas. Actualiza el listado.");
  }
  return page;
}
export async function mutateManualSubscriptionInvoice(
  client: SupabaseClient<Database>, task: ManualSubscriptionTask,
  action: ManualInvoiceAction, value: unknown, operationId: string,
) {
  z.uuid().parse(operationId);
  task = manualSubscriptionTaskSchema.parse(task);
  const input = validateManualInvoiceCommand(task, action, value);
  const result = z.object({ task: manualSubscriptionTaskSchema, replayed: z.boolean() }).parse(
    await request(client, action, task.id, task.row_version, operationId, input),
  );
  const next = result.task;
  const target = action === "validate_buyer" ? "awaiting_issue" :
    action === "register_invoice" ? "awaiting_send" :
      action === "report_sent" ? "sent_reported" : "needs_review";
  if (next.id !== task.id || next.buyer_company_id !== task.buyer_company_id ||
      next.provider_payment_id !== task.provider_payment_id ||
      next.amount_cents !== task.amount_cents || next.currency !== task.currency ||
      next.row_version < task.row_version + 1 || next.status !== target) {
    throw Error("El servidor no ha confirmado el cambio solicitado. Actualiza antes de continuar.");
  }
  if (action === "validate_buyer") {
    const buyer = input as { company_name: string; tax_id: string; address: string; email: string };
    if (!next.buyer_validated || next.buyer_company_name !== buyer.company_name ||
        next.buyer_tax_id !== buyer.tax_id || next.buyer_address !== buyer.address || next.buyer_email !== buyer.email) {
      throw Error("No se ha confirmado la identidad fiscal indicada. Actualiza la solicitud.");
    }
  }
  return next;
}
