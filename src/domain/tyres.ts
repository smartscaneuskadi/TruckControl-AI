import { z } from "zod";
import { dateSchema } from "./models";
import type { FleetSnapshot } from "./models";

const optionalNumber = (max: number) =>
  z.number().int().min(0).max(max).nullable();
export const tyreDataSchema = z
  .object({
    code: z.string().trim().min(1).max(60),
    truckId: z.uuid().nullable(),
    position: z.string().trim().max(40),
    status: z.enum(["mounted", "stock", "retired"]),
    brand: z.string().trim().max(80),
    model: z.string().trim().max(80),
    size: z.string().trim().max(40),
    installedOn: dateSchema.nullable(),
    installedKm: optionalNumber(10_000_000),
    measuredOn: dateSchema.nullable(),
    treadTenthsMm: optionalNumber(400),
    pressureKpa: optionalNumber(2000),
    minTreadTenthsMm: optionalNumber(400),
    minPressureKpa: optionalNumber(2000),
    maxPressureKpa: optionalNumber(2000),
    nextCheckOn: dateSchema.nullable(),
    notes: z.string().trim().max(500),
  })
  .strict()
  .superRefine((d, c) => {
    const issue = (path: string, message: string) =>
      c.addIssue({ code: "custom", path: [path], message });
    if (d.status === "mounted" && (!d.truckId || !d.position))
      issue("position", "Selecciona el camión y su posición de montaje.");
    if (d.status !== "mounted" && (d.truckId || d.position))
      issue(
        "truckId",
        "Las cubiertas en almacén o retiradas no ocupan una posición.",
      );
    if ((d.treadTenthsMm !== null || d.pressureKpa !== null) && !d.measuredOn)
      issue("measuredOn", "Indica cuándo realizaste la medición.");
    if (d.installedOn && d.measuredOn && d.measuredOn < d.installedOn)
      issue(
        "measuredOn",
        "La medición no puede ser anterior al montaje registrado.",
      );
    if (
      d.minPressureKpa !== null &&
      d.maxPressureKpa !== null &&
      d.minPressureKpa > d.maxPressureKpa
    )
      issue(
        "maxPressureKpa",
        "La presión máxima debe ser igual o mayor que la mínima.",
      );
  });
