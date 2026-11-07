/** Public capability descriptions only. Authorization is always repeated in SQL. */
export const specialistProfiles = [
  {
    id: "general",
    label: "General",
    description: "Coordina consultas y propuestas de los módulos autorizados.",
    example: "¿Qué tareas de mi empresa requieren atención hoy?",
    entities: [
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
    ],
    requiresAny: [],
  },
  {
    id: "documents",
    label: "Documental",
    description:
      "Consulta PDF e imágenes seleccionados y sus vencimientos, con fuentes.",
    example: "¿Qué vencimientos aparecen en el documento seleccionado?",
    entities: ["truck", "driver", "deadlines", "alerts"],
    requiresAny: ["documents"],
  },
  {
    id: "finance",
    label: "Financiero",
    description:
      "Contrasta ingresos, gastos y rentabilidad registrados, sin asientos automáticos.",
    example:
      "Analiza el beneficio devengado y el coste por kilómetro registrado.",
    entities: ["truck", "income", "expense", "trips", "customers", "alerts"],
    requiresAny: ["income", "expenses"],
  },
  {
    id: "fuel",
    label: "Combustible",
    description:
      "Revisa repostajes y consumo entre depósitos completos, cuando hay datos suficientes.",
    example: "¿Qué consumos puedo comprobar con los repostajes registrados?",
    entities: ["truck", "fuel", "alerts"],
    requiresAny: ["fuel"],
  },
  {
    id: "maintenance",
    label: "Mantenimiento",
    description:
      "Revisa revisiones, averías y vencimientos; prepara tareas para confirmar.",
    example:
      "Revisa los mantenimientos y vencimientos próximos de mis camiones.",
    entities: ["truck", "maintenance", "deadlines", "alerts"],
    requiresAny: ["maintenance"],
  },
  {
    id: "drivers",
    label: "Conductores",
    description:
      "Comprueba fichas, permisos y asignaciones registradas, sin inventar telemetría.",
    example: "¿Qué permisos de conductores necesitan revisión?",
    entities: ["truck", "driver", "trips", "deadlines", "alerts"],
    requiresAny: ["drivers"],
  },
  {
    id: "trips",
    label: "Viajes",
    description:
      "Organiza clientes, rutas y viajes y distingue presupuestos de ingresos contabilizados.",
    example: "Resume los viajes registrados y señala los datos que faltan.",
    entities: ["truck", "driver", "trailers", "customers", "trips", "alerts"],
    requiresAny: ["trips"],
  },
  {
    id: "management",
    label: "Dirección",
    description:
      "Sintetiza los indicadores disponibles y propone prioridades con evidencia.",
    example:
      "Prepara un resumen de dirección con prioridades y limitaciones de los datos.",
    entities: [
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
    ],
    requiresAny: ["dashboard", "profitability"],
  },
] as const;
export type SpecialistId = (typeof specialistProfiles)[number]["id"];
export const specialistIds = specialistProfiles.map((p) => p.id);
export function isSpecialistId(value: unknown): value is SpecialistId {
  return typeof value === "string" && specialistIds.some((id) => id === value);
}
export function specialistProfile(value: unknown) {
  const profile = specialistProfiles.find((p) => p.id === value);
  if (!profile) throw Error("Unknown specialist profile");
  return profile;
}
