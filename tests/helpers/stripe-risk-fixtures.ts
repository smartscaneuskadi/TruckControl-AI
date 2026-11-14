import {
  financialFixture,
  financialStamp,
  financialSignature,
  type FinancialObject,
} from "./stripe-financial-fixtures";
import type { StripeRiskSignal } from "../../supabase/functions/_shared/subscription-risk-signals";
import { incidentNow, type PaidFixture } from "./subscription-financial-db";

export function riskFixture(type = "radar.early_fraud_warning.created") {
  const f = financialFixture(type);
  const warning: FinancialObject = {
    id: "issfr_RiskSynthetic",
    object: "radar.early_fraud_warning",
    actionable: true,
    charge: "ch_FinancialOriginal",
    payment_intent: "pi_FinancialOriginal",
    created: financialStamp - 12,
    fraud_type: "misc",
    livemode: false,
    metadata: { private_customer_note: "DO-NOT-COPY-WARNING-NOTE" },
  };
  f.event.data = { object: structuredClone(warning) };
  f.records["radar/early_fraud_warnings/issfr_RiskSynthetic"] = warning;
  return {
    ...f,
    raw: () => JSON.stringify(f.event),
    signature: () => financialSignature(JSON.stringify(f.event)),
  };
}
export function riskObservation(
  p: PaidFixture,
  overrides: Partial<StripeRiskSignal> = {},
): StripeRiskSignal {
  return {
    event_id: "evt_Risk" + p.pi.slice(3),
    event_type: "radar.early_fraud_warning.created",
    event_created: incidentNow - 5,
    warning_id: "issfr_" + p.pi.slice(3),
    warning_created: incidentNow - 6,
    actionable_at_event: true,
    actionable_now: true,
    fraud_type_at_event: "misc",
    fraud_type_now: "misc",
    livemode: false,
    payment_intent_id: p.pi,
    charge_id: p.charge,
    customer_id: p.customer,
    charge_amount_cents: 36300,
    currency: "EUR",
    invoice_id: p.invoice,
    subscription_id: p.subscription,
    invoice_payment_id: p.invoice ? "inpay_" + p.pi.slice(3) : null,
    invoice_period_start: p.periodStart,
    invoice_period_end: p.periodEnd,
    ...overrides,
  };
}