export type TyreData = z.infer<typeof tyreDataSchema>;
export function validateTyreForSave(
  input: unknown,
  day = new Date().toISOString().slice(0, 10),
) {
  const d = tyreDataSchema.parse(input);
  if (
    (d.measuredOn && d.measuredOn > day) ||
    (d.installedOn && d.installedOn > day)
  )
    throw Error("No registres una medición o montaje con fecha futura.");
  return d;
}
export const tyreRecordSchema = z
  .object({
    id: z.uuid(),
    organizationId: z.uuid(),
    data: tyreDataSchema,
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const tyreHistorySchema = z
  .object({
    id: z.uuid(),
    organizationId: z.uuid(),
    tyreId: z.uuid(),
    data: tyreDataSchema,
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    changedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type TyreRecord = z.infer<typeof tyreRecordSchema>;
export type TyreHistory = z.infer<typeof tyreHistorySchema>;
export function validateTyreArchive(
  value: unknown,
  org: string,
  fleet?: FleetSnapshot,
) {
  const raw = z
    .object({
      rows: z.array(tyreRecordSchema).max(5000),
      history: z.array(tyreHistorySchema).max(50_000),
    })
    .strict()
    .parse(value);
  const rows = validateTyres(raw.rows, org, fleet),
    indexed = new Map(rows.map((r) => [r.id, r])),
    histories = new Map<string, TyreHistory[]>(),
    ids = new Set<string>(),
    versions = new Set<string>();
  for (const h of raw.history) {
    const key = `${h.tyreId}:${h.version}`;
    if (
      h.organizationId !== org ||
      !indexed.has(h.tyreId) ||
      ids.has(h.id) ||
      versions.has(key)
    )
      throw Error(
        "El historial de neumáticos mezcla empresas, fichas o revisiones duplicadas.",
      );
    ids.add(h.id);
    versions.add(key);
    const list = histories.get(h.tyreId) ?? [];
    list.push(h);
    histories.set(h.tyreId, list);
  }
  for (const row of rows) {
    const history = (histories.get(row.id) ?? []).sort(
        (a, b) => a.version - b.version,
      ),
      last = history.at(-1);
    if (
      history.length !== row.version ||
      history.some((h, i) => h.version !== i + 1) ||
      JSON.stringify(last?.data) !== JSON.stringify(row.data) ||
      last?.changedAt !== row.updatedAt
    )
      throw Error(
        "La copia de neumáticos está incompleta o ha cambiado durante la lectura.",
      );
  }
  return { rows, history: raw.history };
}
export const tyreStatusLabels = {
  mounted: "Montado",
  stock: "En almacén",
  retired: "Retirado",
} as const;
export const emptyTyreData: TyreData = {
  code: "",
  truckId: null,
  position: "",
  status: "stock",
  brand: "",
  model: "",
  size: "",
  installedOn: null,
  installedKm: null,
  measuredOn: null,
  treadTenthsMm: null,
  pressureKpa: null,
  minTreadTenthsMm: null,
  minPressureKpa: null,
  maxPressureKpa: null,
  nextCheckOn: null,
  notes: "",
};
export function validateTyres(
  values: unknown,
  org: string,
  fleet?: FleetSnapshot,
): TyreRecord[] {
  const rows = z.array(tyreRecordSchema).max(5000).parse(values);
  const ids = new Set<string>(),
    codes = new Set<string>(),
    positions = new Set<string>();
  for (const r of rows) {
    const code = r.data.code.toLocaleUpperCase("es");
    const position = `${r.data.truckId}:${r.data.position.replace(/\s+/g, " ").toLocaleUpperCase("es")}`;
    if (r.organizationId !== org || ids.has(r.id) || codes.has(code))
      throw Error(
        "Los neumáticos mezclan empresas o identificadores duplicados.",
      );
    if (
      r.data.truckId &&
      fleet &&
      !fleet.trucks.some((t) => t.id === r.data.truckId)
    )
      throw Error("El neumático está vinculado a un camión no autorizado.");
    if (r.data.status === "mounted" && positions.has(position))
      throw Error("La posición ya tiene un neumático montado.");
    ids.add(r.id);
    codes.add(code);
    if (r.data.status === "mounted") positions.add(position);
  }
  return rows;
}
export function tyreWarnings(row: TyreRecord, day: string) {
  const d = row.data;
  if (d.status !== "mounted") return [];
  const out: {
    reason: "tread" | "pressure" | "date";
    title: string;
    urgent: boolean;
    dueOn: string;
  }[] = [];
  if (d.measuredOn && d.measuredOn <= day) {
    if (
      d.treadTenthsMm !== null &&
      d.minTreadTenthsMm !== null &&
      d.treadTenthsMm <= d.minTreadTenthsMm
    )
      out.push({
        reason: "tread",
        title: "Dibujo en el umbral configurado o por debajo",
        urgent: true,
        dueOn: d.measuredOn,
      });
    if (
      d.pressureKpa !== null &&
      ((d.minPressureKpa !== null && d.pressureKpa < d.minPressureKpa) ||
        (d.maxPressureKpa !== null && d.pressureKpa > d.maxPressureKpa))
    )
      out.push({
        reason: "pressure",
        title: "Presión fuera del intervalo configurado",
        urgent: true,
        dueOn: d.measuredOn,
      });
  }
  const limit = new Date(day + "T12:00:00Z");
  limit.setUTCDate(limit.getUTCDate() + 30);
  if (d.nextCheckOn && d.nextCheckOn <= limit.toISOString().slice(0, 10))
    out.push({
      reason: "date",
      title: "Revisión de neumático",
      urgent: d.nextCheckOn < day,
      dueOn: d.nextCheckOn,
    });
  return out;
}
