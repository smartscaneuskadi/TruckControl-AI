import { describe, it, expect } from "vitest";
import { createDemo } from "../data/demo";
import { parseOperation } from "./operations";
import { operatingReport, expenseCategoryReport } from "./operating-report";
describe("informes operativos con datos registrados", () => {
  it("los viajes finalizados sin contabilizar no se suman a los ingresos", () => {
    const fleet = createDemo();
    fleet.entries = [];
    const trip = parseOperation({
      id: crypto.randomUUID(),
      kind: "trips",
      data: {
        reference: "DEMO",
        truckId: fleet.trucks[0].id,
        origin: "Origen ficticio",
        destination: "Destino ficticio",
        startOn: "2026-10-31",
        endOn: "2026-11-01",
        status: "completed",
        distanceKm: 300,
        amountCents: 60000,
      },
      version: 1,
      financeEntryId: null,
    });
    const row = operatingReport(fleet, [trip], "2026-11")[0];
    expect(row).toMatchObject({
      incomeCents: 0,
      completedTrips: 1,
      unbookedTrips: 1,
      distanceKm: 0,
      costPerKmCents: null,
    });
    expect(operatingReport(fleet, [trip], "2026-10")[0].completedTrips).toBe(0);
  });
  it("distingue litros repostados de consumo medido y no inventa un cero", () => {
    const fleet = createDemo(),
      truckId = fleet.trucks[0].id;
    const fuel = (
      date: string,
      odometerKm: number,
      millilitres: number,
      fullTank = true,
    ) =>
      parseOperation({
        id: crypto.randomUUID(),
        kind: "fuel",
        data: {
          truckId,
          date,
          odometerKm,
          millilitres,
          fullTank,
          station: "Demo",
          amountCents: 10000,
        },
        version: 1,
        financeEntryId: null,
      });
    const start = fuel("2026-11-01", 1000, 200000);
    expect(
      operatingReport(fleet, [start], "2026-11")[0].measuredConsumption,
    ).toBeNull();
    const row = operatingReport(
      fleet,
      [
        start,
        fuel("2026-11-02", 1500, 100000, false),
        fuel("2026-11-03", 2000, 200000),
      ],
      "2026-11",
    )[0];
    expect(row.refuelledLitres).toBe(500);
    expect(row.measuredConsumption).toBe(30);
  });
  it("las categorías cuadran con los gastos del periodo sin duplicar ingresos", () => {
    const fleet = createDemo(),
      period = fleet.demoMonth;
    const result = expenseCategoryReport(fleet, period);
    expect(result.reduce((n, r) => n + r.amountCents, 0)).toBe(
      fleet.entries
        .filter((e) => e.kind === "expense" && e.date.startsWith(period))
        .reduce((n, r) => n + r.amountCents, 0),
    );
  });
});
