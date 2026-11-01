import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleHelp,
  Download,
  Plus,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useFleet } from "../app/FleetProvider";
import { useCompany } from "../app/CompanyAccess";
import { useWorkspace } from "../app/WorkspaceContext";
import { filterEntries, shiftMonth, summarize, trend } from "../domain/finance";
import { truckStatuses } from "../domain/models";
import { LocalInsightProvider } from "../domain/insights";
import { monthLabel, money, number, percent, today } from "../lib/format";
import { exportCsv } from "../lib/export";
import {
  Badge,
  Button,
  Metric,
  PageHeading,
  PeriodPicker,
} from "../components/ui";
import { TruckTable } from "../components/TruckTable";
import { FleetInstruments } from "../components/FleetInstruments";
import { FleetBrands } from "../components/VehicleBrand";

export function Dashboard() {
  const { mode } = useCompany();
  const { snapshot } = useFleet();
  const { period, setPeriod, edit } = useWorkspace();
  const [truckId, setTruckId] = useState("");
  const summary = summarize(filterEntries(snapshot.entries, period, truckId));
  const previous =
    period !== "all"
      ? summarize(
          filterEntries(snapshot.entries, shiftMonth(period, -1), truckId),
        )
      : null;
  const growth =
    previous && previous.incomeCents > 0
      ? ((summary.incomeCents - previous.incomeCents) / previous.incomeCents) *
        100
      : null;
  const insights = new LocalInsightProvider().analyze(
    snapshot,
    period,
    today(),
  );
  const trucks = truckId
    ? snapshot.trucks.filter((truck) => truck.id === truckId)
    : snapshot.trucks;
  const chart = trend(
    snapshot,
    period === "all" ? snapshot.demoMonth : period,
    truckId,
  );
  const max =
    Math.max(
      100,
      ...chart.flatMap((point) => [point.incomeCents, point.expenseCents]),
    ) * 1.15;
  function exportSummary() {
    exportCsv(`truckcontrol-resumen-${period}.csv`, [
      ["TruckControl AI · DEMOSTRACIÓN", monthLabel(period)],
      ["Métrica", "Importe EUR"],
      ["Ingresos", (summary.incomeCents / 100).toFixed(2)],
      ["Gastos", (summary.expenseCents / 100).toFixed(2)],
      ["Beneficio", (summary.profitCents / 100).toFixed(2)],
      ["Margen %", summary.margin?.toFixed(2) ?? "N/D"],
      ["Kilómetros", summary.distanceKm],
    ]);
  }
  return (
    <>
      <PageHeading
        eyebrow="TU FLOTA. TU NEGOCIO. TU CONTROL."
        title="Todo bajo control."
        description="La visión completa de tu flota, en un solo lugar."
      >
        <Button variant="secondary" icon={Download} onClick={exportSummary}>
          Exportar resumen
        </Button>
        <Button icon={Plus} onClick={() => edit({ kind: "income" })}>
          Registrar ingreso
        </Button>
      </PageHeading>
      <FleetBrands trucks={snapshot.trucks} />
      <div className="overview-toolbar">
        <div className="section-label">
          <span className="live-dot" />
          Resumen de actividad{" "}
          <span className="toolbar-note">
            {mode === "demo"
              ? "Datos de demostración"
              : snapshot.organization.name}
          </span>
        </div>
        <div className="inline-actions">
          <label className="fleet-select">
            <span className="sr-only">Filtrar camión</span>
            <select
              value={truckId}
              onChange={(e) => setTruckId(e.target.value)}
            >
              <option value="">Toda la flota</option>
              {snapshot.trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.plate}
                </option>
              ))}
            </select>
          </label>
          <PeriodPicker
            snapshot={snapshot}
            value={period}
            onChange={setPeriod}
          />
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Ingresos totales"
          value={money(summary.incomeCents)}
          subtitle="Ingresos del periodo"
          icon={ArrowUpRight}
          change={
            growth === null
              ? undefined
              : { value: growth, label: "vs. mes anterior" }
          }
        />
        <Metric
          label="Gastos totales"
          value={money(summary.expenseCents)}
          subtitle={`${money(summary.pendingExpenseCents)} pendientes de pago`}
          icon={ArrowDownLeft}
        />
        <Metric
          label="Beneficio operativo"
          value={money(summary.profitCents)}
          subtitle="Ingresos menos gastos"
          icon={Wallet}
          highlight
        />
        <Metric
          label="Margen de beneficio"
          value={percent(summary.margin)}
          subtitle={
            summary.incomeCents
              ? "Beneficio / ingresos × 100"
              : "Sin ingresos en este periodo"
          }
          icon={TrendingUp}
        />
      </div>
      <FleetInstruments
        trucks={trucks}
        distanceKm={summary.distanceKm}
        period={period}
      />
      <div className="dashboard-charts">
        <section className="card financial-chart">
          <div className="card-heading">
            <div>
              <h2>Evolución financiera</h2>
              <p>
                Los últimos 6 meses ·{" "}
                {truckId ? "Vehículo seleccionado" : "Toda la flota"}
              </p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-income" />
                Ingresos
              </span>
              <span>
                <i className="legend-expense" />
                Gastos
              </span>
            </div>
          </div>
          <div className="chart-area">
            <div className="chart-y">
              {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                <span key={ratio}>
                  {number(Math.round((max * ratio) / 100000))} mil €
                </span>
              ))}
            </div>
            <div className="chart-plot">
              <div className="chart-lines">
                {[0, 1, 2, 3, 4].map((line) => (
                  <i key={line} />
                ))}
              </div>
              <div className="chart-columns">
                {chart.map((point) => (
                  <button
                    key={point.month}
                    className={`chart-column ${period === point.month ? "selected" : ""}`}
                    onClick={() => setPeriod(point.month)}
                    aria-label={`${monthLabel(point.month)}: ingresos ${money(point.incomeCents)}, gastos ${money(point.expenseCents)}. Seleccionar periodo.`}
                    title={`${monthLabel(point.month)}\nIngresos: ${money(point.incomeCents)}\nGastos: ${money(point.expenseCents)}`}
                  >
                    <div className="bar-pair">
                      <span
                        className="bar income-bar"
                        style={{
                          height: `${(point.incomeCents / max) * 100}%`,
                        }}
                      />
                      <span
                        className="bar expense-bar"
                        style={{
                          height: `${(point.expenseCents / max) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="chart-x">
                      {monthLabel(point.month, true)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-caption">
            <CalendarDays size={14} />
            Selecciona un mes en el gráfico para explorar sus resultados.
          </div>
        </section>
        <section className="card fleet-status">
          <div className="card-heading">
            <div>
              <h2>Estado de la flota</h2>
              <p>Disponibilidad operativa actual</p>
            </div>
            <span
              className="subtle-icon"
              title="El estado de la flota es actual; no cambia con el periodo financiero."
            >
              <CircleHelp size={17} />
            </span>
          </div>
          <FleetDonut trucks={trucks} />
          <div className="fleet-legend">
            {Object.entries(truckStatuses).map(([key, label]) => (
              <div key={key}>
                <span>
                  <i className={`status-color ${key}`} />
                  {label}
                </span>
                <strong>
                  {trucks.filter((truck) => truck.status === key).length}
                  <small>
                    {trucks.length
                      ? Math.round(
                          (trucks.filter((truck) => truck.status === key)
                            .length /
                            trucks.length) *
                            100,
                        )
                      : 0}{" "}
                    %
                  </small>
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="card fleet-overview">
          <div className="card-heading">
            <div className="inline-actions">
              <h2>Tu flota, en movimiento</h2>
              <span className="count-badge">{trucks.length}</span>
            </div>
            <Link className="link-button" to="/trucks">
              Ver flota <ArrowRight size={15} />
            </Link>
          </div>
          <TruckTable trucks={trucks.slice(0, 5)} />
          <div className="table-caption">
            Beneficio del periodo · {monthLabel(period)} · importes sin IVA
          </div>
        </section>
        <section className="card insights-card">
          <div className="card-heading">
            <div className="inline-actions">
              <span className="insight-icon">
                <Sparkles size={17} />
              </span>
              <h2>Tu copiloto de flota</h2>
            </div>
            <Badge tone="green">Local</Badge>
          </div>
          <p className="insight-intro">
            Pequeñas señales para tomar mejores decisiones.
          </p>
          <div className="insight-list">
            {insights.slice(0, 3).map((insight) => (
              <Link key={insight.id} to={insight.href} className="insight-item">
                <span className={`insight-level ${insight.level}`} />
                <div>
                  <strong>{insight.title}</strong>
                  <span>
                    {insight.id === "inspections"
                      ? "Revisa las próximas inspecciones."
                      : insight.id === "licenses"
                        ? "Consulta las fechas de vencimiento."
                        : "Explora el detalle del periodo."}
                  </span>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            ))}
            {!insights.length && (
              <p className="muted">Sin avisos para este periodo.</p>
            )}
          </div>
          <Link className="copilot-link" to="/assistant">
            Ver análisis de la flota <ArrowRight size={15} />
          </Link>
          <p className="rules-note">
            Análisis con reglas locales. Bots IA en una próxima fase.
          </p>
        </section>
      </div>
      <div className="accounting-note">
        <CircleHelp size={14} />
        <span>
          Rentabilidad operativa por fecha de devengo. Incluye movimientos
          pendientes; no incluye IVA ni amortizaciones no registradas.
        </span>
      </div>
    </>
  );
}

function FleetDonut({ trucks }: { trucks: { status: string }[] }) {
  const circumference = 2 * Math.PI * 66;
  let offset = 0;
  return (
    <div className="donut-wrapper">
      <svg
        viewBox="0 0 180 180"
        role="img"
        aria-label={`${trucks.length} camiones: ${Object.entries(truckStatuses)
          .map(
            ([key, label]) =>
              `${trucks.filter((truck) => truck.status === key).length} ${label.toLowerCase()}`,
          )
          .join(", ")}`}
      >
        <circle className="donut-track" cx="90" cy="90" r="66" />
        {Object.keys(truckStatuses).map((status) => {
          const length = trucks.length
            ? (trucks.filter((truck) => truck.status === status).length /
                trucks.length) *
              circumference
            : 0;
          const element =
            length > 0 ? (
              <circle
                key={status}
                className={`donut-segment ${status}`}
                cx="90"
                cy="90"
                r="66"
                strokeDasharray={`${Math.max(0, length - 4)} ${circumference - Math.max(0, length - 4)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 90 90)"
              />
            ) : null;
          offset += length;
          return element;
        })}
        <text className="donut-total" x="90" y="89" textAnchor="middle">
          {trucks.length}
        </text>
        <text className="donut-label" x="90" y="110" textAnchor="middle">
          camiones
        </text>
      </svg>
    </div>
  );
}
