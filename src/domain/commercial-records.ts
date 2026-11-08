import { z } from "zod";
import { dateSchema } from "./models";

const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const supplierFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  tax_id: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .transform((v) => v.toUpperCase()),
  email: z.union([z.literal(""), z.email().max(254)]),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(240),
  notes: z.string().trim().max(500),
  archived: z.boolean(),
});
export type SupplierFields = z.infer<typeof supplierFieldsSchema>;
export const emptySupplier: SupplierFields = {
  name: "",
  tax_id: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  archived: false,
};
export const supplierSchema = z.strictObject({
  ...supplierFieldsSchema.shape,
  id: z.uuid(),
  organization_id: z.uuid(),
  row_version: version,
  created_at: timestamp,
  updated_at: timestamp,
});
export type Supplier = z.infer<typeof supplierSchema>;
export const supplierPageSchema = z.strictObject({
  schema_version: z.literal(1),
  organization_id: z.uuid(),
  rows: z.array(supplierSchema).max(200),
});
export const supplierResponseSchema = z.strictObject({
  schema_version: z.literal(1),
  organization_id: z.uuid(),
  row: supplierSchema,
});
export const tripFinanceLinkSchema = z.strictObject({
  organization_id: z.uuid(),
  entry_id: z.uuid(),
  trip_id: z.uuid(),
  created_by: z.uuid(),
  created_at: timestamp,
});
export const tripFinanceReviewSchema = z.strictObject({
  organization_id: z.uuid(),
  trip_id: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  reviewed_by: z.uuid(),
  reviewed_at: timestamp,
});
export const tripFinanceRowSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["income", "expense"]),
  concept: z.string().max(160),
  date: dateSchema,
  amount_cents: cents,
  payment_status: z.enum(["paid", "pending"]),
  row_version: version,
  auto_booked: z.boolean(),
});
export const tripFinanceSchema = z
  .strictObject({
    schema_version: z.literal(1),
    organization_id: z.uuid(),
    trip_id: z.uuid(),
    quoted_net_cents: cents,
    income_cents: cents.nullable(),
    expense_cents: cents.nullable(),
    income_count: cents.nullable(),
    expense_count: cents.nullable(),
    recorded_margin_cents: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    reviewed_margin_cents: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    reviewed: z.boolean(),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .nullable(),
    can_review: z.boolean(),
    rows: z.array(tripFinanceRowSchema).max(2000),
    rows_partial: z.boolean(),
    basis: z.string().max(400),
  })
  .superRefine((s, ctx) => {
    const ids = s.rows.map((r) => r.id);
    const visible = s.income_cents !== null && s.expense_cents !== null;
    const income = s.rows.filter((r) => r.kind === "income"),
      expense = s.rows.filter((r) => r.kind === "expense");
    const sum = (rows: typeof s.rows) =>
      rows.reduce((n, r) => n + r.amount_cents, 0);
    if (
      new Set(ids).size !== ids.length ||
      (!visible &&
        (s.recorded_margin_cents !== null ||
          s.reviewed ||
          s.reviewed_margin_cents !== null ||
          s.fingerprint !== null ||
          s.can_review)) ||
      (s.income_cents === null &&
        (income.length > 0 || s.income_count !== null)) ||
      (s.expense_cents === null &&
        (expense.length > 0 || s.expense_count !== null)) ||
      (visible &&
        s.recorded_margin_cents !== s.income_cents! - s.expense_cents!) ||
      (s.reviewed
        ? s.reviewed_margin_cents !== s.recorded_margin_cents
        : s.reviewed_margin_cents !== null) ||
      (!s.rows_partial &&
        ((s.income_cents !== null &&
          (sum(income) !== s.income_cents ||
            income.length !== s.income_count)) ||
          (s.expense_cents !== null &&
            (sum(expense) !== s.expense_cents ||
              expense.length !== s.expense_count))))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "El resumen económico está incompleto o no es coherente. Actualiza el viaje.",
      });
  });
export type TripFinance = z.infer<typeof tripFinanceSchema>;
export const tripCandidatesSchema = z.strictObject({
  schema_version: z.literal(1),
  organization_id: z.uuid(),
  trip_id: z.uuid(),
  rows: z.array(tripFinanceRowSchema).max(200),
});
