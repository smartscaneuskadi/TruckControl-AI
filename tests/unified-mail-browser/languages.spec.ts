import AxeBuilder from "@axe-core/playwright";
import en from "../../src/i18n/locales/en.json" with { type: "json" };
import ro from "../../src/i18n/locales/ro.json" with { type: "json" };
import fr from "../../src/i18n/locales/fr.json" with { type: "json" };
import {
  test,
  expect,
  openMail,
  connectGmail,
  firstMail,
  importButton,
  noMailStorage,
  selectedTheme,
} from "./fixture";

for (const [language, dictionary] of [
  ["en", en],
  ["ro", ro],
  ["fr", fr],
] as const)
  test(`Correo y autorización por cuenta se traducen y conservan idioma ${language}`, async ({
    page,
    mail,
  }, info) => {
    test.setTimeout(60_000);
    await openMail(page, info);
    await connectGmail(page, mail);
    const tr = dictionary as Record<string, string>;
    for (const key of [
      importButton,
      "Correo seleccionado",
      "Empresa de destino",
      "Autorizar y descargar facturas",
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
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(tr["Correo seleccionado"], { exact: true }),
    ).toBeVisible();
    await expect(
      dialog
        .locator(".mail-invoice-authorization")
        .getByText(firstMail, { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText(tr["Empresa de destino"], { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.locator(".mail-invoice-consent input"),
    ).not.toBeChecked();
    await expect(
      dialog.getByRole("button", {
        name: tr["Autorizar y descargar facturas"],
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const overflow = await page.evaluate(() => {
      if (document.body.scrollWidth <= innerWidth) return null;
      return {
        innerWidth,
        bodyWidth: document.body.scrollWidth,
        offenders: [...document.querySelectorAll<HTMLElement>("body *")]
          .map((element) => {
            const rect = element.getBoundingClientRect(),
              style = getComputedStyle(element);
            return {
              tag: element.tagName,
              className:
                typeof element.className === "string"
                  ? element.className
                  : "svg",
              role: element.getAttribute("role"),
              text: element.textContent?.trim().slice(0, 120),
              left: rect.left,
              right: rect.right,
              width: rect.width,
              height: rect.height,
              display: style.display,
              visibility: style.visibility,
              whiteSpace: style.whiteSpace,
              minWidth: style.minWidth,
              overflowX: style.overflowX,
            };
          })
          .filter(
            (entry) =>
              entry.width > 0 &&
              entry.height > 0 &&
              entry.right > innerWidth + 0.5 &&
              entry.visibility !== "hidden" &&
              entry.display !== "none",
          )
          .slice(0, 30),
      };
    });
    if (overflow)
      await info.attach("overflow-layout", {
        body: JSON.stringify(overflow, null, 2),
        contentType: "application/json",
      });
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    ).toBe(true);
    expect(mail.imports()).toEqual([]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.locator("#mail-title")).toHaveText(tr.Correo);
    await expect(page.locator(".mail-open-views")).toHaveCount(0);
    await noMailStorage(page);
  });
