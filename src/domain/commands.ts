import type { Driver, FinanceEntry, FleetSnapshot, Truck } from "./models";
import { validateSnapshot } from "./models";

export type FleetCommand =
  | { type: "save-truck"; value: Truck }
  | { type: "save-driver"; value: Driver }
  | { type: "save-entry"; value: FinanceEntry }
  | { type: "delete-truck"; id: string }
  | { type: "delete-driver"; id: string }
  | { type: "delete-entry"; id: string };

function upsert<T extends { id: string }>(items: T[], value: T): T[] {
  return items.some((item) => item.id === value.id)
    ? items.map((item) => (item.id === value.id ? value : item))
    : [...items, value];
}

export function applyCommand(
  snapshot: FleetSnapshot,
  command: FleetCommand,
): FleetSnapshot {
  const next = { ...snapshot };
  switch (command.type) {
    case "save-truck":
      next.trucks = upsert(snapshot.trucks, {
        ...command.value,
        plate: command.value.plate.trim().toUpperCase(),
      });
      break;
    case "save-driver":
      next.drivers = upsert(snapshot.drivers, command.value);
      break;
    case "save-entry":
      next.entries = upsert(snapshot.entries, command.value);
      break;
    case "delete-truck":
      if (snapshot.entries.some((entry) => entry.truckId === command.id))
        throw new Error(
          "Este camión tiene movimientos económicos. Conserva su ficha para mantener el historial.",
        );
      next.trucks = snapshot.trucks.filter((truck) => truck.id !== command.id);
      break;
    case "delete-driver":
      if (snapshot.trucks.some((truck) => truck.driverId === command.id))
        throw new Error(
          "Desasigna al conductor de su camión antes de eliminarlo.",
        );
      next.drivers = snapshot.drivers.filter(
        (driver) => driver.id !== command.id,
      );
      break;
    case "delete-entry":
      next.entries = snapshot.entries.filter(
        (entry) => entry.id !== command.id,
      );
      break;
  }
  return validateSnapshot(next);
}
