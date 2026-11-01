import { describe, expect, it } from "vitest";
import {
  exampleCatalog,
  registrationSchema,
  subscriptionPrice,
  trialDaysLeft,
} from "./subscriptions";
describe("registro y presentación de la prueba", () => {
  it("publica diez días Full y los dos planes aprobados sin activar cobros", () => {
    expect(exampleCatalog.trial_days).toBe(10);
    expect(exampleCatalog.prices_are_examples).toBe(false);
    expect(exampleCatalog.payments_enabled).toBe(false);
    expect(
      exampleCatalog.plans
        .filter((p) => p.published !== false)
        .map((p) => [p.name, p.monthly_cents, p.max_trucks]),
    ).toEqual([
      ["Básico", 30000, 50],
      ["Full", 70000, 50],
    ]);
  });
  it("calcula base, IVA y total en céntimos con redondeo monetario", () => {
    expect(subscriptionPrice(30000)).toEqual({
      netCents: 30000,
      vatCents: 6300,
      totalCents: 36300,
    });
    expect(subscriptionPrice(70000)).toEqual({
      netCents: 70000,
      vatCents: 14700,
      totalCents: 84700,
    });
    expect(subscriptionPrice(102)).toEqual({
      netCents: 102,
      vatCents: 21,
      totalCents: 123,
    });
    expect(subscriptionPrice(103)).toEqual({
      netCents: 103,
      vatCents: 22,
      totalCents: 125,
    });
    for (const invalid of [-1, 100.5, NaN, Infinity, 100000001])
      expect(() => subscriptionPrice(invalid)).toThrow();
  });
  it("valida datos de empresa y teléfono internacional sin usar metadatos para autorizar", () => {
    const data = registrationSchema.parse({
      contact_name: "Persona ficticia",
      company_name: "Empresa ficticia",
      tax_id: "DEMO-1",
      address: "Calle ficticia 1",
      phone: "+34600000001",
      requested_plan: "full",
      is_admin: true,
      trial_days: 1000,
    });
    expect(data).not.toHaveProperty("is_admin");
    expect(data).not.toHaveProperty("trial_days");
    expect(
      registrationSchema.safeParse({ ...data, phone: "600000001" }).success,
    ).toBe(false);
  });
  it("muestra un contador sin valores negativos; los permisos vienen del servidor", () => {
    expect(
      trialDaysLeft("2026-11-07T12:00:00Z", Date.parse("2026-10-28T12:00:00Z")),
    ).toBe(10);
    expect(
      trialDaysLeft("2026-10-27T12:00:00Z", Date.parse("2026-10-28T12:00:00Z")),
    ).toBe(0);
  });
});
