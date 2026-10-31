import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

async function exportBackup(page: Page) {
  await page.goto("/#/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar copia de registros", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toContain("truckcontrol-demo-registros");
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}
async function review(page: Page, value: unknown) {
  await page
    .getByLabel("Seleccionar copia JSON de la demo", { exact: true })
    .setInputFiles({
      name: "copia-ficticia.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await page
    .getByRole("button", { name: "Revisar copia", exact: true })
    .click();
}
async function accept(page: Page) {
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("checkbox", {
      name: /Confirmo que la copia contiene solo datos ficticios/,
    })
    .check();
  await Promise.all([
    page.waitForEvent("load"),
    modal
      .getByRole("button", { name: "Confirmar restauración", exact: true })
      .click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
}
test("exporta, previsualiza, restaura y recupera fichas y operaciones conservando los archivos", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto("/#/documents");
  await page
    .getByLabel("Documento PDF o imagen", { exact: true })
    .setInputFiles({
      name: "archivo-ficticio-conservado.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% FICTICIO\n%%EOF"),
    });
  await page
    .getByLabel("Confirmo que el archivo contiene únicamente datos ficticios.")
    .check();
  await page
    .getByRole("button", { name: "Guardar documento de prueba", exact: true })
    .click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "archivo-ficticio-conservado.pdf" }),
  ).toBeVisible();
  const backup = await exportBackup(page);
  expect(backup.format).toBe("truckcontrol-demo-records");
  expect(backup.attachmentsIncluded).toBe(false);
  expect(backup.operations).toHaveLength(7);
  const before = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  const originalRoute = backup.fleet.trucks[0].route;
  backup.fleet.trucks[0].route = "Ruta ficticia recuperada";
  backup.operations.find(
    (r: { kind: string }) => r.kind === "customers",
  ).data.name = "Cliente ficticio recuperado";
  await review(page, backup);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar restauración" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
  await review(page, backup);
  await accept(page);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).trucks[0]
          .route,
    ),
  ).toBe("Ruta ficticia recuperada");
  await page.goto("/#/customers");
  await expect(
    page.getByRole("row").filter({ hasText: "Cliente ficticio recuperado" }),
  ).toBeVisible();
  await page.goto("/#/documents");
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "archivo-ficticio-conservado.pdf" }),
  ).toBeVisible();
  await page.goto("/#/settings");
  await page
    .getByRole("button", { name: "Recuperar estado anterior", exact: true })
    .click();
  await accept(page);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).trucks[0]
          .route,
    ),
  ).toBe(originalRoute);
  await page.goto("/#/customers");
  await expect(
    page.getByRole("row").filter({ hasText: "Cliente ficticio recuperado" }),
  ).toHaveCount(0);
  await page.goto("/#/documents");
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "archivo-ficticio-conservado.pdf" }),
  ).toBeVisible();
});
test("rechaza JSON corrupto y copias de empresas sin alterar la demostración", async ({
  page,
}) => {
  const backup = await exportBackup(page),
    before = await page.evaluate(() =>
      localStorage.getItem("truckcontrol.demo.v1"),
    );
  await page
    .getByLabel("Seleccionar copia JSON de la demo", { exact: true })
    .setInputFiles({
      name: "corrupto.json",
      mimeType: "application/json",
      buffer: Buffer.from("{corrupto"),
    });
  await page
    .getByRole("button", { name: "Revisar copia", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("JSON válida");
  backup.fleet.organization.id = "f0000000-0000-4000-8000-000000000099";
  await review(page, backup);
  await expect(page.getByRole("alert")).toContainText("datos de empresas");
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("una edición de otra pestaña impide restaurar una vista previa obsoleta", async ({
  page,
  context,
}) => {
  const backup = await exportBackup(page);
  backup.fleet.trucks[0].route = "Esta copia no debe sustituir el cambio";
  await review(page, backup);
  const other = await context.newPage();
  await other.goto("/#/settings");
  await expect(other.locator("h1")).toBeVisible();
  await other.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!);
    value.trucks[0].route = "Edición ficticia de otra pestaña";
    localStorage.setItem("truckcontrol.demo.v1", JSON.stringify(value));
  });
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("checkbox", {
      name: /Confirmo que la copia contiene solo datos ficticios/,
    })
    .check();
  await modal
    .getByRole("button", { name: "Confirmar restauración", exact: true })
    .click();
  await expect(modal.getByRole("alert")).toContainText("han cambiado");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).trucks[0]
          .route,
    ),
  ).toBe("Edición ficticia de otra pestaña");
  await other.close();
});
