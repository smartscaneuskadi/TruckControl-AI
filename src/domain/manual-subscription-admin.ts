import { z } from "zod";

const uuid = z.uuid();
const stamp = z.iso.datetime({ offset: true });
const reference = z.string().trim().min(3).max(200).regex(/^[^\u0000-\u001f\u007f]+$/);
const invoiceReference = z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveVersion = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const manualInvoiceStates = {
  awaiting_issue: "Pendiente de emisión",
  awaiting_send: "Pendiente de envío",
  sent_reported: "Envío declarado",
  needs_review: "Requiere revisión",
} as const;
export const manualReviewReasons = {
  fiscal_issue_uncertain: "Emisión fiscal incierta",
  customer_data_invalid: "Datos del comprador incorrectos",
  amount_mismatch: "Discrepancia de importe",
  dispatch_failure: "Incidencia de envío",
} as const;

export const manualInvoiceCapabilitiesSchema = z.object({
  available: z.boolean(),
  document_upload_ready: z.boolean(),
});
const invoiceSchema = z.object({
  invoice_number: invoiceReference,
  ticketbai_reference: invoiceReference,
  issued_at: stamp,
  pdf_object_key: z.string().max(400),
  pdf_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const dispatchSchema = z.object({
  sent_at: stamp,
  recipient: z.email().max(320),
  reference,
});
export const manualSubscriptionTaskSchema = z.object({
  id: uuid,
  buyer_company_id: uuid,
  buyer_company_name: z.string().min(2).max(100),
  buyer_tax_id: z.string().min(3).max(30),
  buyer_address: z.string().min(5).max(240),
  buyer_email: z.email().max(320),
  buyer_validated: z.boolean(),
  buyer_snapshot_origin: z.enum(["profile_at_intake", "checkout_confirmed", "operator_validated"]),
  provider_payment_id: z.string().regex(/^(in|pi|cs)_[A-Za-z0-9_]{1,200}$/),
  provider_invoice_id: z.string().regex(/^in_[A-Za-z0-9_]{1,200}$/).nullable(),
  period_start: stamp.nullable(),
  period_end: stamp.nullable(),
  amount_cents: integer.positive(),
  net_cents: integer.optional(),
  vat_cents: integer.optional(),
  vat_rate_bps: integer.max(10000).optional(),
  currency: z.literal("EUR"),
  paid_at: stamp,
  status: z.enum(["awaiting_issue", "awaiting_send", "sent_reported", "needs_review"]),
  row_version: positiveVersion,
  invoice: invoiceSchema.nullable(),
  dispatch: dispatchSchema.nullable(),
  review_reason: z.enum(["fiscal_issue_uncertain", "customer_data_invalid", "amount_mismatch", "dispatch_failure"]).nullable(),
}).superRefine((task, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: "custom", message });
  if ((task.period_start === null) !== (task.period_end === null) ||
      (task.period_start !== null && task.period_end !== null &&
       Date.parse(task.period_end) <= Date.parse(task.period_start))) reject("Período de facturación inválido.");
  if (task.provider_invoice_id !== null &&
      (task.provider_payment_id !== task.provider_invoice_id || task.period_start === null || task.period_end === null)) reject("La renovación no tiene identidad y período reconciliados.");
  if (task.provider_invoice_id === null && (task.period_start !== null || task.period_end !== null)) reject("El período requiere su propia factura del procesador.");
  if (task.net_cents !== undefined && task.vat_cents !== undefined &&
      task.net_cents + task.vat_cents !== task.amount_cents) reject("Desglose fiscal incoherente.");
  if ((task.status === "awaiting_send" || task.status === "sent_reported") &&
      (!task.buyer_validated || task.invoice === null)) reject("Falta factura o validación del comprador.");
  if (task.status === "sent_reported" && task.dispatch === null) reject("Falta la declaración de envío.");
  if (task.status === "needs_review" && task.review_reason === null) reject("Falta el motivo de revisión.");
  if (task.invoice) {
    const prefix = "subscription-invoices/" + task.buyer_company_id + "/" + task.id + "/";
    const path = task.invoice.pdf_object_key;
    if (!path.startsWith(prefix) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/.test(path.slice(prefix.length)) ||
        path.includes("//") || path.split("/").some((part) => part === "." || part === "..")) reject("El PDF no pertenece al comprador.");
    if (Date.parse(task.invoice.issued_at) < Date.parse(task.paid_at)) reject("Fecha de emisión incoherente.");
  }
  if (task.dispatch && (!task.invoice ||
      Date.parse(task.dispatch.sent_at) < Date.parse(task.invoice.issued_at) ||
      task.dispatch.recipient !== task.buyer_email)) reject("Declaración de envío incoherente.");
});
export type ManualSubscriptionTask = z.infer<typeof manualSubscriptionTaskSchema>;
export const manualSubscriptionPageSchema = z.object({
  items: z.array(manualSubscriptionTaskSchema).max(50),
  next_cursor: uuid.nullable(),
});
export type ManualSubscriptionPage = z.infer<typeof manualSubscriptionPageSchema>;
export type ManualInvoiceCapabilities = z.infer<typeof manualInvoiceCapabilitiesSchema>;

