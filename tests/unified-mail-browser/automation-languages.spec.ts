import AxeBuilder from "@axe-core/playwright";
import en from "../../src/i18n/locales/en.json" with { type: "json" };
import ro from "../../src/i18n/locales/ro.json" with { type: "json" };
import fr from "../../src/i18n/locales/fr.json" with { type: "json" };
import { actor, broadcast } from "../mfa-browser/fixture";
import {
  test,
  expect,
  openMail,
  connectGmail,
  noMailStorage,
  importButton,
  selectedTheme,
} from "./fixture";

const sid = "a7100000-0000-4000-8000-000000000003";
const automaticLabel =
  "Revisar facturas automáticamente mientras uso TruckControl";
const activateLabel = "Activar revisión automática";
const stopAllLabel = "Detener todas las revisiones";
const waitingLabel = "Esperando la siguiente revisión autorizada.";

for (const [language, dictionary] of [
  ["en", en],
  ["ro", ro],
  ["fr", fr],
] as const)
  test(`la autorización automática, sus límites y Detener se traducen sin desbordamiento ${language}`, async ({
    page,
    mail,
  }, info) => {
    test.setTimeout(60000);
    await openMail(page, info);
    await broadcast(page, "SIGNED_IN", mail.auth.session(actor, "aal1", sid));
    mail.controls.automation = true;
    await connectGmail(page, mail);
    const tr = dictionary as Record<string, string>;
    for (const key of [
      importButton,
      automaticLabel,
      activateLabel,
      stopAllLabel,
      waitingLabel,
      "Estado de la revisión automática",
      "Revisión automática autorizada",
      "Un documento nuevo como máximo por lote, al menos cinco minutos entre solicitudes y hasta diez lotes por autorización.",
    ])
      expect(tr[key], `Catalog entry for ${key}`).toBeTruthy();
    await page
      .getByRole("combobox", { name: "Idioma", exact: true })
      .selectOption(language);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      selectedTheme(info),
    );
    await page
      .locator(".mail-provider-view:visible")
      .getByRole("button", { name: tr[importButton], exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: tr[importButton],
      exact: true,
    });
    const mode = dialog.locator(".mail-auto-mode input");
    await expect(mode).toBeEnabled();
    await expect(mode).not.toBeChecked();
    await mode.check();
    await expect(
      dialog.getByText(
        tr[
          "Un documento nuevo como máximo por lote, al menos cinco minutos entre solicitudes y hasta diez lotes por autorización."
        ],
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: tr[activateLabel], exact: true }),
    ).toBeDisabled();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    ).toBe(true);
    await dialog.locator(".mail-invoice-consent input").check();
    await dialog
      .getByRole("button", { name: tr[activateLabel], exact: true })
      .click();
    await expect.poll(() => mail.imports().length).toBe(1);
    await expect(
      dialog.getByRole("region", {
        name: tr["Estado de la revisión automática"],
        exact: true,
      }),
    ).toContainText(tr[waitingLabel]);
    await expect(
      dialog.getByRole("heading", {
        name: tr["Revisión automática autorizada"],
        exact: true,
      }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: tr.Cerrar, exact: true }).click();
    await page.evaluate(() => {
      location.hash = "/dashboard";
    });
    const floating = page.locator(".mail-automation-floating");
    await expect(floating).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    ).toBe(true);
    await floating
      .getByRole("button", { name: tr[stopAllLabel], exact: true })
      .click();
    await expect(floating).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await noMailStorage(page);
  });
