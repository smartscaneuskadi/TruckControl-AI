import type { FleetSnapshot, Period } from "./models";
import { categories } from "./models";
import type { OperationRecord } from "./operations";
import { fuelConsumption } from "./operations";
import { filterEntries, truckProfitability } from "./finance";

export function operatingReport(
  snapshot: FleetSnapshot,
  operations: OperationRecord[],
  period: Period,
) {
  const matches = (value: unknown) =>
    period === "all" || String(value).startsWith(period);
  const fuel = operations.filter(
    (r) => r.kind === "fuel" && matches(r.data.date),
  );
  const trips = operations.filter(
    (r) =>
      r.kind === "trips" &&
      r.data.status === "completed" &&
      matches(r.data.endOn || r.data.startOn),
  );
  return truckProfitability(snapshot, period).map((row) => {
    const truckTrips = trips.filter((r) => r.data.truckId === row.truck.id);
    const truckFuel = fuel.filter((r) => r.data.truckId === row.truck.id);
    return {
      ...row,
      completedTrips: truckTrips.length,
      unbookedTrips: truckTrips.filter((r) => !r.financeEntryId).length,
      refuelledLitres:
        truckFuel.reduce((sum, r) => sum + Number(r.data.millilitres), 0) /
        1000,
      measuredConsumption:
        fuelConsumption(truckFuel, row.truck.id)?.litresPer100Km ?? null,
    };
  });
}
export function expenseCategoryReport(snapshot: FleetSnapshot, period: Period) {
  const entries = filterEntries(snapshot.entries, period).filter(
    (r) => r.kind === "expense",
  );
  return Object.entries(categories)
    .filter(([category]) => category !== "transport")
    .map(([category, label]) => ({
      category,
      label,
      amountCents: entries
        .filter((r) => r.category === category)
        .reduce((sum, r) => sum + r.amountCents, 0),
    }));
}
