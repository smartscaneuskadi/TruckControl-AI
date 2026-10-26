import { useState } from "react";
import { ArrowUpRight, Search, Truck, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import { Empty, Modal } from "./ui";

export function GlobalSearch({ onClose }: { onClose(): void }) {
  const { snapshot } = useFleet();
  const { viewTruck, edit, setPeriod } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const trucks = q
    ? snapshot.trucks
        .filter((truck) =>
          `${truck.plate} ${truck.brand} ${truck.model}`
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 5)
    : [];
  const drivers = q
    ? snapshot.drivers
        .filter((driver) =>
          `${driver.name} ${driver.email}`.toLowerCase().includes(q),
        )
        .slice(0, 4)
    : [];
  const entries = q
    ? snapshot.entries
        .filter((entry) => entry.concept.toLowerCase().includes(q))
        .slice(-3)
        .reverse()
    : [];
  return (
    <Modal title="Buscar en tu flota" onClose={onClose}>
      <div className="global-search-input">
        <Search size={21} />
        <input
          autoFocus
          placeholder="Matrícula, conductor o movimiento…"
          aria-label="Buscar en toda la flota"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="global-results">
        {trucks.map((truck) => (
          <button
            key={truck.id}
            onClick={() => {
              onClose();
              viewTruck(truck);
            }}
          >
            <Truck size={19} />
            <span>
              <strong>{truck.plate}</strong>
              <small>
                {truck.brand} {truck.model}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {drivers.map((driver) => (
          <button
            key={driver.id}
            onClick={() => {
              onClose();
              edit({ kind: "driver", value: driver });
            }}
          >
            <UserRound size={19} />
            <span>
              <strong>{driver.name}</strong>
              <small>Ficha de conductor</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              onClose();
              setPeriod(entry.date.slice(0, 7));
              navigate(
                `/${entry.kind === "income" ? "income" : "expenses"}?search=${encodeURIComponent(entry.concept)}`,
              );
            }}
          >
            <Search size={19} />
            <span>
              <strong>{entry.concept}</strong>
              <small>
                {entry.date} · {entry.kind === "income" ? "Ingreso" : "Gasto"}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {q && !trucks.length && !drivers.length && !entries.length && <Empty />}
        {!q && (
          <p className="search-hint">
            Encuentra vehículos, personas y movimientos sin salir de tu espacio
            de trabajo.
          </p>
        )}
      </div>
    </Modal>
  );
}
