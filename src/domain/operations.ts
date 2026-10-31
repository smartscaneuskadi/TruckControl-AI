import { z } from "zod";
import { dateSchema, normalizePlate } from "./models";
import type { FleetSnapshot } from "./models";

const text = (max = 160) => z.string().trim().min(1).max(max);
const optionalText = (max = 500) => z.string().trim().max(max).default("");
const cents = z.number().int().min(0).max(10_000_000_000);
const km = z.number().int().min(0).max(10_000_000);
const link = z.uuid().nullable().default(null);
export const operationSchemas = {
  trailers: z.object({
    plate: text(16)
      .min(3)
      .regex(/^[A-Za-z0-9 -]+$/),
    type: z.enum(["tautliner", "refrigerated", "container", "tipper", "other"]),
    status: z.enum(["available", "in_use", "maintenance"]),
    capacityKg: z.number().int().min(0).max(100000),
    inspectionDueOn: dateSchema,
    insuranceDueOn: dateSchema,
    notes: optionalText(),
  }),
  customers: z.object({
    name: text(100),
    taxId: text(30),
    email: z.union([z.email().max(254), z.literal("")]).default(""),
    phone: optionalText(30),
    address: optionalText(240),
    notes: optionalText(),
  }),
  trips: z
    .object({
      reference: text(60),
      customerId: link,
      truckId: z.uuid(),
      driverId: link,
      trailerId: link,
      origin: text(120),
      destination: text(120),
      startOn: dateSchema,
      endOn: dateSchema.nullable().default(null),
      status: z.enum(["planned", "in_transit", "completed", "cancelled"]),
      distanceKm: km.max(1_000_000),
      amountCents: cents,
      notes: optionalText(),
    })
    .refine((v) => !v.endOn || v.endOn >= v.startOn, {
      message: "La llegada no puede ser anterior a la salida.",
      path: ["endOn"],
    }),
  maintenance: z
    .object({
      truckId: z.uuid(),
      type: z.enum(["preventive", "corrective"]),
      description: text(240),
      scheduledOn: dateSchema,
      completedOn: dateSchema.nullable().default(null),
      status: z.enum(["planned", "in_progress", "completed"]),
      odometerKm: km,
      nextDueKm: km.nullable().default(null),
      nextDueOn: dateSchema.nullable().default(null),
      amountCents: cents,
      supplier: optionalText(120),
      notes: optionalText(),
    })
    .refine((v) => v.status !== "completed" || Boolean(v.completedOn), {
      message: "Indica la fecha de finalización.",
      path: ["completedOn"],
    }),
  fuel: z.object({
    truckId: z.uuid(),
    driverId: link,
    date: dateSchema,
    odometerKm: km,
    millilitres: z.number().int().min(1).max(5_000_000),
    amountCents: cents.refine(
      (v) => v > 0,
      "Indica un importe mayor que cero.",
    ),
    station: text(120),
    fullTank: z.boolean().default(true),
    notes: optionalText(),
  }),
  deadlines: z.object({
    title: text(160),
    category: z.enum([
      "insurance",
      "inspection",
      "permit",
      "tachograph",
      "medical",
      "other",
    ]),
    truckId: link,
    driverId: link,
    trailerId: link,
    dueOn: dateSchema,
    remindDays: z.number().int().min(0).max(365),
    status: z.enum(["active", "resolved"]),
    notes: optionalText(),
  }),
  alerts: z.object({
    title: text(160),
    dueOn: dateSchema,
    truckId: link,
    priority: z.enum(["normal", "urgent"]),
    status: z.enum(["open", "acknowledged"]),
    sourceKey: optionalText(180),
    notes: optionalText(),
  }),
} as const;
export type OperationKind = keyof typeof operationSchemas;
export interface OperationRecord {
  id: string;
  kind: OperationKind;
  data: Record<string, unknown>;
  version: number;
  financeEntryId: string | null;
}
export const operationLabels: Record<OperationKind, string> = {
  trailers: "Remolques",
  customers: "Clientes",
  trips: "Viajes",
  maintenance: "Mantenimiento",
  fuel: "Combustible",
  deadlines: "Vencimientos",
  alerts: "Alertas",
};
export const operationSchema = z.object({
  id: z.uuid(),
  kind: z.enum([
    "trailers",
    "customers",
    "trips",
    "maintenance",
    "fuel",
    "deadlines",
    "alerts",
  ]),
  data: z.record(z.string(), z.unknown()),
  version: z.number().int().min(1),
  financeEntryId: z.uuid().nullable(),
});
export function parseOperation(value: unknown): OperationRecord {
  const row = operationSchema.parse(value);
  return { ...row, data: operationSchemas[row.kind].parse(row.data) };
}
export function validateOperations(
  values: unknown,
  fleet: FleetSnapshot,
): OperationRecord[] {
  const rows = z
    .array(z.unknown())
    .max(50000)
    .parse(values)
    .map(parseOperation);
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error("Hay registros duplicados.");
  const plates = new Set<string>();
  const truckIds = new Set(fleet.trucks.map((t) => t.id));
  const driverIds = new Set(fleet.drivers.map((d) => d.id));
  const recordKinds = new Map(rows.map((r) => [r.id, r.kind]));
  for (const row of rows) {
    if (row.kind === "trailers") {
      const plate = normalizePlate(String(row.data.plate));
      if (plates.has(plate))
        throw Error("Ya existe un remolque con esa matrícula.");
      plates.add(plate);
    }
    if (row.data.truckId && !truckIds.has(String(row.data.truckId)))
      throw Error("El camión no pertenece a esta empresa.");
    if (row.data.driverId && !driverIds.has(String(row.data.driverId)))
      throw Error("El conductor no pertenece a esta empresa.");
    for (const [key, kind] of [
      ["trailerId", "trailers"],
      ["customerId", "customers"],
    ] as const)
      if (row.data[key] && recordKinds.get(String(row.data[key])) !== kind)
        throw Error("La vinculación no pertenece a esta empresa.");
  }
  const running = rows.filter(
    (r) => r.kind === "trips" && r.data.status === "in_transit",
  );
  for (const key of ["truckId", "driverId", "trailerId"]) {
    const linked = running.map((r) => r.data[key]).filter(Boolean);
    if (new Set(linked).size !== linked.length)
      throw Error("Hay una asignación duplicada en viajes en curso.");
  }
  const fuelByTruck = new Map<string, OperationRecord[]>();
  for (const row of rows.filter((r) => r.kind === "fuel")) {
    const key = String(row.data.truckId);
    const group = fuelByTruck.get(key) ?? [];
    group.push(row);
    fuelByTruck.set(key, group);
  }
  for (const group of fuelByTruck.values()) {
    group.sort(
      (a, b) =>
        String(a.data.date).localeCompare(String(b.data.date)) ||
        Number(a.data.odometerKm) - Number(b.data.odometerKm),
    );
    for (let i = 1; i < group.length; i++)
      if (
        Number(group[i].data.odometerKm) < Number(group[i - 1].data.odometerKm)
      )
        throw Error("El kilometraje no sigue el historial del camión.");
  }
  return rows;
}
export type OperationCommand =
  | { type: "save"; value: OperationRecord; expected: number | null }
  | { type: "delete"; id: string; kind: OperationKind; expected: number };
