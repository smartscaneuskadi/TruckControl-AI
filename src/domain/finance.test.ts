import { describe, expect, it } from "vitest";
import { createDemo } from "../data/demo";
import {
  filterEntries,
  parseMoney,
  shiftMonth,
  summarize,
  truckProfitability,
} from "./finance";
import type { FinanceEntry } from "./models";

const entry = (
  kind: "income" | "expense",
  amountCents: number,
  extra: Partial<FinanceEntry> = {},
): FinanceEntry => ({
  id: crypto.randomUUID(),
  truckId: "00000003-0000-4000-8000-000000000001",
  kind,
  amountCents,
  date: "2026-10-15",
  concept: "Prueba",
  category: kind === "income" ? "transport" : "fuel",
  paymentStatus: "paid",
  distanceKm: 0,
  ...extra,
});

describe("cálculos monetarios y rentabilidad", () => {
  it.each([
    ["0,10", 10],
    ["0.20", 20],
    ["1234,56", 123456],
    ["001.01", 101],
    [" 9 ", 900],
  ])("convierte %s a %i céntimos sin redondeo binario", (input, expected) =>
    expect(parseMoney(input)).toBe(expected),
  );
  it.each([
    "0",
    "-10",
    "1.001",
    "1,234.56",
    "1.234,56",
    "Infinity",
    "NaN",
    "",
    "1e3",
    "100000001",
  ])("rechaza el importe inválido %s", (input) =>
    expect(() => parseMoney(input)).toThrow(),
  );
  it("suma céntimos e incluye pagos pendientes en devengo", () => {
    const result = summarize([
      entry("income", parseMoney("0.10"), {
        paymentStatus: "pending",
        distanceKm: 10,
      }),
      entry("income", parseMoney("0.20")),
      entry("expense", parseMoney("0.11"), { paymentStatus: "pending" }),
    ]);
    expect(result).toMatchObject({
      incomeCents: 30,
      expenseCents: 11,
      profitCents: 19,
      pendingIncomeCents: 10,
      pendingExpenseCents: 11,
      distanceKm: 10,
      costPerKmCents: 1.1,
    });
  });
  it("muestra N/D cuando no hay ingresos o kilómetros", () => {
    expect(summarize([])).toMatchObject({
      profitCents: 0,
      margin: null,
      costPerKmCents: null,
    });
    expect(summarize([entry("expense", 400)])).toMatchObject({
      profitCents: -400,
      margin: null,
    });
  });
  it("calcula pérdidas y el margen respecto al ingreso, no al gasto", () => {
    expect(
      summarize([entry("income", 10000), entry("expense", 12000)]),
    ).toMatchObject({ profitCents: -2000, margin: -20 });
  });
  it("separa periodos y vehículos en los límites de año", () => {
    const records = [
      entry("income", 100, { date: "2025-12-31" }),
      entry("income", 200, { date: "2026-01-01" }),
      entry("expense", 20, {
        date: "2026-01-31",
        truckId: crypto.randomUUID(),
      }),
    ];
    expect(filterEntries(records, "2026-01", records[0].truckId)).toHaveLength(
      1,
    );
    expect(filterEntries(records, "all")).toHaveLength(3);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("reconcilia el resultado de los 50 camiones con el total de flota", () => {
    const snapshot = createDemo(new Date("2026-10-26T12:00:00Z"));
    const total = summarize(filterEntries(snapshot.entries, "2026-10"));
    const trucks = truckProfitability(snapshot, "2026-10");
    expect(trucks).toHaveLength(50);
    expect(trucks.reduce((sum, row) => sum + row.profitCents, 0)).toBe(
      total.profitCents,
    );
    expect(trucks.filter((row) => row.profitCents < 0).length).toBeGreaterThan(
      0,
    );
  });
});