export const validateBuyerInputSchema = z.strictObject({
  company_name: z.string().trim().min(2).max(100).regex(/^[^\u0000-\u001f\u007f]+$/),
  tax_id: z.string().trim().min(3).max(30).regex(/^[^\u0000-\u001f\u007f]+$/),
  address: z.string().trim().min(5).max(240).regex(/^[^\u0000-\u001f\u007f]+$/),
  email: z.email().max(320),
  evidence_reference: reference,
});
export const registerManualInvoiceInputSchema = z.strictObject({
  invoice_number: invoiceReference,
  ticketbai_reference: invoiceReference,
  issued_at: stamp,
  pdf_object_key: z.string().min(1).max(400),
  pdf_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const reportManualSentInputSchema = dispatchSchema.strict();
export const manualReviewInputSchema = z.strictObject({
  reason: z.enum(["fiscal_issue_uncertain", "customer_data_invalid", "amount_mismatch", "dispatch_failure"]),
});
export type ValidateBuyerInput = z.infer<typeof validateBuyerInputSchema>;
export type RegisterManualInvoiceInput = z.infer<typeof registerManualInvoiceInputSchema>;
export type ReportManualSentInput = z.infer<typeof reportManualSentInputSchema>;
export type ManualReviewInput = z.infer<typeof manualReviewInputSchema>;
export type ManualInvoiceAction = "validate_buyer" | "register_invoice" | "report_sent" | "needs_review";
export type ManualInvoiceInput = ValidateBuyerInput | RegisterManualInvoiceInput | ReportManualSentInput | ManualReviewInput;

export function validateManualInvoiceCommand(
  task: ManualSubscriptionTask,
  action: ManualInvoiceAction,
  value: unknown,
): ManualInvoiceInput {
  if (action === "validate_buyer") {
    if (task.status !== "awaiting_issue") throw Error("Los datos fiscales ya no admiten esta validación.");
    return validateBuyerInputSchema.parse(value);
  }
  if (action === "register_invoice") {
    if (task.status !== "awaiting_issue" || !task.buyer_validated) throw Error("Comprueba primero los datos fiscales del comprador.");
    const input = registerManualInvoiceInputSchema.parse(value);
    const trial = { ...task, status: "awaiting_send" as const, invoice: input };
    manualSubscriptionTaskSchema.parse(trial);
    return input;
  }
  if (action === "report_sent") {
    if (task.status !== "awaiting_send" || !task.invoice) throw Error("La factura fiscal todavía no está registrada.");
    const input = reportManualSentInputSchema.parse(value);
    manualSubscriptionTaskSchema.parse({ ...task, status: "sent_reported", dispatch: input });
    return input;
  }
  if (task.status === "needs_review") throw Error("Actualiza el registro antes de comunicar otra incidencia.");
  return manualReviewInputSchema.parse(value);
}
