import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("revisa una factura ficticia y evita duplicar el gasto al recargar", async ({
  page,
}) => {
  await page.goto("/#/invoices");
  await expect(
    page.getByRole("heading", { name: "De tu Gmail a tus gastos" }),
  ).toBeVisible();
  const original = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!),
  );
  await page
    .getByRole("button", { name: "Revisar factura", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Camión", { exact: true })
    .selectOption(original.trucks[0].id);
  await dialog
    .getByRole("button", { name: "Confirmar y registrar gasto" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Registrada", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Revisar factura", exact: true }),
  ).toBeDisabled();
  const entries = await page.evaluate(
    () => JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).entries,
  );
  expect(entries).toHaveLength(original.entries.length + 1);
  expect(
    entries.find(
      (entry: { id: string }) =>
        entry.id === "b1000000-0000-4000-8000-000000000001",
    ).amountCents,
  ).toBe(10000);
});

test("explica el acceso pendiente sin modificar la demostración", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await expect(page.locator("main h1")).toBeVisible();
  const before = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await page
    .locator("main")
    .getByRole("button", { name: "Acceso de empresas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acceso de empresas pendiente" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver a la demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
});

test("documentos, facturas y acceso son accesibles y caben en el móvil", async ({
  page,
}) => {
  for (const path of ["documents", "invoices", "settings"]) {
    await page.goto(`/#/${path}`);
    await expect(page.locator("main h1")).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page
    .locator("main")
    .getByRole("button", { name: "Acceso de empresas", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
