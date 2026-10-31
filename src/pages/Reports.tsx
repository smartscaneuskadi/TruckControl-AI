import {
  Download,
  Printer,
  Route as RouteIcon,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import { useSubscription } from "../app/SubscriptionContext";
import { useWorkspace } from "../app/WorkspaceContext";
import { Button, Metric, PageHeading, PeriodPicker } from "../components/ui";
import { filterEntries, summarize } from "../domain/finance";
import { operationFields } from "../domain/operation-fields";
import type { OperationField } from "../domain/operation-fields";
import { operationLabels } from "../domain/operations";
import type { OperationKind, OperationRecord } from "../domain/operations";
import { exportCsv } from "../lib/export";
import { money, number } from "../lib/format";

export function Reports() {
  const { snapshot } = useFleet(),
    operations = useOperations(),
    subscription = useSubscription(),
    { period, setPeriod } = useWorkspace();
  const entries = filterEntries(snapshot.entries, period),
    totals = summarize(entries);
  const trips = operations.rows.filter(
    (r) =>
      r.kind === "trips" &&
      (period === "all" || String(r.data.startOn).startsWith(period)),
  );
  const completed = trips.filter((r) => r.data.status === "completed"),
    months = [...new Set(entries.map((e) => e.date.slice(0, 7)))]
      .sort()
      .reverse();
  function exportFinance() {
    exportCsv(`truckcontrol-informe-economico-${period}.csv`, [
      [
        "Fecha",
        "Matrícula",
        "Tipo",
        "Concepto",
        "Base sin IVA EUR",
        "Categoría",
        "Cobro o pago",
        "Km de servicio",
      ],
      ...entries.map((e) => [
        e.date,
        snapshot.trucks.find((t) => t.id === e.truckId)?.plate ?? "",
        e.kind === "income" ? "Ingreso" : "Gasto",
        e.concept,
        (e.amountCents / 100).toFixed(2),
        e.category,
        e.paymentStatus === "paid" ? "Pagado" : "Pendiente",
        e.distanceKm,
      ]),
    ]);
  }
  function cell(row: OperationRecord, field: OperationField) {
    const v = row.data[field.key];
    if (v === null || v === undefined) return "";
    if (field.type === "money") return (Number(v) / 100).toFixed(2);
    if (field.type === "litres") return (Number(v) / 1000).toFixed(3);
    if (field.type === "truck")
      return snapshot.trucks.find((t) => t.id === v)?.plate ?? "";
    if (field.type === "driver")
      return snapshot.drivers.find((d) => d.id === v)?.name ?? "";
    if (field.type === "trailer" || field.type === "customer") {
      const linked = operations.rows.find((r) => r.id === v);
      return String(linked?.data.plate || linked?.data.name || "");
    }
    return field.options?.[String(v)] ?? String(v);
  }
  return (
    <>
      <PageHeading
        eyebrow="INFORMACIÓN PARA DECIDIR"
        title="Informes de tu empresa"
        description="Compara la actividad y el resultado económico del espacio seleccionado."
      >
        <PeriodPicker snapshot={snapshot} value={period} onChange={setPeriod} />
        <Button
          variant="secondary"
          icon={Printer}
          onClick={() => window.print()}
        >
          Imprimir
        </Button>
        <Button icon={Download} onClick={exportFinance}>
          Exportar contabilidad
        </Button>
      </PageHeading>
      <div className="metrics-grid">
        <Metric
          label="Ingresos registrados"
          value={money(totals.incomeCents)}
          subtitle="Bases sin IVA"
          icon={TrendingUp}
        />
        <Metric
          label="Gastos registrados"
          value={money(totals.expenseCents)}
          subtitle="Bases sin IVA"
          icon={Wallet}
        />
        <Metric
          label="Resultado"
          value={money(totals.profitCents)}
          subtitle="Ingresos menos gastos"
          icon={Wallet}
          highlight
        />
        <Metric
          label="Viajes finalizados"
          value={number(completed.length)}
          subtitle={`${trips.length} servicios en el periodo`}
          icon={RouteIcon}
        />
      </div>
      <section className="card operation-register">
        <div className="table-toolbar">
          <div>
            <h2>Resultado por mes</h2>
            <p>
              Los servicios pendientes de contabilizar se muestran en
              operaciones y no se suman a la contabilidad.
            </p>
          </div>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Resultado económico por mes"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Ingresos</th>
                <th scope="col">Gastos</th>
                <th scope="col">Beneficio</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => {
                const total = summarize(filterEntries(entries, month));
                return (
                  <tr key={month}>
                    <td>{month}</td>
                    <td>{money(total.incomeCents, true)}</td>
                    <td>{money(total.expenseCents, true)}</td>
                    <td>{money(total.profitCents, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card integration-card">
        <h2>Exportaciones operativas</h2>
        <p>
          Los ficheros incluyen el historial de esta empresa. Guárdalos en un
          lugar privado.
        </p>
        <div className="access-links">
          {(Object.keys(operationLabels) as OperationKind[])
            .filter(
              (kind) => !subscription.enabled || subscription.features[kind],
            )
            .map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                icon={Download}
                disabled={operations.loading || Boolean(operations.error)}
                onClick={() =>
                  exportCsv(`truckcontrol-${kind}.csv`, [
                    operationFields[kind].map((f) => f.label),
                    ...operations.rows
                      .filter((r) => r.kind === kind)
                      .map((r) => operationFields[kind].map((f) => cell(r, f))),
                  ])
                }
              >
                {operationLabels[kind]}
              </Button>
            ))}
        </div>
      </section>
    </>
  );
}
