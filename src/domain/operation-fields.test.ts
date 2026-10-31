import { describe, expect, it } from "vitest";
import { operationFormData } from "./operation-fields";
import { createDemo } from "../data/demo";
import { demoOperations } from "../data/operations";
import { validateOperations } from "./operations";
describe("registro económico de operaciones", () => {
  it("interpreta céntimos exactos y no redondea silenciosamente un tercer decimal", () => {
    const form = new FormData();
    form.set("amountCents", "345,67");
    expect(operationFormData("trips", form).amountCents).toBe(34567);
    form.set("amountCents", "1.005");
    expect(() => operationFormData("trips", form)).toThrow("dos decimales");
    form.set("amountCents", "0.00");
    expect(operationFormData("trips", form).amountCents).toBe(0);
  });
  it("conserva mililitros exactos y rechaza precisión superior a tres decimales", () => {
    const form = new FormData();
    form.set("millilitres", "12,345");
    form.set("amountCents", "17.29");
    expect(operationFormData("fuel", form).millilitres).toBe(12345);
    form.set("millilitres", "12.3456");
    expect(() => operationFormData("fuel", form)).toThrow("tres decimales");
  });
  it("rechaza un repostaje que hace retroceder el kilometraje entre fechas", () => {
    const fleet = createDemo(),
      rows = demoOperations(fleet);
    const broken = rows.map((r) =>
      r.kind === "fuel" && r.data.odometerKm === 100800
        ? { ...r, data: { ...r.data, odometerKm: 99999 } }
        : r,
    );
    expect(() => validateOperations(broken, fleet)).toThrow("kilometraje");
    expect(() => validateOperations(rows, fleet)).not.toThrow();
  });
});
