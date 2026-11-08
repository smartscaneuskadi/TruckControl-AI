import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import en from "../../src/i18n/locales/en.json";
import ro from "../../src/i18n/locales/ro.json";
import fr from "../../src/i18n/locales/fr.json";
const dictionaries = { es: {} as Record<string, string>, en, ro, fr };
for (const lang of ["es", "ro", "en", "fr"] as const) {
  test(`${lang}: menu, forms and preference survive reload without changing fleet data`, async ({
    page,
  }) => {
    const tr = (key: string) =>
      (dictionaries[lang] as Record<string, string>)[key] ?? key;
    await page.goto("/#/dashboard");
    await expect(page.locator("main h1")).toBeVisible();
    const before = await page.evaluate(() =>
      localStorage.getItem("truckcontrol.demo.v1"),
    );
    await page.locator(".language-switcher select").selectOption(lang);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator('a[href="#/trucks"]').first()).toContainText(
      tr("Camiones"),
    );
    await page
      .getByRole("button", { name: tr("Registrar ingreso"), exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByLabel(tr("Concepto"), { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: tr("Guardar cambios"), exact: true }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: tr("Cerrar ventana"), exact: true })
      .click();
    await page.reload();
    await expect(page.locator(".language-switcher select")).toHaveValue(lang);
    await expect(page.locator('a[href="#/trucks"]').first()).toContainText(
      tr("Camiones"),
    );
    expect(
      await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
    ).toBe(before);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
  });
}
test("switching language preserves open mail connection and unsent draft", async ({
  page,
}) => {
  await page.goto("/#/mailbox");
  await page
    .getByRole("button", { name: "Probar buzón ficticio", exact: true })
    .click();
  await page.getByRole("button", { name: "Redactar", exact: true }).click();
  const subject = page
    .getByRole("dialog")
    .getByLabel("Asunto", { exact: true });
  await subject.fill("Documento original 123 ñ");
  const preferences = await page.context().newPage();
  await preferences.goto("/#/dashboard");
  for (const lang of ["ro", "en", "fr", "es"] as const) {
    const dict = dictionaries[lang] as Record<string, string>;
    await preferences.locator(".language-switcher select").selectOption(lang);
    await expect(
      page
        .getByRole("dialog")
        .getByLabel(dict["Asunto"] ?? "Asunto", { exact: true }),
    ).toHaveValue("Documento original 123 ñ");
    await expect(page.getByRole("dialog")).toBeVisible();
  }
});
