import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Plus, Truck } from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import { truckStatuses } from "../domain/models";
import { daysUntil } from "../lib/format";
import { exportCsv } from "../lib/export";
import {
  Button,
  PageHeading,
  Pagination,
  PeriodPicker,
  SearchField,
} from "../components/ui";
import { TruckTable } from "../components/TruckTable";

export function Trucks() {
  const { snapshot } = useFleet();
  const { edit, period, setPeriod } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const attention = params.get("attention") === "inspection";
  const rows = snapshot.trucks.filter((truck) => {
    const driver = snapshot.drivers.find(
      (driver) => driver.id === truck.driverId,
    );
    return (
      `${truck.plate} ${truck.brand} ${truck.model} ${driver?.name ?? ""}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")) &&
      (status === "all" || truck.status === status) &&
      (!attention || daysUntil(truck.inspectionDueOn) <= 30)
    );
  });
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  return (
    <>
      <PageHeading
        eyebrow="OPERACIONES"
        title="Tu flota de camiones"
        description="Cada vehículo, su conductor y sus resultados. Todo conectado."
      >
        <Button
          variant="secondary"
          icon={Download}
          onClick={() =>
            exportCsv("truckcontrol-camiones-demo.csv", [
              [
                "Matrícula",
                "Marca",
                "Modelo",
                "Año",
                "Estado",
                "Cuentakilómetros",
                "ITV",
              ],
              ...rows.map((truck) => [
                truck.plate,
                truck.brand,
                truck.model,
                truck.year,
                truckStatuses[truck.status],
                truck.odometerKm,
                truck.inspectionDueOn,
              ]),
            ])
          }
        >
          Exportar
        </Button>
        <Button icon={Plus} onClick={() => edit({ kind: "truck" })}>
          Nuevo camión
        </Button>
      </PageHeading>
      <div className="fleet-summary-strip">
        {[
          ["all", "Todos los camiones", Truck],
          ...Object.entries(truckStatuses).map(([key, value]) => [
            key,
            value,
            Truck,
          ]),
        ].map(([key, label]) => (
          <button
            key={String(key)}
            className={`summary-filter ${status === key ? "active" : ""}`}
            onClick={() => {
              setStatus(String(key));
              setPage(1);
            }}
          >
            <span className={`status-color ${key}`} />
            <span>{String(label)}</span>
            <strong>
              {key === "all"
                ? snapshot.trucks.length
                : snapshot.trucks.filter((truck) => truck.status === key)
                    .length}
            </strong>
          </button>
        ))}
      </div>
      <section className="card">
        <div className="list-toolbar">
          <SearchField
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Matrícula, modelo o conductor…"
            label="Buscar camiones"
          />
          <div className="inline-actions">
            {attention && (
              <Button
                variant="secondary"
                onClick={() => {
                  setParams({});
                  setPage(1);
                }}
              >
                ITV ≤ 30 días ×
              </Button>
            )}
            <PeriodPicker
              snapshot={snapshot}
              value={period}
              onChange={setPeriod}
            />
          </div>
        </div>
        <TruckTable trucks={rows.slice((actual - 1) * 10, actual * 10)} />
        <Pagination
          total={rows.length}
          page={actual}
          pageSize={10}
          onChange={setPage}
        />
      </section>
    </>
  );
}
