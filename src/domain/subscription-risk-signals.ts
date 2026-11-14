import { z } from "zod";

export const RISK_SIGNAL_CONTRACT = "subscription-risk-v1" as const;
const uuid = z.uuid(),
  stamp = z.iso.datetime({ offset: true });
const version = z
  .number()
  .int()
  .min(2)
  .max(Number.MAX_SAFE_INTEGER - 1);
const id = (prefix: string) =>
  z.string().regex(new RegExp("^" + prefix + "_[A-Za-z0-9]{1,200}$"));
const seconds = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const riskReviewInputSchema = z.strictObject({
  note: z
    .string()
    .trim()
    .min(3)
    .max(1000)
    .regex(/^[^\u0000-\u001f\u007f]+$/),
});
const fraudType = z.enum([
  "card_never_received",
  "fraudulent_card_application",
  "made_with_counterfeit_card",
  "made_with_lost_card",
  "made_with_stolen_card",
  "misc",
  "unauthorized_use_of_card",
]);
export const riskProviderSchema = z
  .strictObject({
    event_id: id("evt"),
    event_type: z.enum([
      "radar.early_fraud_warning.created",
      "radar.early_fraud_warning.updated",
    ]),
    event_created: stamp,
    livemode: z.boolean(),
    warning_id: id("issfr"),
    warning_created: stamp,
    actionable_at_event: z.boolean(),
    actionable_now: z.boolean(),
    fraud_type_at_event: fraudType,
    fraud_type_now: fraudType,
    payment_intent_id: id("pi"),
    charge_id: id("ch"),
    customer_id: id("cus").nullable(),
    charge_amount_cents: z.number().int().positive().max(100000000),
    currency: z.literal("EUR"),
    invoice_id: id("in").nullable(),
    subscription_id: id("sub").nullable(),
    invoice_payment_id: id("inpay").nullable(),
    invoice_period_start: seconds.nullable(),
    invoice_period_end: seconds.nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      Date.parse(value.warning_created) > Date.parse(value.event_created) ||
      [
        value.subscription_id,
        value.invoice_payment_id,
        value.invoice_period_start,
        value.invoice_period_end,
      ].some((v) => (v === null) !== (value.invoice_id === null)) ||
      (value.invoice_period_start !== null &&
        value.invoice_period_end !== null &&
        value.invoice_period_end <= value.invoice_period_start)
    )
      ctx.addIssue({
        code: "custom",
        message: "Identidad de observación incoherente.",
      });
  });
export const riskEntrySchema = z
  .strictObject({
    id: uuid,
    row_version: version,
    kind: z.enum(["provider", "review"]),
    actor_id: uuid.nullable(),
    created_at: stamp,
    provider: riskProviderSchema.nullable(),
    note: riskReviewInputSchema.shape.note.nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      value.kind === "provider"
        ? !value.provider || value.actor_id !== null || value.note !== null
        : value.provider !== null ||
          value.actor_id === null ||
          value.note === null
    )
      ctx.addIssue({
        code: "custom",
        message: "Entrada de auditoría incoherente.",
      });
  });
export type RiskEntry = z.infer<typeof riskEntrySchema>;
export const riskSignalCaseSchema = z
  .strictObject({
    id: uuid,
    task_id: uuid,
    buyer_company_id: uuid,
    buyer_company_name: z.string().min(2).max(100),
    provider_payment_id: z.string().regex(/^(pi|in)_[A-Za-z0-9]{1,200}$/),
    invoice_id: id("in").nullable(),
    period_start: stamp.nullable(),
    period_end: stamp.nullable(),
    amount_cents: z.number().int().positive().max(100000000),
    currency: z.literal("EUR"),
    mode: z.enum(["test", "live"]),
    warning_id: id("issfr"),
    row_version: version,
    created_at: stamp,
    review_state: z.enum(["pending", "reviewed"]),
    latest_provider: riskEntrySchema,
    last_review: riskEntrySchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const p = value.latest_provider.provider,
      r = value.last_review;
    if (
      !p ||
      value.latest_provider.kind !== "provider" ||
      p.warning_id !== value.warning_id ||
      p.charge_amount_cents !== value.amount_cents ||
      p.invoice_id !== value.invoice_id ||
      p.livemode !== (value.mode === "live") ||
      value.latest_provider.row_version > value.row_version ||
      (r !== null &&
        (r.kind !== "review" || r.row_version > value.row_version)) ||
      (value.review_state === "reviewed") !==
        (r !== null && r.row_version > value.latest_provider.row_version) ||
      [value.period_start, value.period_end].some(
        (v) => (v === null) !== (value.invoice_id === null),
      ) ||
      value.provider_payment_id !== (value.invoice_id ?? p.payment_intent_id) ||
      (value.period_start !== null &&
        value.period_end !== null &&
        (Date.parse(value.period_end) <= Date.parse(value.period_start) ||
          Date.parse(value.period_start) / 1000 !== p.invoice_period_start ||
          Date.parse(value.period_end) / 1000 !== p.invoice_period_end))
    )
      ctx.addIssue({
        code: "custom",
        message: "Registro de señal incoherente.",
      });
  });
export type RiskSignalCase = z.infer<typeof riskSignalCaseSchema>;
export const riskCapabilitiesSchema = z.strictObject({
  contract: z.literal(RISK_SIGNAL_CONTRACT),
  available: z.boolean(),
  informational_only: z.literal(true),
  refunds_available: z.literal(false),
  license_changes_available: z.literal(false),
  fiscal_emission_available: z.literal(false),
});
export const riskPageSchema = z.strictObject({
  contract: z.literal(RISK_SIGNAL_CONTRACT),
  items: z.array(riskSignalCaseSchema).max(50),
  next_cursor: uuid.nullable(),
});
export type RiskPage = z.infer<typeof riskPageSchema>;
export const riskHistorySchema = z.strictObject({
  contract: z.literal(RISK_SIGNAL_CONTRACT),
  case_id: uuid,
  items: z.array(riskEntrySchema).max(50),
  next_before_version: version.nullable(),
});
export type RiskHistory = z.infer<typeof riskHistorySchema>;
export const riskMutationSchema = z.strictObject({
  contract: z.literal(RISK_SIGNAL_CONTRACT),
  case: riskSignalCaseSchema,
  replayed: z.boolean(),
  operation: z.strictObject({
    id: uuid,
    actor_id: uuid,
    expected_version: version,
    applied_version: version,
    note: riskReviewInputSchema.shape.note,
  }),
});
/** Stable binding across replies. A later observation may change, never the owned payment. */
export function sameRiskBinding(a: RiskSignalCase, b: RiskSignalCase) {
  const fields = [
    "id",
    "task_id",
    "buyer_company_id",
    "provider_payment_id",
    "invoice_id",
    "period_start",
    "period_end",
    "amount_cents",
    "currency",
    "mode",
    "warning_id",
    "created_at",
  ] as const;
  const p = a.latest_provider.provider,
    q = b.latest_provider.provider;
  return (
    fields.every((key) => a[key] === b[key]) &&
    p?.payment_intent_id === q?.payment_intent_id &&
    p?.charge_id === q?.charge_id
  );
}
