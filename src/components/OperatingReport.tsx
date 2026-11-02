import { Download } from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import { useSubscription } from "../app/SubscriptionContext";
import { useDocuments } from "../app/DocumentsProvider";
import {
  operatingReport,
  expenseCategoryReport,
} from "../domain/operating-report";
import { documentState } from "../domain/documents";
import { Button } from "./ui";
import { money, number } from "../lib/format";
import { useCurrentDay } from "../lib/use-current-day";
import { exportCsv } from "../lib/export";

export function OperatingReport() {
  const { snapshot } = useFleet(),
    operations = useOperations(),
    { period } = useWorkspace(),
    subscription = useSubscription(),
    documents = useDocuments(),
    day = useCurrentDay();
  const allowed = (feature: "trips" | "fuel" | "documents") =>
    !subscription.enabled || subscription.features[feature];
  const ready = !operations.loading && !operations.error,
    rows = operatingReport(snapshot, ready ? operations.rows : [], period),
    expenses = expenseCategoryReport(snapshot, period);
  function csv() {
    exportCsv(`truckcontrol-informe-camiones-${period}.csv`, [
      [
        "Matrícula",
        "Ingresos sin IVA EUR",
        "Gastos sin IVA EUR",
        "Resultado EUR",
        "Km contabilizados",
        "Coste EUR/km",
        "Viajes finalizados",
        "Viajes sin contabilizar",
        "Litros repostados",
        "Consumo medido L/100 km",
      ],
      ...rows.map((r) => [
        r.truck.plate,
        (r.incomeCents / 100).toFixed(2),
        (r.expenseCents / 100).toFixed(2),
        (r.profitCents / 100).toFixed(2),
        r.distanceKm,
        r.costPerKmCents === null ? "" : (r.costPerKmCents / 100).toFixed(4),
        ready && allowed("trips") ? r.completedTrips : "",
        ready && allowed("trips") ? r.unbookedTrips : "",
        ready && allowed("fuel") ? r.refuelledLitres.toFixed(3) : "",
        ready && allowed("fuel") && r.measuredConsumption !== null
          ? r.measuredConsumption.toFixed(2)
          : "",
      ]),
    ]);
  }
  return (
    <>
      <section className="card operation-register">
        <div className="table-toolbar">
          <div>
            <h2>Indicadores por camión</h2>
            <p>
              La contabilidad incluye solo apuntes registrados, con sus bases
              sin IVA. Los kilómetros se cuentan una vez por servicio.
            </p>
          </div>
          <Button icon={Download} variant="secondary" onClick={csv}>
            Exportar informe por camión
          </Button>
        </div>
        {subscription.enabled &&
          (!subscription.features.income ||
            !subscription.features.expenses) && (
            <p role="status">
              El informe económico incluye únicamente los módulos a los que
              tienes acceso.
            </p>
          )}
        {!ready && (
          <p role="status">
            No se han podido completar los indicadores operativos. Actualiza los
            datos antes de interpretar los viajes y repostajes.
          </p>
        )}
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Indicadores por camión"
        >
          <table>
            <thead>
              <tr>
                {[
                  "Camión",
                  "Ingresos",
                  "Gastos",
                  "Resultado",
                  "Km contabilizados",
                  "Coste/km",
                  ...(allowed("trips")
                    ? ["Viajes finalizados", "Sin contabilizar"]
                    : []),
                  ...(allowed("fuel")
                    ? ["Litros repostados", "L/100 km medidos"]
                    : []),
                ].map((v) => (
                  <th key={v} scope="col">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.truck.id}>
                  <td>{r.truck.plate}</td>
                  <td>{money(r.incomeCents, true)}</td>
                  <td>{money(r.expenseCents, true)}</td>
                  <td>{money(r.profitCents, true)}</td>
                  <td>{number(r.distanceKm)}</td>
                  <td>
                    {r.costPerKmCents === null
                      ? "—"
                      : money(r.costPerKmCents, true)}
                  </td>
                  {allowed("trips") && (
                    <>
                      <td>{ready ? number(r.completedTrips) : "—"}</td>
                      <td>{ready ? number(r.unbookedTrips) : "—"}</td>
                    </>
                  )}
                  {allowed("fuel") && (
                    <>
                      <td>{ready ? number(r.refuelledLitres) : "—"}</td>
                      <td>
                        {ready && r.measuredConsumption !== null
                          ? number(r.measuredConsumption)
                          : "Sin medición"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Los litros son cantidades repostadas. El consumo se calcula solo entre
          depósitos completos registrados dentro del periodo, incluidos los
          repostajes parciales intermedios. «Sin medición» indica que faltan
          datos; no significa consumo cero.
        </p>
      </section>
      <section className="card operation-register">
        <h2>Gastos por categoría</h2>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Gastos por categoría"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Base sin IVA</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.category}>
                  <td>{e.label}</td>
                  <td>{money(e.amountCents, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {allowed("documents") && (
        <section className="card integration-card">
          <h2>Estado documental a fecha de hoy</h2>
          {documents.loading || documents.error ? (
            <p role="status">
              No se han podido completar los vencimientos documentales.
              Actualiza el archivo.
            </p>
          ) : (
            <div className="integration-fields">
              {(["expired", "due", "undated"] as const).map((state, i) => (
                <p key={state}>
                  <strong>
                    {
                      documents.documents.filter(
                        (d) => documentState(d, day) === state,
                      ).length
                    }
                  </strong>{" "}
                  ·{" "}
                  {
                    [
                      "Vencidos",
                      "Próximos a vencer",
                      "Sin fecha de vencimiento",
                    ][i]
                  }
                </p>
              ))}
            </div>
          )}
          <p>
            Los documentos archivados se conservan y no generan avisos de
            vencimiento.
          </p>
        </section>
      )}
    </>
  );
}
