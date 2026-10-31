import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("el menú Android sigue accesible tras mostrar tablas anchas", async ({
  page,
}) => {
  await page.goto("/#/dashboard");
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const menu = page.getByRole("button", { name: "Abrir menú", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
});
test("un viaje se contabiliza una sola vez y conserva el historial al recargar", async ({
  page,
}) => {
  await page.goto("/#/trips");
  const row = page.getByRole("row").filter({ hasText: "DEMO-001" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Estado", { exact: true }).selectOption("completed");
  await modal
    .getByLabel("Llegada", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await modal
    .getByRole("button", { name: "Guardar registro", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await row.getByRole("button", { name: "Contabilizar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toContainText("Contabilizado");
  await page.reload();
  await expect(row).toContainText("Contabilizado");
  const entries = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).entries.filter(
      (e: { concept: string }) => e.concept === "Viaje DEMO-001",
    ),
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].amountCents).toBe(98000);
});
test("los nuevos módulos son accesibles y no ensanchan la pantalla", async ({
  page,
}) => {
  for (const route of [
    "trailers",
    "customers",
    "maintenance",
    "fuel",
    "deadlines",
    "alerts",
    "reports",
  ]) {
    await page.goto(`/#/${route}`);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar contabilidad", exact: true })
    .click();
  expect((await download).suggestedFilename()).toContain("informe-economico");
});
