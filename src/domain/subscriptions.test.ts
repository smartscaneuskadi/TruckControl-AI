import { describe, expect, it } from "vitest";
import { registrationSchema, trialDaysLeft } from "./subscriptions";
describe("registro y presentación de la prueba", () => {
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
