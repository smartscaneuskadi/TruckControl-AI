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
