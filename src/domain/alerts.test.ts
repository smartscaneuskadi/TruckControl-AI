import { describe, expect, it } from "vitest";
import { createDemo } from "../data/demo";
import { demoOperations } from "../data/operations";
import { operationalAlerts, parseOperation } from "./operations";

function fixture() {
  const fleet = createDemo(),
    truck = fleet.trucks[0];
  truck.odometerKm = 100000;
  const maintenance = parseOperation({
    id: crypto.randomUUID(),
    kind: "maintenance",
    version: 1,
    financeEntryId: null,
    data: {
      truckId: truck.id,
      type: "preventive",
      description: "Revisión ficticia",
      scheduledOn: "2026-10-01",
      completedOn: "2026-10-02",
      status: "completed",
      odometerKm: 99000,
      nextDueKm: 100000,
      amountCents: 0,
    },
  });
  return { fleet, truck, maintenance };
}
describe("seguimiento de alertas de flota", () => {
  it("no repite al día siguiente una revisión por kilómetros ya reconocida", () => {
    const { fleet, maintenance } = fixture();
    const alert = operationalAlerts(fleet, [maintenance], "2026-10-31").find(
      (a) => a.reason === "kilometres",
    )!;
    expect(alert.urgent).toBe(true);
    const ack = parseOperation({
      id: crypto.randomUUID(),
      kind: "alerts",
      version: 1,
      financeEntryId: null,
      data: {
        title: alert.title,
        dueOn: alert.dueOn,
        status: "acknowledged",
        priority: "urgent",
        sourceKey: alert.key,
      },
    });
    expect(
      operationalAlerts(fleet, [maintenance, ack], "2026-11-01").some(
        (a) => a.reason === "kilometres",
      ),
    ).toBe(false);
    const changed = {
      ...maintenance,
      data: { ...maintenance.data, nextDueKm: 99999 },
    };
    expect(
      operationalAlerts(fleet, [changed, ack], "2026-11-01").some(
        (a) => a.reason === "kilometres",
      ),
    ).toBe(true);
  });
  it("utiliza lecturas de repostajes realizadas sin anticipar lecturas futuras", () => {
    const { fleet, truck, maintenance } = fixture();
    maintenance.data.nextDueKm = 100500;
    const base = demoOperations(fleet).find((r) => r.kind === "fuel")!;
    const reading = parseOperation({
      ...base,
      id: crypto.randomUUID(),
      data: { ...base.data, date: "2026-10-31", odometerKm: 100600 },
    });
    const alerts = operationalAlerts(
      fleet,
      [maintenance, reading],
      "2026-10-31",
    );
    expect(alerts.find((a) => a.reason === "kilometres")).toMatchObject({
      currentKm: 100600,
      thresholdKm: 100500,
      truckId: truck.id,
    });
    const future = {
      ...reading,
      data: { ...reading.data, date: "2026-11-01" },
    };
    expect(
      operationalAlerts(fleet, [maintenance, future], "2026-10-31").some(
        (a) => a.reason === "kilometres",
      ),
    ).toBe(false);
  });
  it("muestra una prioridad manual urgente incluso fuera de la ventana ordinaria", () => {
    const { fleet } = fixture();
    const manual = parseOperation({
      id: crypto.randomUUID(),
      kind: "alerts",
      version: 1,
      financeEntryId: null,
      data: {
        title: "Aviso urgente ficticio",
        dueOn: "2027-03-01",
        priority: "urgent",
        status: "open",
      },
    });
    expect(
      operationalAlerts(fleet, [manual], "2026-10-31").find(
        (a) => a.sourceId === manual.id,
      ),
    ).toMatchObject({ urgent: true, source: "alerts" });
    const normal = { ...manual, data: { ...manual.data, priority: "normal" } };
    expect(
      operationalAlerts(fleet, [normal], "2026-10-31").some(
        (a) => a.sourceId === manual.id,
      ),
    ).toBe(false);
  });
  it("un aviso manual revisado desaparece sin necesitar un duplicado de reconocimiento", () => {
    const { fleet } = fixture();
    const reviewed = parseOperation({
      id: crypto.randomUUID(),
      kind: "alerts",
      version: 2,
      financeEntryId: null,
      data: {
        title: "Aviso revisado",
        dueOn: "2026-10-01",
        priority: "urgent",
        status: "acknowledged",
      },
    });
    expect(
      operationalAlerts(fleet, [reviewed], "2026-10-31").some(
        (a) => a.sourceId === reviewed.id,
      ),
    ).toBe(false);
  });
  it("una fecha renovada vuelve a generar seguimiento con su clave propia", () => {
    const { fleet } = fixture(),
      truck = fleet.trucks[0];
    truck.inspectionDueOn = "2026-10-30";
    const alert = operationalAlerts(fleet, [], "2026-10-31").find(
      (a) => a.sourceId === truck.id,
    )!;
    const ack = parseOperation({
      id: crypto.randomUUID(),
      kind: "alerts",
      version: 1,
      financeEntryId: null,
      data: {
        title: alert.title,
        dueOn: alert.dueOn,
        status: "acknowledged",
        priority: "urgent",
        sourceKey: alert.key,
      },
    });
    truck.inspectionDueOn = "2026-11-20";
    expect(
      operationalAlerts(fleet, [ack], "2026-10-31").find(
        (a) => a.sourceId === truck.id,
      ),
    ).toMatchObject({ dueOn: "2026-11-20", urgent: false });
  });
});
