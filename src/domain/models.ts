import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Fecha no válida");

export const truckStatuses = {
  on_route: "En ruta",
  available: "Disponible",
  maintenance: "En taller",
} as const;
export const driverStatuses = {
  active: "Disponible",
  leave: "De permiso",
} as const;
export const categories = {
  transport: "Servicio de transporte",
  fuel: "Combustible",
  maintenance: "Mantenimiento",
  payroll: "Personal",
  tolls: "Peajes",
  insurance: "Seguros",
  other: "Otros",
} as const;

export const truckSchema = z.object({
  id: z.uuid(),
  plate: z
    .string()
    .trim()
    .min(3)
    .max(16)
    .regex(/^[A-Za-z0-9 -]+$/),
  brand: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1980).max(2100),
  odometerKm: z.number().int().min(0).max(10_000_000),
  status: z.enum(["on_route", "available", "maintenance"]),
  driverId: z.uuid().nullable(),
  inspectionDueOn: dateSchema,
  route: z.string().trim().max(120),
});
export const driverSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(80),
  email: z.union([z.email(), z.literal("")]),
  phone: z.string().trim().max(24),
  license: z.string().trim().min(1).max(30),
  licenseExpiresOn: dateSchema,
  status: z.enum(["active", "leave"]),
});
export const entrySchema = z
  .object({
    id: z.uuid(),
    truckId: z.uuid(),
    kind: z.enum(["income", "expense"]),
    concept: z.string().trim().min(2).max(160),
    date: dateSchema,
    amountCents: z.number().int().positive().max(10_000_000_000),
    category: z.enum([
      "transport",
      "fuel",
      "maintenance",
      "payroll",
      "tolls",
      "insurance",
      "other",
    ]),
    paymentStatus: z.enum(["paid", "pending"]),
    distanceKm: z.number().int().min(0).max(1_000_000),
  })
  .refine(
    (entry) =>
      entry.kind === "income"
        ? ["transport", "other"].includes(entry.category)
        : entry.category !== "transport",
    {
      message: "La categoría no corresponde al tipo de movimiento.",
      path: ["category"],
    },
  )
  .refine((entry) => entry.kind === "income" || entry.distanceKm === 0, {
    message:
      "Los kilómetros se registran solo en los ingresos, para no duplicarlos.",
    path: ["distanceKm"],
  });

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  organization: z.object({ id: z.uuid(), name: z.string().min(1).max(100) }),
  demoMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  trucks: z.array(truckSchema).max(10_000),
  drivers: z.array(driverSchema).max(10_000),
  entries: z.array(entrySchema).max(100_000),
});

export type Truck = z.infer<typeof truckSchema>;
export type Driver = z.infer<typeof driverSchema>;
export type FinanceEntry = z.infer<typeof entrySchema>;
export type FleetSnapshot = z.infer<typeof snapshotSchema>;
export type Period = string; // YYYY-MM, or "all"

export function normalizePlate(plate: string) {
  return plate.replace(/[ -]/g, "").toUpperCase();
}

export function validateSnapshot(input: unknown): FleetSnapshot {
  const data = snapshotSchema.parse(input);
  for (const collection of [data.trucks, data.drivers, data.entries]) {
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      throw new Error("Hay identificadores duplicados.");
  }
  if (
    new Set(data.trucks.map((truck) => normalizePlate(truck.plate))).size !==
    data.trucks.length
  ) {
    throw new Error("Ya existe un camión con esa matrícula.");
  }
  const assigned = new Set<string>();
  for (const truck of data.trucks) {
    if (truck.driverId) {
      const driver = data.drivers.find((item) => item.id === truck.driverId);
      if (!driver) throw new Error("El conductor asignado no existe.");
      if (driver.status !== "active")
        throw new Error("Desasigna al conductor antes de ponerlo de permiso.");
      if (assigned.has(truck.driverId))
        throw new Error("El conductor ya está asignado a otro camión.");
      assigned.add(truck.driverId);
    }
  }
  const trucks = new Set(data.trucks.map((truck) => truck.id));
  if (data.entries.some((entry) => !trucks.has(entry.truckId)))
    throw new Error("Un movimiento hace referencia a un camión inexistente.");
  return data;
}
