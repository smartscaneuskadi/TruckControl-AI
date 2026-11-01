import { ArrowUpRight } from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import type { Truck } from "../domain/models";
import { truckStatuses } from "../domain/models";
import { truckProfitability } from "../domain/finance";
import { initials, money } from "../lib/format";
import { Badge, Empty } from "./ui";
import { VehicleBrand } from "./VehicleBrand";

export function TruckTable({ trucks }: { trucks: Truck[] }) {
  const { snapshot } = useFleet();
  const { period, viewTruck } = useWorkspace();
  const metrics = new Map(
    truckProfitability(snapshot, period).map((row) => [row.truck.id, row]),
  );
  if (!trucks.length) return <Empty />;
  return (
    <div className="table-scroll">
      <table className="data-table fleet-table">
        <thead>
          <tr>
            <th scope="col">Vehículo</th>
            <th scope="col">Conductor</th>
            <th scope="col">Estado</th>
            <th scope="col">Ruta actual</th>
            <th scope="col" className="numeric">
              Beneficio
            </th>
            <th scope="col">
              <span className="sr-only">Ficha</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trucks.map((truck) => {
            const driver = snapshot.drivers.find(
              (driver) => driver.id === truck.driverId,
            );
            const profit = metrics.get(truck.id)?.profitCents ?? 0;
            return (
              <tr key={truck.id}>
                <td>
                  <div className="vehicle-cell">
                    <VehicleBrand brand={truck.brand} />
                    <div>
                      <button
                        className="text-button strong"
                        onClick={() => viewTruck(truck)}
                      >
                        {truck.plate}
                      </button>
                      <small>
                        {truck.brand} {truck.model}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {driver ? (
                    <div className="person-cell">
                      <span className="avatar small">
                        {initials(driver.name)}
                      </span>
                      <span>{driver.name.replace("Demo ", "")}</span>
                    </div>
                  ) : (
                    <span className="muted">Sin asignar</span>
                  )}
                </td>
                <td>
                  <Badge
                    tone={
                      truck.status === "on_route"
                        ? "green"
                        : truck.status === "maintenance"
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {truckStatuses[truck.status]}
                  </Badge>
                </td>
                <td className="route-cell">{truck.route || "—"}</td>
                <td
                  className={`numeric profit ${profit < 0 ? "negative" : "positive"}`}
                >
                  {money(profit)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Ver ficha de ${truck.plate}`}
                    onClick={() => viewTruck(truck)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
