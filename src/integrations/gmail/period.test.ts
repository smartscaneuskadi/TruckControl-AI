import { describe, expect, it } from "vitest";
import {
  mailPeriodBounds,
  periodCursor,
  presetReceivedPeriod,
  receivedInPeriod,
  resolveMailPeriod,
  savePeriodCursor,
} from "../../../supabase/functions/_shared/mail-period";

const now = Date.parse("2026-11-03T12:00:00Z");
describe("período de recepción de facturas", () => {
  it("usa treinta días completos, incluidos hoy, en Madrid", () => {
    const p = resolveMailPeriod(undefined, now);
    expect({ from: p.from, to: p.to }).toEqual({
      from: "2026-10-05",
      to: "2026-11-03",
    });
    expect(p.start).toBe(Date.parse("2026-10-04T22:00:00Z"));
    expect(p.end).toBe(Date.parse("2026-11-03T23:00:00Z"));
    expect(p.query).toContain(
      `after:${p.start / 1000 - 1} before:${p.end / 1000}`,
    );
    expect(p.query).toContain("-in:sent -in:drafts");
  });
  it("limita la búsqueda a los últimos doce meses, sin ventanas históricas ajenas", () => {
    expect(mailPeriodBounds(now)).toEqual({
      today: "2026-11-03",
      earliest: "2025-11-04",
    });
    expect(presetReceivedPeriod("12m", now)).toEqual({
      from: "2025-11-04",
      to: "2026-11-03",
    });
    expect(presetReceivedPeriod("3m", now).from).toBe("2026-08-04");
    expect(presetReceivedPeriod("6m", now).from).toBe("2026-05-04");
    expect(() =>
      resolveMailPeriod(presetReceivedPeriod("12m", now), now),
    ).not.toThrow();
  });
  it.each([
    null,
    [],
    "all",
    {},
    { from: "2025-11-03", to: "2026-11-03" },
    { from: "2026-01-01", to: "2026-11-04" },
    { from: "2026-11-03", to: "2026-10-03" },
    { from: "2026-02-30", to: "2026-11-03" },
    { from: "2026-2-01", to: "2026-11-03" },
    { from: 1, to: "2026-11-03" },
    { from: "2020-01-01", to: "2020-12-31" },
  ])("rechaza un rango inválido o superior al máximo: %j", (input) => {
    expect(() => resolveMailPeriod(input, now)).toThrow(
      "invalid_received_period",
    );
  });
  it("respeta los días de 23 y 25 horas en lugar de desplazar el límite", () => {
    const spring = resolveMailPeriod(
      { from: "2026-03-29", to: "2026-03-29" },
      now,
    );
    const autumn = resolveMailPeriod(
      { from: "2026-10-25", to: "2026-10-25" },
      now,
    );
    expect(spring.end - spring.start).toBe(23 * 3600000);
    expect(autumn.end - autumn.start).toBe(25 * 3600000);
    expect(new Date(spring.start).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
  });
  it("incluye el día bisiesto y calcula el límite anual sin desbordar febrero", () => {
    const leapNow = Date.parse("2024-02-29T12:00:00Z");
    expect(mailPeriodBounds(leapNow).earliest).toBe("2023-03-01");
    expect(() =>
      resolveMailPeriod({ from: "2024-02-29", to: "2024-02-29" }, leapNow),
    ).not.toThrow();
    expect(mailPeriodBounds(Date.parse("2025-02-28T23:30:00Z")).today).toBe(
      "2025-03-01",
    );
  });
  it("comprueba el instante recibido y los extremos antes de leer contenido", () => {
    const p = resolveMailPeriod({ from: "2026-10-25", to: "2026-10-25" }, now);
    expect(receivedInPeriod(String(p.start), p, now)).toBe(true);
    expect(receivedInPeriod(String(p.end - 1), p, now)).toBe(true);
    for (const invalid of [
      String(p.start - 1),
      String(p.end),
      undefined,
      null,
      -1,
      "1e12",
      "NaN",
      "999999999999999999",
      "2026-10-25",
    ])
      expect(receivedInPeriod(invalid, p, now)).toBe(false);
    expect(
      receivedInPeriod(String(now + 1), resolveMailPeriod(undefined, now), now),
    ).toBe(false);
  });
  it("solo continúa un cursor del mismo período y reinicia los antiguos", () => {
    const p = resolveMailPeriod(undefined, now),
      other = resolveMailPeriod(presetReceivedPeriod("12m", now), now);
    expect(periodCursor(savePeriodCursor("next-page", p), p)).toBe("next-page");
    expect(periodCursor(savePeriodCursor("next-page", p), other)).toBe("");
    expect(periodCursor("legacy-cursor", p)).toBe("");
    expect(periodCursor("x".repeat(4001), p)).toBe("");
    expect(() => savePeriodCursor("x".repeat(3001), p)).toThrow();
    expect(() => savePeriodCursor('"'.repeat(2500), p)).toThrow();
  });
});
