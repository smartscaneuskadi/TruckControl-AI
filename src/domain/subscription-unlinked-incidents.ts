import { z } from "zod";

export const UNLINKED_INCIDENT_CONTRACT =
  "subscription-unlinked-incidents-v1" as const;
const uuid = z.uuid(),
  stamp = z.iso.datetime({ offset: true });
const version = z
  .number()
  .int()
  .min(2)
  .max(Number.MAX_SAFE_INTEGER - 1);
const cents = z.number().int().nonnegative().max(100000000);
const providerId = (prefix: string) =>
  z.string().regex(new RegExp("^" + prefix + "_[A-Za-z0-9]{1,200}$"));
const cleanText = (max: number) =>
  z
    .string()
    .trim()
    .min(3)
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f]+$/);
export const unlinkedDeclarationSchema = z.strictObject({
  reason: cleanText(1000),
  evidence_reference: cleanText(240),
});
export type UnlinkedDeclaration = z.infer<typeof unlinkedDeclarationSchema>;
export type UnlinkedAction = "review" | "dismiss";
export const unlinkedObservationSchema = z
  .strictObject({
    event_id: providerId("evt"),
    event_type: z.enum([
      "charge.refunded",
      "refund.created",
      "refund.updated",
      "refund.failed",
      "charge.dispute.created",
      "charge.dispute.updated",
      "charge.dispute.closed",
    ]),
    event_created: stamp,
    object_type: z.enum(["charge", "refund", "dispute"]),
    object_id: z.string().regex(/^(ch|re|dp)_[A-Za-z0-9]{1,200}$/),
    status_at_event: z.string().regex(/^[a-z_]{1,64}$/),
    current_status: z.string().regex(/^[a-z_]{1,64}$/),
    event_amount_cents: cents,
    current_amount_cents: cents,
    charge_amount_refunded_cents: cents,
  })
  .superRefine((item, ctx) => {
    const prefix =
      item.object_type === "charge"
        ? "ch_"
        : item.object_type === "refund"
          ? "re_"
          : "dp_";
    const validType =
      item.object_type === "charge"
        ? item.event_type === "charge.refunded"
        : item.object_type === "refund"
          ? item.event_type.startsWith("refund.")
          : item.event_type.startsWith("charge.dispute.");
    if (!item.object_id.startsWith(prefix) || !validType)
      ctx.addIssue({
        code: "custom",
        message: "Identidad de observación incoherente.",
      });
  });
const linkData = z.strictObject({
  task_id: uuid,
  receipt_event_id: providerId("evt"),
  queued_event_id: providerId("evt"),
});
const linked = linkData.extend({ row_version: version, created_at: stamp });
const action = unlinkedDeclarationSchema.extend({
  kind: z.enum(["review", "dismiss"]),
  actor_id: uuid,
  row_version: version,
  created_at: stamp,
});
export const unlinkedIncidentSchema = z
  .strictObject({
    id: uuid,
    request_id: uuid,
    buyer_company_id: uuid,
    checkout_id: z.string().regex(/^cs_[A-Za-z0-9_]{1,200}$/),
    payment_intent_id: providerId("pi"),
    charge_id: providerId("ch"),
    invoice_id: providerId("in").nullable(),
    subscription_id: providerId("sub").nullable(),
    period_start: stamp.nullable(),
    period_end: stamp.nullable(),
    amount_cents: cents.refine((v) => v >= 100),
    currency: z.literal("EUR"),
    reason: z.literal("payment_task_missing"),
    row_version: version,
    created_at: stamp,
    review_state: z.enum(["pending", "reviewed", "dismissed"]),
    link_state: z.enum(["unlinked", "linked_to_existing_payment"]),
    latest_provider: unlinkedObservationSchema,
    last_action: action.nullable(),
    link: linked.nullable(),
  })
  .superRefine((item, ctx) => {
    if (
      (item.invoice_id === null) !== (item.subscription_id === null) ||
      (item.invoice_id === null) !== (item.period_start === null) ||
      (item.period_start === null) !== (item.period_end === null) ||
      (item.period_start !== null &&
        item.period_end !== null &&
        Date.parse(item.period_end) <= Date.parse(item.period_start)) ||
      (item.link_state === "unlinked") !== (item.link === null) ||
      (item.review_state !== "pending" && !item.last_action) ||
      (item.last_action && item.last_action.row_version > item.row_version) ||
      (item.link && item.link.row_version > item.row_version) ||
      (item.review_state === "reviewed" &&
        item.last_action?.kind !== "review") ||
      (item.review_state === "dismissed" &&
        item.last_action?.kind !== "dismiss")
    )
      ctx.addIssue({
        code: "custom",
        message: "Registro de revisión incoherente.",
      });
  });
export type UnlinkedIncident = z.infer<typeof unlinkedIncidentSchema>;
export const unlinkedCapabilitiesSchema = z.strictObject({
  contract: z.literal(UNLINKED_INCIDENT_CONTRACT),
  available: z.boolean(),
  payment_changes_available: z.literal(false),
  license_changes_available: z.literal(false),
  fiscal_emission_available: z.literal(false),
});
export const unlinkedPageSchema = z.strictObject({
  contract: z.literal(UNLINKED_INCIDENT_CONTRACT),
  items: z.array(unlinkedIncidentSchema).max(50),
  next_cursor: uuid.nullable(),
});
export type UnlinkedPage = z.infer<typeof unlinkedPageSchema>;
export const unlinkedHistoryEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: uuid,
    row_version: version,
    kind: z.literal("provider"),
    actor_id: z.null(),
    created_at: stamp,
    data: unlinkedObservationSchema,
  }),
  z.strictObject({
    id: uuid,
    row_version: version,
    kind: z.literal("linked"),
    actor_id: z.null(),
    created_at: stamp,
    data: linkData,
  }),
  z.strictObject({
    id: uuid,
    row_version: version,
    kind: z.enum(["review", "dismiss"]),
    actor_id: uuid,
    created_at: stamp,
    data: unlinkedDeclarationSchema,
  }),
]);
export const unlinkedHistorySchema = z.strictObject({
  contract: z.literal(UNLINKED_INCIDENT_CONTRACT),
  case_id: uuid,
  items: z.array(unlinkedHistoryEntrySchema).max(50),
  next_before_version: version.nullable(),
});
export type UnlinkedHistory = z.infer<typeof unlinkedHistorySchema>;
export const unlinkedMutationSchema = z.strictObject({
  contract: z.literal(UNLINKED_INCIDENT_CONTRACT),
  case: unlinkedIncidentSchema,
  operation: unlinkedDeclarationSchema.extend({
    id: uuid,
    action: z.enum(["review", "dismiss"]),
    actor_id: uuid,
    expected_version: version,
    applied_version: version,
  }),
});
