import { beforeEach, describe, expect, it } from "vitest";
import { createDemo } from "../data/demo";
import { applyCommand } from "./commands";
import { dateSchema, validateSnapshot } from "./models";
import type { FleetSnapshot } from "./models";

describe("integridad de la flota", () => {
  let snapshot: FleetSnapshot;
  beforeEach(() => {
    snapshot = createDemo(new Date("2026-10-26T12:00:00Z"));
  });
  it("genera únicamente datos ficticios y un conjunto coherente de 50 camiones", () => {
    expect(validateSnapshot(snapshot).trucks).toHaveLength(50);
    expect(snapshot.entries).toHaveLength(2100);
    expect(
      snapshot.drivers.every((driver) => driver.email.endsWith("@example.com")),
    ).toBe(true);
  });
  it("bloquea matrículas duplicadas sin distinguir espacios, guiones o mayúsculas", () => {
    const truck = {
      ...snapshot.trucks[0],
      id: crypto.randomUUID(),
      plate: snapshot.trucks[0].plate.replace(" ", "-").toLowerCase(),
      driverId: null,
    };
    expect(() =>
      applyCommand(snapshot, { type: "save-truck", value: truck }),
    ).toThrow("matrícula");
  });
  it("evita asignar un conductor a dos camiones", () => {
    expect(() =>
      applyCommand(snapshot, {
        type: "save-truck",
        value: { ...snapshot.trucks[1], driverId: snapshot.trucks[0].driverId },
      }),
    ).toThrow("otro camión");
  });
  it("evita poner de permiso a un conductor asignado y eliminarlo", () => {
    expect(() =>
      applyCommand(snapshot, {
        type: "save-driver",
        value: { ...snapshot.drivers[0], status: "leave" },
      }),
    ).toThrow("Desasigna");
    expect(() =>
      applyCommand(snapshot, {
        type: "delete-driver",
        id: snapshot.drivers[0].id,
      }),
    ).toThrow("Desasigna");
  });
  it("preserva el historial al impedir borrar un camión con movimientos", () => {
    expect(() =>
      applyCommand(snapshot, {
        type: "delete-truck",
        id: snapshot.trucks[0].id,
      }),
    ).toThrow("historial");
  });
  it("permite crear y eliminar un camión sin movimientos, sin modificar el estado anterior", () => {
    const truck = {
      ...snapshot.trucks[0],
      id: crypto.randomUUID(),
      plate: "9999 TST",
      driverId: null,
    };
    const updated = applyCommand(snapshot, {
      type: "save-truck",
      value: truck,
    });
    expect(snapshot.trucks).toHaveLength(50);
    expect(updated.trucks).toHaveLength(51);
    expect(
      applyCommand(updated, { type: "delete-truck", id: truck.id }).trucks,
    ).toHaveLength(50);
  });
  it("impide movimientos huérfanos y céntimos fraccionarios", () => {
    expect(() =>
      applyCommand(snapshot, {
        type: "save-entry",
        value: { ...snapshot.entries[0], truckId: crypto.randomUUID() },
      }),
    ).toThrow("inexistente");
    expect(() =>
      applyCommand(snapshot, {
        type: "save-entry",
        value: { ...snapshot.entries[0], amountCents: 3.5 },
      }),
    ).toThrow();
  });
  it("valida fechas reales, incluidos años bisiestos", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(dateSchema.safeParse("2024-02-29").success).toBe(true);
    expect(dateSchema.safeParse("2025-02-29").success).toBe(false);
  });
});
