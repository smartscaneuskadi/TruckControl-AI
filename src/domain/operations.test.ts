import { describe, expect, it } from "vitest";
import { createDemo } from "../data/demo";
import { demoOperations } from "../data/operations";
import {
  applyOperation,
  fuelConsumption,
  operationalAlerts,
  parseOperation,
  validateOperations,
} from "./operations";
const fleet = createDemo(),
  rows = demoOperations(fleet);
describe("operaciones de transporte", () => {
  it("mantiene la contabilidad independiente de los servicios hasta su revisión", () => {
    expect(validateOperations(rows, fleet)).toHaveLength(7);
    expect(rows.every((r) => !r.financeEntryId)).toBe(true);
  });
  it("calcula consumo entre llenados completos e incluye los repostajes parciales", () => {
    const fuel = rows.filter((r) => r.kind === "fuel"),
      truckId = fleet.trucks[0].id;
    const partial = parseOperation({
      ...fuel[0],
      id: crypto.randomUUID(),
      data: {
        ...fuel[0].data,
        date: fuel[0].data.date,
        odometerKm: 100400,
        millilitres: 100000,
        fullTank: false,
      },
    });
    expect(fuelConsumption(fuel, truckId)?.litresPer100Km).toBe(30);
    expect(
      fuelConsumption([fuel[0], partial, fuel[1]], truckId)?.litresPer100Km,
    ).toBe(42.5);
    expect(fuelConsumption([partial, fuel[1]], truckId)).toBeNull();
  });
  it("rechaza referencias de otra empresa y solapamientos de viajes", () => {
    const trip = rows.find((r) => r.kind === "trips")!;
    expect(() =>
      validateOperations(
        [
          ...rows,
          {
            ...trip,
            id: crypto.randomUUID(),
            data: { ...trip.data, truckId: crypto.randomUUID() },
          },
        ],
        fleet,
      ),
    ).toThrow("no pertenece");
    const running = { ...trip, data: { ...trip.data, status: "in_transit" } };
    expect(() =>
      validateOperations(
        [
          ...rows.filter((r) => r.id !== trip.id),
          running,
          { ...running, id: crypto.randomUUID() },
        ],
        fleet,
      ),
    ).toThrow("asignación duplicada");
  });
  it("no pierde cambios por una versión obsoleta ni elimina activos vinculados", () => {
    const customer = rows.find((r) => r.kind === "customers")!;
    expect(() =>
      applyOperation(
        rows,
        { type: "save", value: customer, expected: 99 },
        fleet,
      ),
    ).toThrow("Otro cambio");
    expect(() =>
      applyOperation(
        rows,
        { type: "save", value: customer, expected: null },
        fleet,
      ),
    ).toThrow("ya existe");
    expect(() =>
      applyOperation(
        rows,
        { type: "delete", id: customer.id, kind: "customers", expected: 1 },
        fleet,
      ),
    ).toThrow("vinculado");
  });
  it("respeta la antelación personalizada y el reconocimiento de alertas", () => {
    const deadline = parseOperation({
      id: crypto.randomUUID(),
      kind: "deadlines",
      data: {
        title: "Permiso ficticio",
        category: "permit",
        dueOn: "2026-11-20",
        remindDays: 5,
        status: "active",
      },
      version: 1,
      financeEntryId: null,
    });
    expect(
      operationalAlerts(fleet, [deadline], "2026-10-28").some(
        (a) => a.title === deadline.data.title,
      ),
    ).toBe(false);
    const due = operationalAlerts(fleet, [deadline], "2026-11-17").find(
      (a) => a.title === deadline.data.title,
    )!;
    expect(due).toBeDefined();
    const ack = parseOperation({
      id: crypto.randomUUID(),
      kind: "alerts",
      data: {
        title: due.title,
        dueOn: due.dueOn,
        sourceKey: due.key,
        status: "acknowledged",
        priority: "normal",
      },
      version: 1,
      financeEntryId: null,
    });
    expect(
      operationalAlerts(fleet, [deadline, ack], "2026-11-17").some(
        (a) => a.key === due.key,
      ),
    ).toBe(false);
  });
});
