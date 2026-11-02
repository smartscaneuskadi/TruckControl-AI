import { z } from "zod";
import { dateSchema } from "./models";

export const documentCategories = {
  insurance: "Seguro",
  inspection: "ITV",
  permit: "Permiso",
  invoice: "Factura",
  maintenance: "Mantenimiento",
  contract: "Contrato",
  other: "Otro",
} as const;
export const documentTrackingInput = z
  .object({
    category: z.enum([
      "insurance",
      "inspection",
      "permit",
      "invoice",
      "maintenance",
      "contract",
      "other",
    ]),
    status: z.enum(["active", "archived"]),
    expires_on: dateSchema.nullable(),
    remind_days: z.number().int().min(0).max(365),
  })
  .strict();
export const documentTrackingSchema = documentTrackingInput.extend({
  row_version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  updated_at: z.string().datetime({ offset: true }).nullable(),
});
export type DocumentTrackingInput = z.infer<typeof documentTrackingInput>;
export type DocumentTracking = z.infer<typeof documentTrackingSchema>;
export const defaultDocumentInput: DocumentTrackingInput = {
  category: "other",
  status: "active",
  expires_on: null,
  remind_days: 30,
};
export const defaultDocumentTracking: DocumentTracking = {
  ...defaultDocumentInput,
  row_version: 0,
  updated_at: null,
};
export interface TrackedDocument {
  id: string;
  organization_id: string;
  name: string;
  truck_id: string | null;
  driver_id: string | null;
  created_at: string;
  size_bytes: number;
  tracking?: DocumentTracking;
}
export function documentState(
  document: Pick<TrackedDocument, "tracking">,
  day: string,
) {
  const t = document.tracking ?? defaultDocumentTracking;
  if (t.status === "archived") return "archived" as const;
  if (!t.expires_on) return "undated" as const;
  if (t.expires_on < day) return "expired" as const;
  const limit = new Date(day + "T12:00:00Z");
  limit.setUTCDate(limit.getUTCDate() + t.remind_days);
  return t.expires_on <= limit.toISOString().slice(0, 10)
    ? ("due" as const)
    : ("valid" as const);
}
export const documentStateLabels = {
  archived: "Archivado",
  undated: "Sin vencimiento",
  expired: "Vencido",
  due: "Próximo a vencer",
  valid: "Vigente",
} as const;
export function filterDocuments<T extends TrackedDocument>(
  rows: T[],
  day: string,
  search: string,
  status: string,
  category: string,
) {
  const query = search.trim().toLocaleLowerCase("es");
  return rows.filter(
    (d) =>
      (!query || d.name.toLocaleLowerCase("es").includes(query)) &&
      (status === "all" || status === "active"
        ? status === "all" || d.tracking?.status !== "archived"
        : documentState(d, day) === status) &&
      (category === "all" || (d.tracking?.category ?? "other") === category),
  );
}
