import { z } from "zod";
import { copilotTurnSchema } from "./copilot";
export {
  specialistProfiles,
  specialistIds,
  specialistProfile,
} from "../../supabase/functions/_shared/specialist-profiles";
export type { SpecialistId } from "../../supabase/functions/_shared/specialist-profiles";
export const specialistIdSchema = z.enum([
  "general",
  "documents",
  "finance",
  "fuel",
  "maintenance",
  "drivers",
  "trips",
  "management",
]);
const uuid = z.uuid(),
  stamp = z.iso.datetime({ offset: true });
export const specialistSourceSchema = z
  .strictObject({
    reference: z.string().min(1).max(60),
    kind: z.enum([
      "truck",
      "driver",
      "income",
      "expense",
      "trailers",
      "customers",
      "trips",
      "maintenance",
      "fuel",
      "deadlines",
      "alerts",
      "document",
      "month",
      "aggregate",
    ]),
    id: z.string().min(1).max(64),
    version: z.number().int().positive().nullable(),
    title: z.string().min(1).max(160),
    content_type: z
      .enum(["application/pdf", "image/jpeg", "image/png", "image/webp"])
      .optional(),
    size_bytes: z.number().int().positive().max(10485760).optional(),
  })
  .superRefine((s, c) => {
    if (
      s.kind !== "month" &&
      s.kind !== "aggregate" &&
      !uuid.safeParse(s.id).success
    )
      c.addIssue({ code: "custom", message: "Fuente no válida" });
    if (s.kind === "month" && !/^\d{4}-\d{2}$/.test(s.id))
      c.addIssue({ code: "custom", message: "Período no válido" });
  });
export const specialistStatusSchema = z
  .strictObject({
    schema_version: z.literal(2),
    organization_id: uuid,
    profiles: z
      .array(
        z.strictObject({
          id: specialistIdSchema,
          allowed: z.boolean(),
          connection_verified: z.boolean(),
          verified_at: stamp.nullable(),
        }),
      )
      .length(8),
  })
  .superRefine((s, c) => {
    if (
      new Set(s.profiles.map((p) => p.id)).size !== 8 ||
      s.profiles.some((p) => p.connection_verified !== (p.verified_at !== null))
    )
      c.addIssue({ code: "custom", message: "Catálogo de perfiles no válido" });
  });
export type SpecialistStatus = z.infer<typeof specialistStatusSchema>;
export const specialistTurnSchema = copilotTurnSchema
  .safeExtend({
    profile: specialistIdSchema,
    sources: z.array(specialistSourceSchema).max(12),
    uncertainties: z.array(z.string().min(1).max(240)).max(6),
  })
  .superRefine((t, c) => {
    if (
      new Set(t.sources.map((s) => s.reference)).size !== t.sources.length ||
      (t.state !== "complete" &&
        (t.sources.length > 0 || t.uncertainties.length > 0))
    )
      c.addIssue({ code: "custom", message: "Fuentes del turno no válidas" });
  });
export type SpecialistTurn = z.infer<typeof specialistTurnSchema>;
export type SpecialistSource = z.infer<typeof specialistSourceSchema>;
export const specialistDocumentsSchema = z.strictObject({
  organization_id: uuid,
  partial: z.boolean(),
  documents: z
    .array(
      z.strictObject({
        id: uuid,
        name: z.string().min(1).max(160),
        content_type: z.enum([
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
        ]),
        size_bytes: z.number().int().positive().max(10485760),
      }),
    )
    .max(50),
});
export const specialistJobsSchema = z.strictObject({
  organization_id: uuid,
  profile: specialistIdSchema,
  paid_model_calls: z.literal(0),
  scheduler_ready: z.boolean(),
  preference: z.strictObject({
    enabled: z.boolean(),
    cadence: z.enum(["daily", "weekly"]),
    version: z.number().int().nonnegative(),
    next_run_at: stamp.nullable(),
  }),
  jobs: z
    .array(
      z.strictObject({
        id: uuid,
        state: z.enum(["pending", "complete", "failed", "cancelled"]),
        attempts: z.number().int().min(0).max(3),
        scheduled_for: z.iso.date(),
        summary: z.record(z.string(), z.unknown()).nullable(),
        created_at: stamp,
        completed_at: stamp.nullable(),
        error_code: z
          .enum(["permission_changed", "temporary_failure", "opted_out"])
          .nullable(),
      }),
    )
    .max(10),
});
export type SpecialistJobs = z.infer<typeof specialistJobsSchema>;

/** Render only known numeric indicators; missing or partial data is never zero. */
export function specialistDigestFacts(summary: unknown): string[] {
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const s = object(summary);
  if (s.kind !== "database_rules" || s.paid_model_calls !== 0) return [];
  const values = object(object(s.statistics).values),
    facts: string[] = [];
  for (const [group, key, label] of [
    ["maintenance", "overdue", "Mantenimientos vencidos"],
    ["maintenance", "open", "Mantenimientos abiertos"],
    ["drivers", "expiredLicenses", "Permisos de conductor vencidos"],
    ["deadlines", "overdue", "Vencimientos pendientes fuera de plazo"],
    ["deadlines", "dueIn30Days", "Vencimientos en los próximos 30 días"],
    ["trips", "completed", "Viajes completados en el período"],
    ["trips", "inTransit", "Viajes en curso en el período"],
  ]) {
    const n = object(values[group])[key];
    if (typeof n === "number" && Number.isSafeInteger(n) && n >= 0)
      facts.push(`${label}: ${new Intl.NumberFormat("es-ES").format(n)}`);
  }
  const finance = values.finance_by_truck;
  if (
    Array.isArray(finance) &&
    finance.length &&
    values.finance_truck_groups_partial === false
  ) {
    const profits = finance.map((row) => object(row).profitCents);
    if (
      profits.every(
        (n): n is number => typeof n === "number" && Number.isSafeInteger(n),
      )
    ) {
      const sum = profits.reduce((a, b) => a + b, 0);
      if (Number.isSafeInteger(sum))
        facts.push(
          `Beneficio registrado del período: ${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(sum / 100)}`,
        );
    }
  }
  const fuel = values.fuel_by_truck;
  if (Array.isArray(fuel) && values.fuel_truck_groups_partial === false)
    facts.push(
      `Camiones con consumo medido en el período: ${
        fuel.filter((row) => {
          const n = object(row).litresPer100Km;
          return typeof n === "number" && Number.isFinite(n) && n >= 0;
        }).length
      }`,
    );
  return facts;
}
