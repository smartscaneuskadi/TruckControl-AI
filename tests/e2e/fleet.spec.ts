import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type { FleetSnapshot } from "../../src/domain/models";
import { filterEntries, summarize } from "../../src/domain/finance";
import { money } from "../../src/lib/format";

async function goto(page: Page, path = "/dashboard") {
  await page.goto(`/#${path}`);
  await expect(page.locator("main h1")).toBeVisible();
}
async function snapshot(page: Page): Promise<FleetSnapshot> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!),
  );
}
async function addMovement(
  page: Page,
  kind: "income" | "expense",
  concept: string,
  amount: string,
  truckId: string,
  month: string,
) {
  await goto(page, kind === "income" ? "/income" : "/expenses");
  await page
    .getByRole("button", {
      name: kind === "income" ? "Nuevo ingreso" : "Nuevo gasto",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Concepto", { exact: true }).fill(concept);
  await dialog.getByLabel("Camión", { exact: true }).selectOption(truckId);
  await dialog.getByLabel("Fecha de devengo").fill(`${month}-15`);
  await dialog.getByLabel("Importe (€)").fill(amount);
  if (kind === "income")
    await dialog.getByLabel("Kilómetros del servicio").fill("100");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).not.toBeVisible();
}

test("registra ingresos y gastos, calcula beneficio y conserva los cambios al recargar", async ({
  page,
}) => {
  await goto(page);
  const before = await snapshot(page),
    truck = before.trucks[0];
  const baseline = summarize(
    filterEntries(before.entries, before.demoMonth, truck.id),
  );
  await addMovement(
    page,
    "income",
    "Ingreso ficticio E2E",
    "500,25",
    truck.id,
    before.demoMonth,
  );
  await addMovement(
    page,
    "expense",
    "Gasto ficticio E2E",
    "100,10",
    truck.id,
    before.demoMonth,
  );
  await page.reload();
  const after = await snapshot(page);
  const result = summarize(
    filterEntries(after.entries, before.demoMonth, truck.id),
  );
  expect(result.profitCents).toBe(baseline.profitCents + 40015);
  await goto(page, "/profitability");
  await page
    .getByRole("textbox", { name: "Buscar rentabilidad por camión" })
    .fill(truck.plate);
  await expect(
    page.getByRole("row").filter({ hasText: truck.plate }),
  ).toContainText(money(result.profitCents, true));
  await expect(page.locator(".metrics-grid")).toContainText(
    money(result.profitCents, true),
  );
});

test("crea fichas de conductor y camión y permite asignarlos", async ({
  page,
}) => {
  await goto(page, "/drivers");
  await page.getByRole("button", { name: "Nuevo conductor" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre completo").fill("Conductor Prueba Demo");
  await dialog.getByLabel("Correo electrónico").fill("prueba@example.com");
  await dialog.getByLabel("Vencimiento del permiso").fill("2028-12-31");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).not.toBeVisible();
  await goto(page, "/trucks");
  await page.getByRole("button", { name: "Nuevo camión" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Matrícula", { exact: true }).fill("9999 TST");
  await dialog.getByLabel("Marca", { exact: true }).fill("Marca Demo");
  await dialog.getByLabel("Modelo", { exact: true }).fill("Modelo Demo");
  await dialog.getByLabel("Próxima ITV").fill("2028-12-31");
  await dialog
    .getByLabel("Conductor asignado")
    .selectOption({ label: "Conductor Prueba Demo" });
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("textbox", { name: "Buscar camiones" }).fill("9999 TST");
  await page.getByRole("button", { name: "Ver ficha de 9999 TST" }).click();
  await expect(page.getByRole("dialog")).toContainText("Conductor Prueba Demo");
  await page.getByRole("button", { name: "Editar ficha", exact: true }).click();
  await page.getByLabel("Ruta actual").fill("Ruta de prueba persistida");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.reload();
  expect(
    (await snapshot(page)).trucks.find((t) => t.plate === "9999 TST")?.route,
  ).toBe("Ruta de prueba persistida");
});

test("rechaza matrículas duplicadas y preserva el historial al borrar", async ({
  page,
}) => {
  await goto(page, "/trucks");
  await page.getByRole("button", { name: "Nuevo camión" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Matrícula", { exact: true }).fill("1200 MTR");
  await dialog.getByLabel("Marca", { exact: true }).fill("Demo");
  await dialog.getByLabel("Modelo", { exact: true }).fill("Prueba");
  await dialog.getByLabel("Próxima ITV").fill("2028-12-31");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog.getByRole("alert")).toContainText("matrícula");
  expect((await snapshot(page)).trucks).toHaveLength(50);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Ver ficha de 1200 MTR" }).click();
  await page.getByRole("button", { name: "Editar ficha", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(page.getByRole("alert")).toContainText("historial");
});

test("filtros, exportación y búsqueda global muestran los datos correspondientes", async ({
  page,
}, testInfo) => {
  await goto(page, "/income?payment=pending");
  await expect(
    page.getByRole("combobox", { name: "Filtrar estado de pago" }),
  ).toHaveValue("pending");
  await expect(page.locator("tbody .badge").first()).toHaveText("Pendiente");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath("ingresos-demo.csv");
  await download.saveAs(path);
  expect(await readFile(path, "utf8")).toContain("Pendiente");
  await page.getByRole("button", { name: /Buscar en tu flota/ }).click();
  await page
    .getByRole("textbox", { name: "Buscar en toda la flota" })
    .fill("1200 MTR");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /1200 MTR/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ficha de 1200 MTR");
});

test("navegación adaptable, paginación y análisis sin errores de ejecución", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await goto(page);
  if (testInfo.project.name === "android-layout")
    await page.getByRole("button", { name: "Abrir menú" }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: /Camiones/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu flota de camiones" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page.locator(".pagination")).toContainText("11–20 de 50");
  await page.getByRole("button", { name: /En taller/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  expect(
    await page.evaluate(
      () =>
      document.body.scrollWidth <= document.body.clientWidth,
    ),
  ).toBe(true);
  await goto(page, "/assistant");
  await page.getByRole("link", { name: "Explorar detalle" }).first().click();
  await expect(
    page.getByRole("button", { name: "ITV ≤ 30 días ×" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("demo sin conexión después de la primera carga", async ({
  page,
  context,
}) => {
  await goto(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Todo bajo control." }),
  ).toBeVisible();
  await expect(page.locator(".offline-banner")).toBeVisible();
  await page.getByRole("link", { name: "Ver flota", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tu flota de camiones" }),
  ).toBeVisible();
});

test("restablecimiento confirmado y recuperación de datos dañados", async ({
  page,
}) => {
  await goto(page);
  await page.evaluate(() =>
    localStorage.setItem("truckcontrol.demo.v1", "{corrupto"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("No se han sobrescrito");
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe("{corrupto");
  await page.getByRole("button", { name: "Restablecer demostración" }).click();
  await expect(
    page.getByRole("heading", { name: "Todo bajo control." }),
  ).toBeVisible();
  await goto(page, "/settings");
  await page.getByRole("button", { name: "Restablecer demostración" }).click();
  await page.getByRole("button", { name: "Sí, restablecer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await snapshot(page)).trucks).toHaveLength(50);
});

test("panel accesible y sin solicitudes a Supabase", async ({ page }) => {
  const remoteCalls: string[] = [];
  page.on("request", (request) => {
    if (/supabase\.(co|com)/.test(request.url()))
      remoteCalls.push(request.url());
  });
  await goto(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(remoteCalls).toEqual([]);
});
