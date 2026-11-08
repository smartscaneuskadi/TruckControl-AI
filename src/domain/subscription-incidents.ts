import { z } from "zod";

export const SUBSCRIPTION_INCIDENT_CONTRACT = "subscription-financial-incidents-v1" as const;
const uuid = z.uuid();
const stamp = z.iso.datetime({ offset: true });
const version = z.number().int().min(2).max(Number.MAX_SAFE_INTEGER - 1);
const cents = z.number().int().nonnegative().max(100000000);
const text = (min: number, max: number) => z.string().trim().min(min).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);
const payment = z.string().regex(/^(pi|in|cs)_[A-Za-z0-9_]{1,200}$/);
const providerStatus = z.string().regex(/^[a-z_]{1,64}$/);
export const incidentExtentLabels = {
  none: "Sin importe observado en este evento",
  partial: "Alcance parcial comunicado",
  full: "Alcance total comunicado",
  mismatch: "Importes por contrastar",
} as const;
export const incidentProviderSchema = z.object({
  event_id: z.string().regex(/^evt_[A-Za-z0-9_]{1,200}$/),
  event_type: z.string().regex(/^[a-z._]{3,80}$/),
  object_id: z.string().regex(/^(re|dp|ch)_[A-Za-z0-9_]{1,200}$/),
  object_type: z.enum(["refund", "dispute", "charge"]),
  status_at_event: providerStatus,
  current_status: providerStatus,
  event_amount_cents: cents,
  current_amount_cents: cents,
  charge_amount_refunded_cents: cents,
  extent: z.enum(["none", "partial", "full", "mismatch"]),
  event_created: stamp,
  observed_at: stamp,
  payment_intent_id: z.string().regex(/^pi_[A-Za-z0-9_]{1,200}$/),
  charge_id: z.string().regex(/^ch_[A-Za-z0-9_]{1,200}$/),
}).superRefine((p, ctx) => {
  const prefix = p.object_type === "refund" ? "re_" : p.object_type === "dispute" ? "dp_" : "ch_";
  if (!p.object_id.startsWith(prefix)) ctx.addIssue({ code: "custom", message: "Identidad de observación incoherente." });
});
const operatorSchema = z.object({
  note: text(3, 1000), actor_id: uuid, reported_at: stamp, row_version: version,
});
export const incidentRectificationSchema = operatorSchema.extend({ reference: text(1, 200) });
export const subscriptionIncidentSchema = z.object({
  id: uuid, task_id: uuid, buyer_company_id: uuid, buyer_company_name: text(2, 100),
  provider_payment_id: payment,
  provider_invoice_id: z.string().regex(/^in_[A-Za-z0-9_]{1,200}$/).nullable(),
  period_start: stamp.nullable(), period_end: stamp.nullable(),
  amount_cents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal("EUR"), paid_at: stamp, row_version: version,
  review_state: z.enum(["pending", "reviewed"]),
  rectification_state: z.enum(["pending", "reported"]),
  latest_provider: incidentProviderSchema,
  last_review: operatorSchema.nullable(),
  rectification: incidentRectificationSchema.nullable(), created_at: stamp,
}).superRefine((item, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if ((item.period_start === null) !== (item.period_end === null)) invalid("Período incompleto.");
  if (item.provider_invoice_id !== null && (item.provider_payment_id !== item.provider_invoice_id ||
      item.period_start === null || item.period_end === null)) invalid("Identidad de renovación incoherente.");
  if (item.provider_invoice_id === null && item.period_start !== null) invalid("Período sin identidad de renovación.");
  if (item.period_start && item.period_end && Date.parse(item.period_end) <= Date.parse(item.period_start)) invalid("Período incoherente.");
  if (item.review_state === "reviewed" && !item.last_review) invalid("Falta la revisión declarada.");
  if (item.rectification_state === "reported" && !item.rectification) invalid("Falta la referencia declarada.");
  if ((item.last_review && item.last_review.row_version > item.row_version) ||
      (item.rectification && item.rectification.row_version > item.row_version)) invalid("Versión de actuación incoherente.");
});
export type SubscriptionIncident = z.infer<typeof subscriptionIncidentSchema>;
export type IncidentProvider = z.infer<typeof incidentProviderSchema>;
export const incidentCapabilitiesSchema = z.object({
  contract: z.literal(SUBSCRIPTION_INCIDENT_CONTRACT), available: z.boolean(),
  refunds_available: z.literal(false), license_changes_available: z.literal(false),
  rectification_emission_available: z.literal(false),
});
export type IncidentCapabilities = z.infer<typeof incidentCapabilitiesSchema>;
export const incidentPageSchema = z.object({
  contract: z.literal(SUBSCRIPTION_INCIDENT_CONTRACT),
  items: z.array(subscriptionIncidentSchema).max(50), next_cursor: uuid.nullable(),
});
export type IncidentPage = z.infer<typeof incidentPageSchema>;
export const incidentEntrySchema = z.object({
  id: uuid, row_version: version, kind: z.enum(["provider", "review", "rectification_report"]),
  actor_id: uuid.nullable(), created_at: stamp, provider: incidentProviderSchema.nullable(),
  note: text(3, 1000).nullable(), reference: text(1, 200).nullable(),
}).superRefine((entry, ctx) => {
  if (entry.kind === "provider" ? !entry.provider || entry.actor_id !== null || entry.note !== null || entry.reference !== null
    : entry.provider !== null || entry.actor_id === null || entry.note === null ||
      (entry.kind === "review" ? entry.reference !== null : entry.reference === null)) {
    ctx.addIssue({ code: "custom", message: "Entrada de auditoría incoherente." });
  }
});
export const incidentHistorySchema = z.object({
  contract: z.literal(SUBSCRIPTION_INCIDENT_CONTRACT), case_id: uuid,
  items: z.array(incidentEntrySchema).max(50), next_before_version: version.nullable(),
});
export type IncidentHistory = z.infer<typeof incidentHistorySchema>;
export const incidentReviewInputSchema = z.strictObject({ note: text(3, 1000) });
export const incidentRectificationInputSchema = z.strictObject({ reference: text(1, 200), note: text(3, 1000) });
export type IncidentAction = "review" | "report_rectification";
export type IncidentInput = z.infer<typeof incidentReviewInputSchema> | z.infer<typeof incidentRectificationInputSchema>;
export function incidentInput(action: IncidentAction, value: unknown): IncidentInput {
  return action === "review" ? incidentReviewInputSchema.parse(value) : incidentRectificationInputSchema.parse(value);
}
export const incidentOperationSchema = z.object({
  id: uuid, action: z.enum(["review", "report_rectification"]), expected_version: version, applied_version: version,
  actor_id: uuid, reported_at: stamp, note: text(3, 1000), reference: text(1, 200).nullable(),
});
export const incidentMutationSchema = z.object({
  contract: z.literal(SUBSCRIPTION_INCIDENT_CONTRACT), case: subscriptionIncidentSchema,
  replayed: z.boolean(), operation: incidentOperationSchema,
});
export type IncidentMutation = z.infer<typeof incidentMutationSchema>;
export function checkedIncidentMutation(
  value: unknown, before: SubscriptionIncident, action: IncidentAction,
  input: IncidentInput, operationId: string, actorId: string,
): IncidentMutation {
  const result = incidentMutationSchema.parse(value), next = result.case, operation = result.operation;
  const ref = "reference" in input ? input.reference : null;
  if (next.id !== before.id || next.task_id !== before.task_id || next.buyer_company_id !== before.buyer_company_id ||
      next.provider_payment_id !== before.provider_payment_id || next.provider_invoice_id !== before.provider_invoice_id ||
      next.period_start !== before.period_start || next.period_end !== before.period_end ||
      next.amount_cents !== before.amount_cents || next.currency !== before.currency || next.paid_at !== before.paid_at ||
      operation.id !== operationId || operation.actor_id !== actorId || operation.action !== action ||
      operation.expected_version !== before.row_version || operation.applied_version !== before.row_version + 1 ||
      operation.note !== input.note || operation.reference !== ref ||
      next.row_version < operation.applied_version || (!result.replayed && next.row_version !== operation.applied_version)) {
    throw Error("No se puede confirmar esta actuación administrativa.");
  }
  if (!result.replayed) {
    const reported = action === "review" ? next.last_review : next.rectification;
    if (!reported || reported.actor_id !== actorId || reported.row_version !== operation.applied_version ||
        reported.note !== input.note || Date.parse(reported.reported_at) !== Date.parse(operation.reported_at) ||
        (action === "review" ? next.review_state !== "reviewed"
          : next.rectification_state !== "reported" || !("reference" in reported) || reported.reference !== ref)) {
      throw Error("La declaración no coincide con la confirmación del servidor.");
    }
  }
  return result;
}
