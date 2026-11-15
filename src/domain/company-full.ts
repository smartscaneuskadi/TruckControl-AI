import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const manualFullSchema = z
  .object({
    schema_version: z.literal(1),
    configured: z.boolean(),
    status: z.enum(["unconfigured", "active", "disabled", "expired"]),
    enabled: z.boolean().nullable(),
    expires_at: timestamp.nullable(),
    revision,
    updated_at: timestamp.nullable(),
  })
  .superRefine((value, context) => {
    const valid = value.configured
      ? value.revision > 0 &&
        value.updated_at !== null &&
        typeof value.enabled === "boolean" &&
        (value.enabled
          ? ["active", "expired"].includes(value.status)
          : value.status === "disabled") &&
        (value.status !== "expired" || value.expires_at !== null)
      : value.status === "unconfigured" &&
        value.enabled === null &&
        value.expires_at === null &&
        value.revision === 0 &&
        value.updated_at === null;
    if (!valid)
      context.addIssue({
        code: "custom",
        message: "invalid_company_full_state",
      });
  });
export type ManualFullState = z.infer<typeof manualFullSchema>;
export const companyFullItemSchema = z.object({
  organization_id: uuid,
  company_name: z.string().min(1),
  owner_id: uuid,
  owner_email: z.string().nullable(),
  manual_full: manualFullSchema,
  effective_active: z.boolean(),
  effective_plan: z.string().nullable(),
});
export type CompanyFullItem = z.infer<typeof companyFullItemSchema>;
export const fullCapabilitiesSchema = z.object({
  schema_version: z.literal(1),
  manual_company_full: z.literal(true),
  observed_at: timestamp,
});
export const fullPageSchema = z.object({
  schema_version: z.literal(1),
  observed_at: timestamp,
  items: z.array(companyFullItemSchema).max(100),
  next_after: uuid.nullable(),
});
export type CompanyFullPage = z.infer<typeof fullPageSchema>;
export const fullReceiptSchema = z.object({
  schema_version: z.literal(1),
  observed_at: timestamp,
  item: companyFullItemSchema,
  operation_id: uuid,
  replayed: z.boolean(),
  applied_revision: revision,
});
export type CompanyFullReceipt = z.infer<typeof fullReceiptSchema>;
export const fullAuditSchema = z.object({
  operation_id: uuid,
  organization_id: uuid,
  revision: revision.min(1),
  actor_id: uuid,
  actor_email: z.string().nullable(),
  changed_at: timestamp,
  before: manualFullSchema,
  after: manualFullSchema,
});
export type CompanyFullAudit = z.infer<typeof fullAuditSchema>;
export const fullHistorySchema = z.object({
  schema_version: z.literal(1),
  observed_at: timestamp,
  items: z.array(fullAuditSchema).max(100),
  next_before_revision: revision.nullable(),
});
export type CompanyFullHistory = z.infer<typeof fullHistorySchema>;
export type CompanyFullCommand = {
  organizationId: string;
  expected: number;
  operationId: string;
  enabled: boolean;
  expiresAt: string | null;
};
export function fullStatusLabel(
  value: ManualFullState,
  effectiveActive = false,
) {
  if (!value.configured) return effectiveActive ? "Activo" : "Desactivado";
  return value.status === "active"
    ? "Activo"
    : value.status === "expired"
      ? "Vencido"
      : "Desactivado";
}
export function manualFullBlocked(value?: ManualFullState) {
  return Boolean(value?.configured && value.status !== "active");
}
/** UTC is explicit; reject impossible dates rather than accepting JS rollover. */
export function fullExpiryFromInput(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("invalid_full_expiry");
  const date = new Date(value + ":00.000Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 16) !== value
  )
    throw new Error("invalid_full_expiry");
  return date.toISOString();
}
export function fullInputFromExpiry(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}
/** Anchor the lease before its request so latency never extends the server TTL. */
export function fullExpiryDeadline(
  state: ManualFullState | undefined,
  observedAt: string | undefined,
  requestStarted: number,
) {
  if (
    !state?.configured ||
    state.status !== "active" ||
    !state.enabled ||
    !state.expires_at ||
    !observedAt
  )
    return null;
  return (
    requestStarted +
    Math.max(0, Date.parse(state.expires_at) - Date.parse(observedAt))
  );
}
export function readManualFullAccess(
  value: {
    manual_full?: unknown;
    observed_at?: unknown;
    organization_id?: unknown;
  },
  organizationId?: string,
) {
  if (value.manual_full === undefined) return undefined;
  const state = manualFullSchema.parse(value.manual_full);
  timestamp.parse(value.observed_at);
  if (
    state.configured &&
    (!organizationId || value.organization_id !== organizationId)
  )
    throw new Error("company_full_scope_mismatch");
  if (
    state.status === "active" &&
    state.expires_at &&
    Date.parse(state.expires_at) <= Date.parse(String(value.observed_at))
  )
    throw new Error("company_full_expired_snapshot");
  return state;
}
export function watchFullExpiry(deadline: number, expire: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  const tick = () => {
    if (!active) return;
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      active = false;
      expire();
      return;
    }
    timer = setTimeout(tick, Math.min(2147483647, remaining));
  };
  tick();
  return () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
  };
}
