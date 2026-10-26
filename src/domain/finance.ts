import type { FinanceEntry, FleetSnapshot, Period } from "./models";

/** Monetary calculations always use integer euro cents. Only presentation uses euros. */
export function parseMoney(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Introduce un importe positivo con un máximo de dos decimales, sin separadores de miles.",
    );
  const [whole, decimals = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 10_000_000_000)
    throw new Error(
      "El importe debe ser mayor que 0 y no superar 100.000.000 €.",
    );
  return cents;
}

export function filterEntries(
  entries: FinanceEntry[],
  period: Period,
  truckId?: string,
) {
  return entries.filter(
    (entry) =>
      (period === "all" || entry.date.startsWith(`${period}-`)) &&
      (!truckId || entry.truckId === truckId),
  );
}

export function summarize(entries: FinanceEntry[]) {
  let incomeCents = 0,
    expenseCents = 0,
    pendingIncomeCents = 0,
    pendingExpenseCents = 0,
    distanceKm = 0;
  for (const entry of entries) {
    if (entry.kind === "income") {
      incomeCents += entry.amountCents;
      distanceKm += entry.distanceKm;
      if (entry.paymentStatus === "pending")
        pendingIncomeCents += entry.amountCents;
    } else {
      expenseCents += entry.amountCents;
      if (entry.paymentStatus === "pending")
        pendingExpenseCents += entry.amountCents;
    }
  }
  if (
    ![
      incomeCents,
      expenseCents,
      pendingIncomeCents,
      pendingExpenseCents,
      distanceKm,
    ].every(Number.isSafeInteger)
  ) {
    throw new Error("El volumen de datos supera el rango de cálculo seguro.");
  }
  const profitCents = incomeCents - expenseCents;
  return {
    incomeCents,
    expenseCents,
    profitCents,
    pendingIncomeCents,
    pendingExpenseCents,
    distanceKm,
    margin: incomeCents > 0 ? (profitCents / incomeCents) * 100 : null,
    costPerKmCents: distanceKm > 0 ? expenseCents / distanceKm : null,
  };
}

export function truckProfitability(snapshot: FleetSnapshot, period: Period) {
  const grouped = new Map<string, FinanceEntry[]>();
  for (const entry of filterEntries(snapshot.entries, period)) {
    const items = grouped.get(entry.truckId) ?? [];
    items.push(entry);
    grouped.set(entry.truckId, items);
  }
  return snapshot.trucks.map((truck) => ({
    truck,
    ...summarize(grouped.get(truck.id) ?? []),
  }));
}

export function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function trend(
  snapshot: FleetSnapshot,
  endMonth: string,
  truckId?: string,
) {
  return Array.from({ length: 6 }, (_, index) => {
    const month = shiftMonth(endMonth, index - 5);
    return {
      month,
      ...summarize(filterEntries(snapshot.entries, month, truckId)),
    };
  });
}