export function applyOperation(
  rows: OperationRecord[],
  command: OperationCommand,
  fleet: FleetSnapshot,
) {
  const id = command.type === "save" ? command.value.id : command.id;
  const old = rows.find((r) => r.id === id);
  if (command.expected === null && old)
    throw Error(
      "El registro ya existe. Actualiza los datos antes de continuar.",
    );
  if (old && command.type === "save" && old.kind !== command.value.kind)
    throw Error("El tipo de registro no se puede cambiar.");
  if (command.expected !== null && old?.version !== command.expected)
    throw Error(
      "Otro cambio ha modificado este registro. Revisa los datos antes de guardar.",
    );
  if (command.type === "delete") {
    if (old?.financeEntryId)
      throw Error(
        "Conserva el registro contabilizado para mantener el historial.",
      );
    if (rows.some((r) => r.data.customerId === id || r.data.trailerId === id))
      throw Error(
        "El registro está vinculado a otros datos. Conserva su historial.",
      );
    return validateOperations(
      rows.filter((r) => r.id !== id),
      fleet,
    );
  }
  if (old?.financeEntryId)
    throw Error(
      "El registro ya está contabilizado y conserva sus datos originales.",
    );
  const value = parseOperation({
    ...command.value,
    version: old ? old.version + 1 : 1,
  });
  return validateOperations(
    old ? rows.map((r) => (r.id === id ? value : r)) : [...rows, value],
    fleet,
  );
}
export interface OperationalAlert {
  key: string;
  title: string;
  dueOn: string;
  truckId: string | null;
  urgent: boolean;
  source:
    "trucks" | "drivers" | "trailers" | "deadlines" | "maintenance" | "alerts";
  sourceId: string;
  reason: "date" | "kilometres";
  currentKm?: number;
  thresholdKm?: number;
}
export function operationalAlerts(
  fleet: FleetSnapshot,
  rows: OperationRecord[],
  now: string,
): OperationalAlert[] {
  const limit = new Date(`${now}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 30);
  const through = limit.toISOString().slice(0, 10);
  const out: OperationalAlert[] = [];
  const add = (
    key: string,
    title: string,
    dueOn: string,
    truckId: string | null,
    source: OperationalAlert["source"],
    sourceId: string,
    priority = false,
  ) => {
    if (priority || dueOn <= through)
      out.push({
        key: `${key}:${dueOn}`,
        title,
        dueOn,
        truckId,
        urgent: priority || dueOn < now,
        source,
        sourceId,
        reason: "date",
      });
  };
  for (const t of fleet.trucks)
    add(
      `truck:${t.id}`,
      `ITV · ${t.plate}`,
      t.inspectionDueOn,
      t.id,
      "trucks",
      t.id,
    );
  for (const d of fleet.drivers)
    add(
      `driver:${d.id}`,
      `Permiso · ${d.name}`,
      d.licenseExpiresOn,
      null,
      "drivers",
      d.id,
    );
  const odometers = new Map(fleet.trucks.map((t) => [t.id, t.odometerKm]));
  for (const r of rows)
    if (r.kind === "fuel" && String(r.data.date) <= now) {
      const id = String(r.data.truckId);
      odometers.set(
        id,
        Math.max(odometers.get(id) ?? 0, Number(r.data.odometerKm)),
      );
    }
  for (const r of rows) {
    const d = r.data;
    if (r.kind === "trailers") {
      add(
        `trailer-itv:${r.id}`,
        `ITV remolque · ${d.plate}`,
        String(d.inspectionDueOn),
        null,
        "trailers",
        r.id,
      );
      add(
        `trailer-insurance:${r.id}`,
        `Seguro remolque · ${d.plate}`,
        String(d.insuranceDueOn),
        null,
        "trailers",
        r.id,
      );
    }
    if (r.kind === "deadlines" && d.status === "active") {
      const remind = new Date(`${now}T12:00:00Z`);
      remind.setUTCDate(remind.getUTCDate() + Number(d.remindDays));
      if (String(d.dueOn) <= remind.toISOString().slice(0, 10))
        out.push({
          key: `deadline:${r.id}:${d.dueOn}`,
          title: String(d.title),
          dueOn: String(d.dueOn),
          truckId: d.truckId as string | null,
          urgent: String(d.dueOn) < now,
          source: "deadlines",
          sourceId: r.id,
          reason: "date",
        });
    }
    if (r.kind === "maintenance" && d.status !== "completed")
      add(
        `maintenance:${r.id}`,
        String(d.description),
        String(d.scheduledOn),
        String(d.truckId),
        "maintenance",
        r.id,
      );
    if (r.kind === "maintenance" && d.status === "completed") {
      if (d.nextDueOn)
        add(
          `service-date:${r.id}`,
          `Próxima revisión · ${d.description}`,
          String(d.nextDueOn),
          String(d.truckId),
          "maintenance",
          r.id,
        );
      const truck = fleet.trucks.find((t) => t.id === d.truckId);
      const currentKm = truck ? odometers.get(truck.id)! : 0;
      if (
        d.nextDueKm !== null &&
        d.nextDueKm !== undefined &&
        truck &&
        currentKm >= Number(d.nextDueKm)
      )
        out.push({
          // Stable across calendar days; changing the threshold creates a new reminder.
          key: `service-km:${r.id}:${d.nextDueKm}`,
          title: `Revisión por kilometraje · ${truck.plate}`,
          dueOn: now,
          truckId: truck.id,
          urgent: true,
          source: "maintenance",
          sourceId: r.id,
          reason: "kilometres",
          currentKm,
          thresholdKm: Number(d.nextDueKm),
        });
    }
    if (r.kind === "alerts" && d.status === "open")
      add(
        `manual:${r.id}`,
        String(d.title),
        String(d.dueOn),
        d.truckId as string | null,
        "alerts",
        r.id,
        d.priority === "urgent",
      );
  }
  const acknowledged = new Set(
    rows
      .filter((r) => r.kind === "alerts" && r.data.status === "acknowledged")
      .map((r) => r.data.sourceKey),
  );
  return out
    .filter((r) => !acknowledged.has(r.key))
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        a.dueOn.localeCompare(b.dueOn) ||
        a.key.localeCompare(b.key),
    );
}
export function fuelConsumption(rows: OperationRecord[], truckId: string) {
  const full = rows
    .filter((r) => r.kind === "fuel" && r.data.truckId === truckId)
    .sort(
      (a, b) =>
        String(a.data.date).localeCompare(String(b.data.date)) ||
        Number(a.data.odometerKm) - Number(b.data.odometerKm),
    );
  let start: number | null = null,
    litres = 0,
    totalKm = 0,
    totalLitres = 0;
  for (const r of full) {
    const d = r.data;
    if (start === null) {
      if (d.fullTank) start = Number(d.odometerKm);
      continue;
    }
    litres += Number(d.millilitres) / 1000;
    if (d.fullTank) {
      const km = Number(d.odometerKm) - start;
      if (km > 0) {
        totalKm += km;
        totalLitres += litres;
      }
      start = Number(d.odometerKm);
      litres = 0;
    }
  }
  return totalKm > 0
    ? {
        litresPer100Km: (totalLitres / totalKm) * 100,
        kilometres: totalKm,
        litres: totalLitres,
      }
    : null;
}
