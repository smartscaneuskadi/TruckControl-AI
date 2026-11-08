import { expect, test } from "@playwright/test";
import en from "../../src/i18n/locales/en.json" with { type: "json" };
import ro from "../../src/i18n/locales/ro.json" with { type: "json" };
import fr from "../../src/i18n/locales/fr.json" with { type: "json" };
for (const [lang, dict] of Object.entries({ en, ro, fr }))
  test(`${lang}: public portal and access form use selected language`, async ({
    page,
  }) => {
    const tr = (key: string) => (dict as Record<string, string>)[key] ?? key;
    await page.goto("/");
    await page.locator(".language-switcher select").selectOption(lang);
    await expect(
      page.getByRole("button", { name: tr("Explorar la demo"), exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: tr("Operación bajo control"),
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: tr("Entrar"), exact: true }).click();
    await expect(
      page.getByLabel(tr("Correo electrónico"), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(tr("Contraseña"), { exact: true }),
    ).toBeVisible();
  });
