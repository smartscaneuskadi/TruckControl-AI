import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { localizeUi } from "../scripts/localize-ui.mjs";
import {
  currentLanguage,
  currentLocale,
  localizedDateFormat,
  localizedNumberFormat,
  setLanguage,
  t,
  validLanguage,
} from "../src/i18n/runtime";
import source from "../src/i18n/source-messages.json";
import en from "../src/i18n/locales/en.json";
import ro from "../src/i18n/locales/ro.json";
import fr from "../src/i18n/locales/fr.json";
afterEach(() => setLanguage("es"));
describe("four interface languages", () => {
  for (const [lang, dict] of Object.entries({ en, ro, fr }))
    it(`${lang}: every interface key and interpolation is present`, () => {
      expect(Object.keys(dict).sort()).toEqual(source.map((x) => x.key).sort());
      for (const { key } of source) {
        const value = (dict as Record<string, string>)[key];
        expect(typeof value, key).toBe("string");
        expect(value.trim(), key).not.toBe("");
        expect((value.match(/\{\d+\}/g) ?? []).sort(), key).toEqual(
          (key.match(/\{\d+\}/g) ?? []).sort(),
        );
      }
    });
  it("defaults to Spanish and rejects unsupported preferences", () => {
    expect(currentLanguage()).toBe("es");
    expect(validLanguage("de")).toBe(false);
    setLanguage("invalid" as "es");
    expect(currentLanguage()).toBe("es");
    expect(t("Camiones")).toBe("Camiones");
  });
  it("uses translated labels and preserves interpolation values", () => {
    for (const lang of ["ro", "en", "fr"] as const) {
      setLanguage(lang);
      expect(t("Camiones")).toBe({ ro, en, fr }[lang]["Camiones"]);
      const key = source.find(
        (x) => x.key.includes("{0}") && x.key.length > 20,
      )!.key;
      const result = t(key, ["Customer ñ 123"]);
      expect(result).toContain("Customer ñ 123");
    }
    expect(t("User authored unique text")).toBe("User authored unique text");
  });
  it("existing date and money formatters follow the selected locale without changing currency", () => {
    const money = localizedNumberFormat({ style: "currency", currency: "EUR" });
    const date = localizedDateFormat({ month: "long", timeZone: "UTC" });
    for (const lang of ["es", "ro", "en", "fr"] as const) {
      setLanguage(lang);
      expect(money.format(1234.56)).toBe(
        new Intl.NumberFormat(currentLocale(), {
          style: "currency",
          currency: "EUR",
        }).format(1234.56),
      );
      expect(date.format(new Date("2026-11-08T12:00:00Z"))).toBe(
        new Intl.DateTimeFormat(currentLocale(), {
          month: "long",
          timeZone: "UTC",
        }).format(new Date("2026-11-08T12:00:00Z")),
      );
    }
  });
  it("transforms UI while preserving field values, email bodies, file and customer names", () => {
    const out = (
      localizeUi() as unknown as {
        transform: (code: string, id: string) => { code: string };
      }
    ).transform(
      `export const View=()=> <><h1>Correo</h1><input placeholder="Asunto" value="income"/><option value="pending">Pendiente</option><p>{selected.text}</p><p>{selected.subject}</p><p>{selected.snippet}</p><p>{item.name}</p><p>{customer.name}</p><p>{source.title}</p><p>{record.description}</p><p>{option.label}</p><p>{fiscalOptions[regime].label}</p></>`,
      "/src/pages/PersonalMail.tsx",
    ) as { code: string };
    expect(out.code).toContain('__tcText("Correo")');
    expect(out.code).toContain('value="income"');
    expect(out.code).toContain('value="pending"');
    for (const data of [
      "selected.text",
      "selected.subject",
      "selected.snippet",
      "item.name",
      "customer.name",
      "source.title",
      "record.description",
    ])
      expect(out.code).not.toContain(`__tcText(${data})`);
    expect(out.code).toContain("__tcText(option.label)");
    expect(out.code).toContain("__tcText(fiscalOptions[regime].label)");
  });
  it("changes date display formatting only, never business enum literals", () => {
    const out = (
      localizeUi() as unknown as {
        transform: (code: string, id: string) => { code: string };
      }
    ).transform(
      `const state={status:"pending",currency:"EUR"};const f=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});export const View=()=> <p>Guardar</p>`,
      "/src/pages/Example.tsx",
    ) as { code: string };
    expect(out.code).toContain("__tcNumberFormat");
    expect(out.code).toContain('status: "pending"');
    expect(out.code).toContain('currency: "EUR"');
  });
  it("keeps all language assets local and excludes authored email text", () => {
    const runtime = readFileSync("src/i18n/runtime.ts", "utf8");
    expect(runtime).not.toMatch(/\bfetch\s*\(/);
    expect(runtime).not.toMatch(/https?:\/\//);
  });
});
