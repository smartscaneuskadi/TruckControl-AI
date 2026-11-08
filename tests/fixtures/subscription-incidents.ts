import type { IncidentAction, IncidentInput, IncidentMutation, SubscriptionIncident } from "../../src/domain/subscription-incidents";
export const actorId = "fc640000-0000-4000-8000-000000000001";
export const companyId = "fc640000-0000-4000-8000-000000000002";
export const caseId = "fc640000-0000-4000-8000-000000000003";
export const taskId = "fc640000-0000-4000-8000-000000000004";
export const operationId = "fc640000-0000-4000-8000-000000000005";
export const observationAt = "2026-11-08T09:01:00Z";
export function incident(): SubscriptionIncident {
  return {
    id: caseId, task_id: taskId, buyer_company_id: companyId, buyer_company_name: "Cliente de incidencias ficticio",
    provider_payment_id: "in_incidentSynthetic", provider_invoice_id: "in_incidentSynthetic",
    period_start: "2026-11-01T00:00:00Z", period_end: "2026-12-01T00:00:00Z",
    amount_cents: 36300, currency: "EUR", paid_at: "2026-11-08T08:00:00Z", row_version: 1,
    review_state: "pending", rectification_state: "pending", last_review: null, rectification: null, created_at: observationAt,
    latest_provider: {
      event_id: "evt_incidentSynthetic", event_type: "refund.created", object_id: "re_incidentSynthetic", object_type: "refund",
      status_at_event: "pending", current_status: "pending", event_amount_cents: 12100, current_amount_cents: 12100,
      charge_amount_refunded_cents: 0, extent: "none", event_created: "2026-11-08T09:00:00Z", observed_at: observationAt,
      payment_intent_id: "pi_incidentSynthetic", charge_id: "ch_incidentSynthetic",
    },
  };
}
export function mutation(before: SubscriptionIncident, action: IncidentAction, input: IncidentInput, id = operationId): IncidentMutation {
  const record = { note: input.note, actor_id: actorId, reported_at: "2026-11-08T10:00:00Z", row_version: before.row_version + 1 };
  return {
    contract: "subscription-financial-incidents-v1", replayed: false,
    case: action === "review" ? { ...before, row_version: record.row_version, last_review: record, review_state: "reviewed" }
      : { ...before, row_version: record.row_version, rectification: { ...record, reference: "reference" in input ? input.reference : "" }, rectification_state: "reported" },
    operation: { id, action, expected_version: before.row_version, applied_version: record.row_version,
      actor_id: actorId, reported_at: record.reported_at, note: input.note, reference: "reference" in input ? input.reference : null },
  };
}
export const incidentCapabilities = {
  contract: "subscription-financial-incidents-v1", available: true,
  refunds_available: false, license_changes_available: false, rectification_emission_available: false,
};
