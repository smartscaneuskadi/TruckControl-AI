import type { FleetSnapshot, Period } from "./models";
import { filterEntries, summarize, truckProfitability } from "./finance";

export interface Insight {
  id: string;
  level: "warning" | "info" | "success";
  title: string;
  description: string;
  href: string;
}
export interface InsightProvider {
  readonly name: string;
  analyze(
    snapshot: FleetSnapshot,
    period: Period,
    today: string,
  ): Insight[] | Promise<Insight[]>;
}

/** Explainable local rules. A future authenticated Edge Function can implement this contract. */
export class LocalInsightProvider implements InsightProvider {
  readonly name = "Reglas locales · demostración";
  analyze(snapshot: FleetSnapshot, period: Period, today: string): Insight[] {
    const insights: Insight[] = [];
    const dueBy = new Date(`${today}T12:00:00Z`);
    dueBy.setUTCDate(dueBy.getUTCDate() + 30);
    const deadline = dueBy.toISOString().slice(0, 10);
    const inspections = snapshot.trucks.filter(
      (truck) => truck.inspectionDueOn <= deadline,
    );
    if (inspections.length)
      insights.push({
        id: "inspections",
        level: "warning",
        title: `${inspections.length} ITV requieren atención`,
        description:
          "Hay inspecciones vencidas o previstas en los próximos 30 días. Revisa las fechas en las fichas de los camiones.",
        href: "/trucks?attention=inspection",
      });
    const licenses = snapshot.drivers.filter(
      (driver) => driver.licenseExpiresOn <= deadline,
    );
    if (licenses.length)
      insights.push({
        id: "licenses",
        level: "warning",
        title: `${licenses.length} permisos próximos a vencer`,
        description:
          "Revisa los permisos vencidos o con vencimiento en los próximos 30 días.",
        href: "/drivers?attention=license",
      });
    const loss = truckProfitability(snapshot, period).filter(
      (row) => row.profitCents < 0,
    );
    if (loss.length)
      insights.push({
        id: "loss",
        level: "warning",
        title: `${loss.length} camiones con rentabilidad negativa`,
        description:
          "Sus gastos superan a sus ingresos en el periodo seleccionado. Revisa el detalle antes de decidir.",
        href: "/profitability?loss=1",
      });
    const summary = summarize(filterEntries(snapshot.entries, period));
    if (summary.pendingIncomeCents > 0)
      insights.push({
        id: "pending",
        level: "info",
        title: "Tienes ingresos pendientes de cobro",
        description:
          "Consulta los servicios pendientes y actualiza su estado cuando se cobren.",
        href: "/income?payment=pending",
      });
    if (summary.profitCents > 0)
      insights.push({
        id: "positive",
        level: "success",
        title: "La flota cierra el periodo en positivo",
        description:
          "El resultado incluye todos los movimientos por fecha de devengo, independientemente de su estado de pago.",
        href: "/profitability",
      });
    return insights;
  }
}
