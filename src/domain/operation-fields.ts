import type { OperationKind } from "./operations";
export interface OperationField {
  key: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "number"
    | "money"
    | "litres"
    | "checkbox"
    | "email"
    | "truck"
    | "driver"
    | "trailer"
    | "customer";
  required?: boolean;
  options?: Record<string, string>;
  default?: string | number | boolean;
}
const truck: OperationField = {
  key: "truckId",
  label: "Camión",
  type: "truck",
  required: true,
};
const notes: OperationField = { key: "notes", label: "Notas" };
const amount: OperationField = {
  key: "amountCents",
  label: "Importe sin IVA (€)",
  type: "money",
  default: 0,
};
export const operationFields: Record<OperationKind, OperationField[]> = {
  trailers: [
    { key: "plate", label: "Matrícula", required: true },
    {
      key: "type",
      label: "Tipo",
      options: {
        tautliner: "Lona",
        refrigerated: "Frigorífico",
        container: "Portacontenedor",
        tipper: "Basculante",
        other: "Otro",
      },
    },
    {
      key: "status",
      label: "Estado",
      options: {
        available: "Disponible",
        in_use: "En uso",
        maintenance: "En taller",
      },
    },
    {
      key: "capacityKg",
      label: "Capacidad (kg)",
      type: "number",
      default: 24000,
    },
    {
      key: "inspectionDueOn",
      label: "Próxima ITV",
      type: "date",
      required: true,
    },
    {
      key: "insuranceDueOn",
      label: "Vencimiento del seguro",
      type: "date",
      required: true,
    },
    notes,
  ],
  customers: [
    { key: "name", label: "Nombre o razón social", required: true },
    { key: "taxId", label: "NIF / CIF", required: true },
    { key: "email", label: "Correo", type: "email" },
    { key: "phone", label: "Teléfono" },
    { key: "address", label: "Dirección" },
    notes,
  ],
  trips: [
    { key: "reference", label: "Referencia", required: true },
    { key: "customerId", label: "Cliente", type: "customer" },
    truck,
    { key: "driverId", label: "Conductor", type: "driver" },
    { key: "trailerId", label: "Remolque", type: "trailer" },
    { key: "origin", label: "Origen", required: true },
    { key: "destination", label: "Destino", required: true },
    { key: "startOn", label: "Salida", type: "date", required: true },
    { key: "endOn", label: "Llegada", type: "date" },
    {
      key: "status",
      label: "Estado",
      options: {
        planned: "Planificado",
        in_transit: "En curso",
        completed: "Finalizado",
        cancelled: "Cancelado",
      },
    },
    {
      key: "distanceKm",
      label: "Kilómetros del servicio",
      type: "number",
      default: 0,
    },
    amount,
    notes,
  ],
  maintenance: [
    truck,
    {
      key: "type",
      label: "Tipo",
      options: { preventive: "Preventivo", corrective: "Correctivo" },
    },
    { key: "description", label: "Trabajo o avería", required: true },
    {
      key: "scheduledOn",
      label: "Fecha prevista",
      type: "date",
      required: true,
    },
    { key: "completedOn", label: "Finalización", type: "date" },
    {
      key: "status",
      label: "Estado",
      options: {
        planned: "Programado",
        in_progress: "En taller",
        completed: "Finalizado",
      },
    },
    {
      key: "odometerKm",
      label: "Kilometraje de la intervención",
      type: "number",
      default: 0,
    },
    { key: "nextDueKm", label: "Próxima revisión (km)", type: "number" },
    { key: "nextDueOn", label: "Próxima revisión (fecha)", type: "date" },
    amount,
    { key: "supplier", label: "Taller o proveedor" },
    notes,
  ],
  fuel: [
    truck,
    { key: "driverId", label: "Conductor", type: "driver" },
    { key: "date", label: "Fecha", type: "date", required: true },
    {
      key: "odometerKm",
      label: "Cuentakilómetros",
      type: "number",
      required: true,
    },
    {
      key: "millilitres",
      label: "Litros repostados",
      type: "litres",
      required: true,
    },
    amount,
    { key: "station", label: "Estación de servicio", required: true },
    {
      key: "fullTank",
      label: "Depósito lleno",
      type: "checkbox",
      default: true,
    },
    notes,
  ],
  deadlines: [
    { key: "title", label: "Documento o vencimiento", required: true },
    {
      key: "category",
      label: "Categoría",
      options: {
        insurance: "Seguro",
        inspection: "ITV",
        permit: "Permiso",
        tachograph: "Tacógrafo",
        medical: "Reconocimiento médico",
        other: "Otro",
      },
    },
    { ...truck, required: false },
    { key: "driverId", label: "Conductor", type: "driver" },
    { key: "trailerId", label: "Remolque", type: "trailer" },
    { key: "dueOn", label: "Vencimiento", type: "date", required: true },
    {
      key: "remindDays",
      label: "Antelación del aviso (días)",
      type: "number",
      default: 30,
    },
    {
      key: "status",
      label: "Estado",
      options: { active: "Pendiente", resolved: "Resuelto" },
    },
    notes,
  ],
  alerts: [
    { key: "title", label: "Aviso", required: true },
    { key: "dueOn", label: "Fecha", type: "date", required: true },
    { ...truck, required: false },
    {
      key: "priority",
      label: "Prioridad",
      options: { normal: "Normal", urgent: "Urgente" },
    },
    {
      key: "status",
      label: "Estado",
      options: { open: "Pendiente", acknowledged: "Revisado" },
    },
    notes,
  ],
};
export function operationFormData(kind: OperationKind, form: FormData) {
  const data: Record<string, unknown> = {};
  for (const f of operationFields[kind]) {
    const raw = String(form.get(f.key) ?? "").trim();
    if (f.type === "checkbox") data[f.key] = form.has(f.key);
    else if (["money", "litres", "number"].includes(f.type ?? "")) {
      if (!raw && f.default === undefined && !f.required) data[f.key] = null;
      else {
        const n = Number(raw.replace(",", "."));
        data[f.key] =
          f.type === "money"
            ? Math.round(n * 100)
            : f.type === "litres"
              ? Math.round(n * 1000)
              : n;
      }
    } else if (
      ["truck", "driver", "trailer", "customer", "date"].includes(f.type ?? "")
    )
      data[f.key] = raw || null;
    else data[f.key] = raw;
  }
  if (kind === "alerts") data.sourceKey = "";
  return data;
}
