import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  Download,
  Pencil,
  Plus,
} from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import { filterEntries, summarize } from "../domain/finance";
import { categories } from "../domain/models";
import { date, money, monthLabel } from "../lib/format";
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

export function Finance({ kind }: { kind: "income" | "expense" }) {
  const { snapshot } = useFleet();
  const { period, setPeriod, edit } = useWorkspace();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [truckId, setTruckId] = useState(params.get("truck") ?? "");
  const [payment, setPayment] = useState(params.get("payment") ?? "all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const income = kind === "income";
  const rows = filterEntries(snapshot.entries, period, truckId)
    .filter(
      (entry) =>
        entry.kind === kind &&
        `${entry.concept} ${snapshot.trucks.find((truck) => truck.id === entry.truckId)?.plate ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (payment === "all" || entry.paymentStatus === payment) &&
        (category === "all" || entry.category === category),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const summary = summarize(rows);
  const total = income ? summary.incomeCents : summary.expenseCents;
  const pending = income
    ? summary.pendingIncomeCents
    : summary.pendingExpenseCents;
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 15)));
  function csv() {
    exportCsv(`truckcontrol-${income ? "ingresos" : "gastos"}-${period}.csv`, [
      [
        "Fecha",
        "Camión",
        "Concepto",
        "Categoría",
        "Importe EUR sin IVA",
        "Estado",
        "Km servicio",
      ],
      ...rows.map((entry) => [
        entry.date,
        snapshot.trucks.find((truck) => truck.id === entry.truckId)?.plate ??
          "",
        entry.concept,
        categories[entry.category],
        (entry.amountCents / 100).toFixed(2),
        entry.paymentStatus === "pending"
          ? "Pendiente"
          : income
            ? "Cobrado"
            : "Pagado",
        entry.distanceKm,
      ]),
    ]);
  }
  return (
    <>
      <PageHeading
        eyebrow="CONTROL ECONÓMICO"
        title={income ? "Cada servicio cuenta" : "Cada gasto, bajo control"}
        description={
          income
            ? "Registra tus servicios y mantén los cobros a la vista."
            : "Combustible, personal, mantenimiento y todos los costes de tu flota."
        }
      >
        <Button variant="secondary" icon={Download} onClick={csv}>
          Exportar CSV
        </Button>
        <Button icon={Plus} onClick={() => edit({ kind })}>
          {income ? "Nuevo ingreso" : "Nuevo gasto"}
        </Button>
      </PageHeading>
      <div className="overview-toolbar">
        <div className="section-label">
          {income ? "Ingresos" : "Gastos"}
          <span className="toolbar-note">
            {monthLabel(period)} · importes sin IVA
          </span>
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
      <div className="metrics-grid three">
        <Metric
          label={income ? "Ingresos filtrados" : "Gastos filtrados"}
          value={money(total, true)}
          subtitle={`${rows.length} movimientos en el filtro actual`}
          icon={income ? ArrowUpRight : ArrowDownLeft}
          highlight={income}
        />
        <Metric
          label={income ? "Cobrado" : "Pagado"}
          value={money(total - pending, true)}
          subtitle="Movimientos marcados como completados"
          icon={CheckCheck}
        />
        <Metric
          label={income ? "Pendiente de cobro" : "Pendiente de pago"}
          value={money(pending, true)}
          subtitle="Incluido en el resultado operativo"
          icon={Clock3}
        />
      </div>
      <section className="card">
        <div className="list-toolbar finance-toolbar">
          <SearchField
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Concepto o matrícula…"
            label={`Buscar ${income ? "ingresos" : "gastos"}`}
          />
          <div className="inline-actions">
            <select
              aria-label="Filtrar por camión"
              value={truckId}
              onChange={(e) => {
                setTruckId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los camiones</option>
              {snapshot.trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.plate}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar estado de pago"
              value={payment}
              onChange={(e) => {
                setPayment(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos los estados</option>
              <option value="paid">{income ? "Cobrado" : "Pagado"}</option>
              <option value="pending">Pendiente</option>
            </select>
            <select
              aria-label="Filtrar categoría"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todas las categorías</option>
              {Object.entries(categories)
                .filter(([key]) =>
                  income
                    ? ["transport", "other"].includes(key)
                    : key !== "transport",
                )
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Concepto</th>
                  <th scope="col">Camión</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="numeric">
                    Importe
                  </th>
                  <th scope="col">
                    <span className="sr-only">Editar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((actual - 1) * 15, actual * 15).map((entry) => (
                  <tr key={entry.id}>
                    <td className="nowrap muted">{date(entry.date)}</td>
                    <td className="concept-cell">
                      <strong>{entry.concept}</strong>
                      {income && entry.distanceKm > 0 && (
                        <small>
                          {entry.distanceKm.toLocaleString("es-ES")} km de
                          servicio
                        </small>
                      )}
                    </td>
                    <td className="nowrap strong">
                      {
                        snapshot.trucks.find(
                          (truck) => truck.id === entry.truckId,
                        )?.plate
                      }
                    </td>
                    <td>
                      <span className="category-label">
                        {categories[entry.category]}
                      </span>
                    </td>
                    <td>
                      <Badge
                        tone={
                          entry.paymentStatus === "pending" ? "amber" : "green"
                        }
                      >
                        {entry.paymentStatus === "pending"
                          ? "Pendiente"
                          : income
                            ? "Cobrado"
                            : "Pagado"}
                      </Badge>
                    </td>
                    <td
                      className={`numeric strong ${income ? "positive" : ""}`}
                    >
                      {money(entry.amountCents, true)}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Editar ${entry.concept}`}
                        onClick={() => edit({ kind, value: entry })}
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={`No hay ${income ? "ingresos" : "gastos"} con estos filtros`}
          />
        )}
        <Pagination
          total={rows.length}
          page={actual}
          pageSize={15}
          onChange={setPage}
        />
      </section>
    </>
  );
}
