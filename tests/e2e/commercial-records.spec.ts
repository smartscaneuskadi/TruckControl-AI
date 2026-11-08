import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("proveedores: crear,archivar y exportar sin modificar contabilidad", async ({
  page,
}) => {
  await page.goto("/#/suppliers");
  await expect(
    page.getByRole("heading", { name: "Proveedores", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await page
    .getByRole("button", { name: "Añadir proveedor", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Nuevo proveedor",
    exact: true,
  });
  await dialog
    .getByLabel("Nombre del proveedor", { exact: true })
    .fill("Taller de prueba ficticio");
  await dialog
    .getByLabel("Identificador fiscal", { exact: true })
    .fill("DEMO-PROVEEDOR");
  await dialog
    .getByRole("button", { name: "Guardar proveedor", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const row = page
    .getByRole("row")
    .filter({ hasText: "Taller de prueba ficticio" });
  await expect(row).toContainText("DEMO-PROVEEDOR");
  await row
    .getByRole("button", { name: "Editar proveedor", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Ficha de proveedor",
    exact: true,
  });
  await dialog.getByLabel("Archivar proveedor", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Guardar proveedor", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await page.getByLabel("Incluir archivados", { exact: true }).check();
  await expect(row).toContainText("Archivado");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar proveedores", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "truckcontrol-proveedores.csv",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
  expect(
    await page.evaluate(() => Object.values(localStorage).join("")),
  ).not.toContain("Taller de prueba ficticio");
});
test("viajes: vincular, revisar y desvincular conserva los movimientos", async ({
  page,
}) => {
  await page.goto("/#/trips");
  const row = page.getByRole("row").filter({ hasText: "DEMO-001" });
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Estado", { exact: true }).selectOption("completed");
  await dialog
    .getByLabel("Llegada", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await dialog
    .getByRole("button", { name: "Guardar registro", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const before = await page.evaluate(() =>
    JSON.stringify(
      JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).entries,
    ),
  );
  await row
    .getByRole("button", { name: "Rentabilidad del viaje", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Rentabilidad del viaje",
    exact: true,
  });
  const selector = dialog.getByLabel("Movimiento existente del mismo camión", {
    exact: true,
  });
  const option = selector
    .locator("option")
    .filter({ hasText: "· Gasto ·" })
    .first();
  await expect(option).toBeAttached();
  const value = await option.getAttribute("value");
  await selector.selectOption(value!);
  await dialog
    .getByRole("button", { name: "Vincular movimiento", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar vínculo", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Desvincular", exact: true }),
  ).toHaveCount(1);
  await dialog
    .getByRole("button", {
      name: "Marcar movimientos como revisados",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar revisión", exact: true })
    .click();
  await expect(dialog.locator(".badge")).toContainText(
    "Movimientos revisados por tu equipo",
  );
  await dialog
    .getByRole("button", { name: "Desvincular", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar desvinculación", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Desvincular", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator(".badge")).toContainText("Pendiente de revisión");
  expect(
    await page.evaluate(() =>
      JSON.stringify(
        JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).entries,
      ),
    ),
  ).toBe(before);
});
for (const theme of ["Fleet Light", "Fleet Cockpit"])
  test(`${theme}: proveedores y rentabilidad accesibles en móvil y ordenador`, async ({
    page,
  }) => {
    await page.goto("/#/suppliers");
    await page
      .getByRole("button", { name: "Cambiar apariencia", exact: true })
      .click();
    const appearance = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
      exact: true,
    });
    await appearance.getByRole("radio", { name: theme, exact: true }).check();
    await appearance
      .getByRole("button", { name: "Aplicar apariencia", exact: true })
      .click();
    await appearance
      .getByRole("button", { name: "Cerrar ventana", exact: true })
      .click();
    for (const path of ["suppliers", "trips"]) {
      await page.evaluate((path) => {
        location.hash = `/${path}`;
      }, path);
      await expect(page.locator("main h1")).toBeVisible();
      if (path === "trips") {
        await page
          .getByRole("row")
          .filter({ hasText: "DEMO-001" })
          .getByRole("button", { name: "Rentabilidad del viaje", exact: true })
          .click();
        await expect(
          page
            .getByRole("dialog")
            .getByText("Presupuesto del viaje", { exact: true }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
  });
