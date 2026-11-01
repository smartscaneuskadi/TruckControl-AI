import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("un correo ficticio espera revisión y no duplica su gasto después de recargar", async ({
  page,
}) => {
  await page.goto("/#/invoices");
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!),
  );
  await page.getByRole("button", { name: "Probar correo ficticio" }).click();
  await expect(
    page.getByRole("heading", { name: "Adjuntos listos para revisar" }),
  ).toBeVisible();
  await expect(
    page.getByText("Factura-ficticia.pdf", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importar adjuntos de prueba" })
    .click();
  const invoice = page
    .locator(".document-card")
    .filter({ has: page.getByText("Archivo de correo", { exact: true }) });
  await expect(invoice).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).entries
          .length,
    ),
  ).toBe(before.entries.length);
  await invoice
    .getByRole("button", { name: "Revisar factura", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Fecha de factura", { exact: true })
    .fill(before.demoMonth + "-20");
  await dialog
    .getByLabel("Camión", { exact: true })
    .selectOption(before.trucks[0].id);
  await dialog.getByLabel("Base sin IVA (€)", { exact: true }).fill("100");
  await dialog.getByLabel("IVA (€)", { exact: true }).fill("21");
  await dialog.getByLabel("Total (€)", { exact: true }).fill("121");
  await dialog
    .getByRole("button", { name: "Confirmar y registrar gasto" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(invoice.getByText("Registrada", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Probar correo ficticio" }).click();
  await page
    .getByRole("button", { name: "Importar adjuntos de prueba" })
    .click();
  await expect(
    invoice.getByRole("button", { name: "Revisar factura", exact: true }),
  ).toBeDisabled();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!),
  );
  expect(after.entries).toHaveLength(before.entries.length + 1);
  expect(JSON.stringify(after)).not.toContain("facturas@example.com");
});

test("cancelar la previsualización conserva los datos y Gmail sigue disponible", async ({
  page,
}) => {
  await page.goto("/#/invoices");
  const before = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await page.getByRole("button", { name: "Probar correo ficticio" }).click();
  await page.getByRole("button", { name: "Cancelar importación" }).click();
  await expect(
    page.getByRole("heading", { name: "Adjuntos listos para revisar" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "De tu Gmail a tus gastos",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
});

test("la recepción general y la previsualización son accesibles en Android y Windows", async ({
  page,
}, info) => {
  await page.goto("/#/invoices");
  await page.getByRole("button", { name: "Probar correo ficticio" }).click();
  await expect(
    page.getByRole("heading", { name: "Adjuntos listos para revisar" }),
  ).toBeVisible();
  for (const name of ["Fleet Light", "Fleet Cockpit"]) {
    await page
      .getByRole("button", { name: "Cambiar apariencia", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await dialog.getByRole("radio", { name, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    await expect(
      page.getByRole("heading", { name: "Adjuntos listos para revisar" }),
    ).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(name.replace(/ /g, "-") + ".png"),
      fullPage: true,
    });
  }
});
