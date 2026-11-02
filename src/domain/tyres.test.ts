import { describe, expect, it } from "vitest";
import {
  emptyTyreData,
  validateTyreForSave,
  tyreRecordSchema,
  tyreWarnings,
  validateTyres,
  validateTyreArchive,
} from "./tyres";
import { operationalAlerts } from "./operations";
import { createDemo } from "../data/demo";
const fleet = createDemo(),
  org = fleet.organization.id,
  stamp = "2026-01-02T12:00:00Z";
const row = () =>
  tyreRecordSchema.parse({
    id: "eb100000-0000-4000-8000-000000000001",
    organizationId: org,
    data: {
      ...emptyTyreData,
      code: "FICTICIO-1",
      status: "mounted",
      truckId: fleet.trucks[0].id,
      position: "Eje 1 izquierda",
    },
    version: 1,
    updatedAt: stamp,
  });
describe("neumáticos: datos medidos, umbrales y avisos", () => {
  it("mantiene datos desconocidos sin convertirlos a cero ni generar sensores o avisos", () => {
    const r = row();
    expect(r.data.treadTenthsMm).toBeNull();
    expect(r.data.pressureKpa).toBeNull();
    expect(tyreWarnings(r, "2026-01-05")).toEqual([]);
    expect(validateTyreForSave(r.data, "2026-01-05")).toEqual(r.data);
  });
  it("acepta cero medido, exige fecha y rechaza mediciones futuras o campos no autorizados", () => {
    const d = row().data;
    expect(
      validateTyreForSave(
        { ...d, treadTenthsMm: 0, pressureKpa: 0, measuredOn: "2026-01-01" },
        "2026-01-05",
      ).treadTenthsMm,
    ).toBe(0);
    for (const p of [
      { treadTenthsMm: 10 },
      { measuredOn: "2026-01-06" },
      { installedOn: "2026-01-06" },
      { pressureKpa: -1 },
      { financeEntryId: crypto.randomUUID() },
      { speed: 80 },
    ])
      expect(() => validateTyreForSave({ ...d, ...p }, "2026-01-05")).toThrow();
  });
  it("requiere una posición montada, presión coherente y no permite ubicaciones de stock", () => {
    const d = row().data;
    for (const p of [
      { position: "" },
      { truckId: null },
      { status: "stock" },
      { minPressureKpa: 900, maxPressureKpa: 800 },
      { installedOn: "2026-01-03", measuredOn: "2026-01-02" },
    ])
      expect(() => validateTyreForSave({ ...d, ...p }, "2026-01-05")).toThrow();
  });
  it("compara solamente mediciones con umbrales configurados, sin inventar límites legales", () => {
    const r = row();
    Object.assign(r.data, {
      measuredOn: "2026-01-01",
      treadTenthsMm: 15,
      pressureKpa: 850,
    });
    expect(tyreWarnings(r, "2026-01-05")).toEqual([]);
    Object.assign(r.data, {
      minTreadTenthsMm: 20,
      minPressureKpa: 900,
      maxPressureKpa: 1000,
    });
    expect(tyreWarnings(r, "2026-01-05").map((w) => w.reason)).toEqual([
      "tread",
      "pressure",
    ]);
    r.data.pressureKpa = 900;
    expect(tyreWarnings(r, "2026-01-05").map((w) => w.reason)).toEqual([
      "tread",
    ]);
    r.data.status = "retired";
    r.data.truckId = null;
    r.data.position = "";
    expect(tyreWarnings(r, "2026-01-05")).toEqual([]);
  });
  it("distingue medición y revisión vencida; reconocer un aviso no oculta una revisión nueva", () => {
    const r = row();
    Object.assign(r.data, {
      measuredOn: "2026-01-01",
      treadTenthsMm: 10,
      minTreadTenthsMm: 20,
      nextCheckOn: "2026-01-04",
    });
    const alerts = operationalAlerts(fleet, [], "2026-01-05", [], [r]).filter(
      (a) => a.href === "/tyres",
    );
    expect(alerts).toHaveLength(2);
    expect(alerts.find((a) => a.reason === "measurement")).toBeTruthy();
    const ack = {
      id: crypto.randomUUID(),
      kind: "alerts" as const,
      data: {
        title: alerts[0].title,
        dueOn: alerts[0].dueOn,
        truckId: r.data.truckId,
        priority: "urgent",
        status: "acknowledged",
        sourceKey: alerts[0].key,
        notes: "",
      },
      version: 1,
      financeEntryId: null,
    };
    expect(
      operationalAlerts(fleet, [ack], "2026-01-06", [], [r]).filter(
        (a) => a.href === "/tyres",
      ),
    ).toHaveLength(1);
    expect(
      operationalAlerts(
        fleet,
        [ack],
        "2026-01-06",
        [],
        [{ ...r, version: 2 }],
      ).filter((a) => a.href === "/tyres"),
    ).toHaveLength(2);
  });
  it("valida empresa, código y posición antes de guardar una copia", () => {
    const a = row();
    const b = { ...a, id: crypto.randomUUID() };
    for (const rows of [
      [a, b],
      [{ ...a, organizationId: crypto.randomUUID() }],
      [
        a,
        {
          ...b,
          data: { ...a.data, code: "OTRO", position: " EJE 1  IZQUIERDA " },
        },
      ],
    ])
      expect(() => validateTyres(rows, org, fleet)).toThrow();
  });
  it("rechaza historial truncado, duplicado, ajeno o distinto del estado actual", () => {
    const a = row(),
      h = {
        id: crypto.randomUUID(),
        organizationId: org,
        tyreId: a.id,
        version: 1,
        data: a.data,
        changedAt: stamp,
      };
    expect(
      validateTyreArchive({ rows: [a], history: [h] }, org, fleet).rows,
    ).toHaveLength(1);
    for (const history of [
      [],
      [h, h],
      [{ ...h, organizationId: crypto.randomUUID() }],
      [{ ...h, data: { ...h.data, notes: "alterado" } }],
    ])
      expect(() =>
        validateTyreArchive({ rows: [a], history }, org, fleet),
      ).toThrow();
  });
});
