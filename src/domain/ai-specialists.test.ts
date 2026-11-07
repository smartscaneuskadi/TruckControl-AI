import { describe, it, expect } from "vitest";
import { specialistDigestFacts } from "./ai-specialists";
const digest = (values: Record<string, unknown>) => ({
  kind: "database_rules",
  paid_model_calls: 0,
  statistics: { values },
});
describe("indicadores de avisos con límites de los datos", () => {
  it("muestra vencimientos registrados sin convertir ausencias en cero", () => {
    expect(
      specialistDigestFacts(
        digest({
          maintenance: { overdue: 2, open: 3 },
          drivers: { expiredLicenses: null },
        }),
      ),
    ).toEqual(["Mantenimientos vencidos: 2", "Mantenimientos abiertos: 3"]);
  });
  it("no suma beneficio con gastos ocultos ni grupos parciales", () => {
    for (const value of [
      {
        finance_by_truck: [{ profitCents: null }],
        finance_truck_groups_partial: false,
      },
      {
        finance_by_truck: [{ profitCents: 77000 }],
        finance_truck_groups_partial: true,
      },
    ])
      expect(specialistDigestFacts(digest(value))).toEqual([]);
    expect(
      specialistDigestFacts(
        digest({
          finance_by_truck: [{ profitCents: 110000 }, { profitCents: -33000 }],
          finance_truck_groups_partial: false,
        }),
      )[0],
    ).toMatch(/770,00/);
  });
  it("no representa ausencia de intervalo de combustible como medición", () => {
    expect(
      specialistDigestFacts(
        digest({
          fuel_by_truck: [{ litresPer100Km: null }, { litresPer100Km: 30 }],
          fuel_truck_groups_partial: false,
        }),
      ),
    ).toEqual(["Camiones con consumo medido en el período: 1"]);
  });
  it("descarta payloads arbitrarios, importes inseguros y texto libre del servidor", () => {
    for (const value of [
      null,
      [],
      { kind: "model", paid_model_calls: 1 },
      digest({
        maintenance: { overdue: "<script>" },
        finance_by_truck: [
          { profitCents: Number.MAX_SAFE_INTEGER },
          { profitCents: 100 },
        ],
        finance_truck_groups_partial: false,
      }),
    ])
      expect(specialistDigestFacts(value)).toEqual([]);
  });
});
