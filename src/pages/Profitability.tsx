import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Download,
  Gauge,
  Printer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import {
  filterEntries,
  summarize,
  truckProfitability,
} from "../domain/finance";
import { money, monthLabel, number, percent } from "../lib/format";
import { exportCsv } from "../lib/export";
import {
  Badge,
  Button,
  Empty,
  Metric,
  PageHeading,
  Pagination,
  PeriodPicker,
  SearchField,
} from "../components/ui";

export function Profitability() {
  const { snapshot } = useFleet();
  const { period, setPeriod, viewTruck } = useWorkspace();
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [lossOnly, setLossOnly] = useState(params.get("loss") === "1");
  const [sort, setSort] = useState("profit-desc");
  const [page, setPage] = useState(1);
  const rows = truckProfitability(snapshot, period)
    .filter(
      (row) =>
        `${row.truck.plate} ${row.truck.brand} ${row.truck.model}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!lossOnly || row.profitCents < 0),
    )
    .sort((a, b) =>
      sort === "plate"
        ? a.truck.plate.localeCompare(b.truck.plate)
        : sort === "profit-asc"
          ? a.profitCents - b.profitCents
          : b.profitCents - a.profitCents,
    );
  const selected = new Set(rows.map((row) => row.truck.id));
  const total = summarize(
    filterEntries(snapshot.entries, period).filter((entry) =>
      selected.has(entry.truckId),
    ),
  );
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  return (
    <>
      <PageHeading
        eyebrow="INTELIGENCIA DE NEGOCIO"
        title="Conoce lo que gana tu flota"
        description="Convierte los ingresos y los costes en decisiones con fundamento."
      >
        <Button
          variant="secondary"
          icon={Printer}
          onClick={() => window.print()}
        >
          Imprimir
        </Button>
        <Button
          icon={Download}
          onClick={() =>
            exportCsv(`truckcontrol-rentabilidad-${period}.csv`, [
              [
                "Matrícula",
                "Ingresos EUR",
                "Gastos EUR",
                "Beneficio EUR",
                "Margen %",
                "Km de servicio",
                "Coste EUR/km",
              ],
              ...rows.map((row) => [
                row.truck.plate,
                (row.incomeCents / 100).toFixed(2),
                (row.expenseCents / 100).toFixed(2),
                (row.profitCents / 100).toFixed(2),
                row.margin?.toFixed(2) ?? "N/D",
                row.distanceKm,
                row.costPerKmCents === null
                  ? "N/D"
                  : (row.costPerKmCents / 100).toFixed(4),
              ]),
            ])
          }
        >
          Exportar informe
        </Button>
      </PageHeading>
      <div className="overview-toolbar">
        <div className="section-label">
          Resultado operativo{" "}
          <span className="toolbar-note">{monthLabel(period)}</span>
        </div>
        <PeriodPicker
          snapshot={snapshot}
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setPage(1);
          }}
        />
      </div>
      <div className="metrics-grid">
        <Metric
          label="Beneficio de la selección"
          value={money(total.profitCents, true)}
          subtitle={`${rows.length} vehículos en el filtro actual`}
          icon={Wallet}
          highlight
        />
        <Metric
          label="Margen operativo"
          value={percent(total.margin)}
          subtitle="Beneficio / ingresos × 100"
          icon={TrendingUp}
        />
        <Metric
          label="Coste por kilómetro"
          value={
            total.costPerKmCents === null
              ? "—"
              : money(total.costPerKmCents, true)
          }
          subtitle="Gastos / km de servicios registrados"
          icon={Gauge}
        />
        <Metric
          label="Kilómetros de servicio"
          value={`${number(total.distanceKm)} km`}
          subtitle="Suma de km registrados en los ingresos"
          icon={ArrowUpRight}
        />
      </div>
      <section className="card">
        <div className="list-toolbar">
          <SearchField
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            label="Buscar rentabilidad por camión"
            placeholder="Matrícula o modelo…"
          />
          <div className="inline-actions">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={lossOnly}
                onChange={(e) => {
                  setLossOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Solo pérdidas
            </label>
            <select
              aria-label="Ordenar rentabilidad"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="profit-desc">Mayor beneficio</option>
              <option value="profit-asc">Menor beneficio</option>
              <option value="plate">Matrícula</option>
            </select>
          </div>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table profitability-table">
              <thead>
                <tr>
                  <th scope="col">Vehículo</th>
                  <th scope="col" className="numeric">
                    Ingresos
                  </th>
                  <th scope="col" className="numeric">
                    Gastos
                  </th>
                  <th scope="col" className="numeric">
                    Beneficio
                  </th>
                  <th scope="col" className="numeric">
                    Margen
                  </th>
                  <th scope="col" className="numeric">
                    Coste / km
                  </th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((actual - 1) * 12, actual * 12).map((row) => (
                  <tr key={row.truck.id}>
                    <td>
                      <button
                        className="text-button strong"
                        onClick={() => viewTruck(row.truck)}
                      >
                        {row.truck.plate}
                      </button>
                      <small>
                        {row.truck.brand} {row.truck.model}
                      </small>
                    </td>
                    <td className="numeric">{money(row.incomeCents, true)}</td>
                    <td className="numeric">{money(row.expenseCents, true)}</td>
                    <td
                      className={`numeric strong ${row.profitCents < 0 ? "negative" : "positive"}`}
                    >
                      {money(row.profitCents, true)}
                    </td>
                    <td className="numeric">{percent(row.margin)}</td>
                    <td className="numeric">
                      {row.costPerKmCents === null
                        ? "—"
                        : money(row.costPerKmCents, true)}
                    </td>
                    <td>
                      <Badge
                        tone={
                          row.profitCents < 0
                            ? "red"
                            : row.profitCents > 0
                              ? "green"
                              : "neutral"
                        }
                      >
                        {row.profitCents < 0
                          ? "En pérdidas"
                          : row.profitCents > 0
                            ? "Rentable"
                            : "Sin beneficio"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <Pagination
          total={rows.length}
          page={actual}
          pageSize={12}
          onChange={setPage}
        />
      </section>
      <div className="method-card">
        <h3>Cómo calculamos la rentabilidad</h3>
        <p>
          <strong>Beneficio = ingresos − gastos.</strong> El margen divide el
          beneficio entre los ingresos. El coste por km divide los gastos entre
          los kilómetros de servicio introducidos en los ingresos. Sin ingresos
          o kilómetros, mostramos «—».
        </p>
        <p>
          Todos los importes son en EUR, sin IVA y por fecha de devengo,
          incluidos los pagos pendientes. Solo se tienen en cuenta los costes
          registrados: no es un balance contable ni incluye amortizaciones
          automáticas.
        </p>
      </div>
    </>
  );
}
