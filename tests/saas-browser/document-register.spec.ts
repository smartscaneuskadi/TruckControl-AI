import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Download, Page } from "@playwright/test";
const original = Buffer.from(
  "%PDF-1.7\nDocumento ficticio de pruebas sin datos personales.\n%%EOF",
);
async function bytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw Error("Missing download");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function demo(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/dashboard/);
}
test("archivo documental: vencimiento, aviso, modificación, archivo y original conservado", async ({
  page,
}) => {
  await demo(page);
  await page.evaluate(() => {
    location.hash = "/documents";
  });
  await page
    .getByLabel("Documento PDF o imagen", { exact: true })
    .setInputFiles({
      name: "Seguro documental ficticio.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
  await page.getByRole("checkbox", { name: /Confirmo que el/ }).check();
  await page
    .getByRole("combobox", { name: "Tipo de documento", exact: true })
    .selectOption("insurance");
  await page
    .getByLabel("Fecha de vencimiento (opcional)", { exact: true })
    .fill("2000-01-01");
  await page
    .getByRole("button", { name: "Guardar documento de prueba", exact: true })
    .click();
  const card = page.locator("article.document-card").filter({
    has: page.getByRole("heading", {
      name: "Seguro documental ficticio.pdf",
      exact: true,
    }),
  });
  await expect(card).toContainText("Vencido");
  await page.evaluate(() => {
    location.hash = "/alerts";
  });
  await expect(
    page.getByText("Documento · Seguro documental ficticio.pdf", {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/documents";
  });
  await card.getByRole("button", { name: "Ficha y vencimiento" }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Fecha de vencimiento (opcional)", { exact: true })
    .fill("2099-01-01");
  await modal.getByRole("button", { name: "Guardar ficha documental" }).click();
  await expect(modal).toHaveCount(0);
  await expect(card).toContainText("Vigente");
  await page.evaluate(() => {
    location.hash = "/alerts";
  });
  await expect(
    page.getByText("Documento · Seguro documental ficticio.pdf", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "/documents";
  });
  await card.getByRole("button", { name: "Ficha y vencimiento" }).click();
  await modal
    .getByRole("combobox", { name: "Estado del documento", exact: true })
    .selectOption("archived");
  await modal.getByRole("button", { name: "Guardar ficha documental" }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Filtrar estado documental").selectOption("archived");
  await expect(card).toContainText("Archivado");
  const downloaded = page.waitForEvent("download");
  await card.getByRole("button", { name: "Descargar", exact: true }).click();
  expect(await bytes(await downloaded)).toEqual(original);
  await expect(
    page.getByRole("button", { name: "Exportar documentos" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
});
test("informe de camiones exporta las cifras registradas y distingue consumo sin medición", async ({
  page,
}) => {
  await demo(page);
  await page.evaluate(() => {
    location.hash = "/reports";
  });
  await expect(
    page.getByRole("heading", { name: "Indicadores por camión", exact: true }),
  ).toBeVisible();
  const table = page.getByRole("region", {
    name: "Indicadores por camión",
    exact: true,
  });
  await expect(table.locator("tbody tr")).toHaveCount(50);
  const result = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar informe por camión", exact: true })
    .click();
  const csv = (await bytes(await result)).toString("utf8");
  expect(csv).toContain('"Coste EUR/km"');
  expect(csv).toContain('"Consumo medido L/100 km"');
  expect(csv.trim().split(/\r?\n/)).toHaveLength(51);
  await expect(
    page.getByText(/El consumo se calcula solo entre depósitos completos/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
  ).toBe(true);
});
