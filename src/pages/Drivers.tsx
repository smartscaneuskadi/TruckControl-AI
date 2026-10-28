import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Mail,
  Phone,
  Plus,
  Truck,
  UserRound,
} from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useCompany } from "../app/CompanyAccess";
import { useWorkspace } from "../app/WorkspaceContext";
import { date, daysUntil, initials } from "../lib/format";
import {
  Badge,
  Button,
  Empty,
  PageHeading,
  Pagination,
  SearchField,
} from "../components/ui";

export function Drivers() {
  const { mode } = useCompany();
  const { snapshot } = useFleet();
  const { edit, viewTruck } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const attention = params.get("attention") === "license";
  const rows = snapshot.drivers.filter(
    (driver) =>
      `${driver.name} ${driver.email} ${driver.license}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === "all" || driver.status === status) &&
      (!attention || daysUntil(driver.licenseExpiresOn) <= 30),
  );
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  return (
    <>
      <PageHeading
        eyebrow="EQUIPO"
        title="Las personas que mueven tu flota"
        description={`${snapshot.drivers.length} conductores${mode === "demo" ? " de demostración" : " de tu empresa"}. Fichas, asignaciones y permisos al día.`}
      >
        <Button icon={Plus} onClick={() => edit({ kind: "driver" })}>
          Nuevo conductor
        </Button>
      </PageHeading>
      <div className="card list-toolbar drivers-toolbar">
        <SearchField
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Nombre, correo o permiso…"
          label="Buscar conductores"
        />
        <div className="inline-actions">
          {attention && (
            <Button variant="secondary" onClick={() => setParams({})}>
              Permiso ≤ 30 días ×
            </Button>
          )}
          <label className="filter-label">
            <span>Disponibilidad</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="active">Disponibles</option>
              <option value="leave">De permiso</option>
            </select>
          </label>
        </div>
      </div>
      {rows.length ? (
        <div className="driver-grid">
          {rows.slice((actual - 1) * 12, actual * 12).map((driver, index) => {
            const truck = snapshot.trucks.find(
              (truck) => truck.driverId === driver.id,
            );
            const expiring = daysUntil(driver.licenseExpiresOn) <= 30;
            return (
              <article className="card driver-card" key={driver.id}>
                <div className="driver-card-top">
                  <span className={`avatar large color-${index % 4}`}>
                    {initials(driver.name)}
                  </span>
                  <Badge tone={driver.status === "leave" ? "amber" : "green"}>
                    {driver.status === "leave" ? "De permiso" : "Disponible"}
                  </Badge>
                </div>
                <h2>{driver.name}</h2>
                <p className="driver-license">
                  <UserRound size={14} />
                  Permiso {driver.license}
                </p>
                <div className="driver-contact">
                  <span>
                    <Mail size={15} />
                    {driver.email || "Sin correo"}
                  </span>
                  <span>
                    <Phone size={15} />
                    {driver.phone || "Sin teléfono"}
                  </span>
                </div>
                <div className="driver-assignment">
                  <Truck size={17} />
                  <span>Vehículo asignado</span>
                  {truck ? (
                    <button
                      className="text-button strong"
                      onClick={() => viewTruck(truck)}
                    >
                      {truck.plate}
                    </button>
                  ) : (
                    <strong>Sin asignar</strong>
                  )}
                </div>
                <div className={`license-date ${expiring ? "negative" : ""}`}>
                  <CalendarDays size={14} />
                  Vence el {date(driver.licenseExpiresOn)}
                  {expiring && <span>Revisar</span>}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => edit({ kind: "driver", value: driver })}
                >
                  Ver y editar ficha
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="card">
          <Empty />
        </section>
      )}
      <Pagination
        total={rows.length}
        page={actual}
        pageSize={12}
        onChange={setPage}
      />
    </>
  );
}
