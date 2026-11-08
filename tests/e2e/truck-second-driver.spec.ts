import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createDemo } from "../../src/data/demo";
import { readFile } from "node:fs/promises";

for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
  test(theme+": segundo conductor opcional sin perder el principal ni el formulario", async ({ page }, info) => {
    const fleet = createDemo(new Date("2026-11-08T12:00:00Z"));
    const truck = fleet.trucks[0], second = fleet.drivers[1];
    fleet.trucks[1].driverId = null; // Only this isolated demo fixture frees a driver.
    await page.addInitScript((value) => {
      if (!localStorage.getItem("truckcontrol.demo.v1"))
        localStorage.setItem("truckcontrol.demo.v1", JSON.stringify(value));
    }, fleet);
    await page.goto("/#/trucks");
    await expect(page.locator("main h1")).toBeVisible();
    await page.getByRole("button", { name: "Cambiar apariencia", exact: true }).click();
    const appearance = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
    await appearance.getByRole("radio", { name: theme, exact: true }).check();
    await appearance.getByLabel("Animaciones", { exact: true }).selectOption("off");
    await appearance.getByRole("button", { name: "Aplicar apariencia" }).click();
    await appearance.getByRole("button", { name: "Cerrar ventana" }).click();
    await page.getByRole("textbox", { name: "Buscar camiones" }).fill(truck.plate);
    await page.getByRole("button", { name: "Ver ficha de "+truck.plate }).click();
    await page.getByRole("button", { name: "Editar ficha", exact: true }).click();
    let editor = page.getByRole("dialog");
    await expect(editor.getByLabel("Conductor asignado", { exact: true })).toHaveValue(truck.driverId!);
    await expect(editor.getByLabel("Segundo conductor (opcional)", { exact: true })).toHaveValue("");
    await editor.getByLabel("Segundo conductor (opcional)", { exact: true }).selectOption(second.id);
    await editor.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(editor).not.toBeVisible();
    const row = page.getByRole("row").filter({ hasText: truck.plate });
    expect((await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    await expect(row).toContainText("Segundo conductor");
    await page.getByRole("button", { name: "Ver ficha de "+truck.plate }).click();
    await expect(page.getByRole("dialog")).toContainText(second.name);
    await page.getByRole("button", { name: "Editar ficha", exact: true }).click();
    editor = page.getByRole("dialog");
    await editor.getByLabel("Conductor asignado", { exact: true }).selectOption(second.id);
    await editor.getByLabel("Ruta actual", { exact: true }).fill("Borrador conservado");
    await editor.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(editor.getByRole("alert")).toContainText("deben ser distintos");
    await expect(editor.getByLabel("Conductor asignado", { exact: true })).toHaveValue(second.id);
    await expect(editor.getByLabel("Segundo conductor (opcional)", { exact: true })).toHaveValue(second.id);
    await expect(editor.getByLabel("Ruta actual", { exact: true })).toHaveValue("Borrador conservado");
    await editor.getByLabel("Conductor asignado", { exact: true }).selectOption(truck.driverId!);
    await editor.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(editor).not.toBeVisible();
    await page.reload();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!));
    expect(saved.trucks[0]).toMatchObject({ driverId: truck.driverId, coDriverId: second.id, route: "Borrador conservado" });
    expect(saved.entries).toEqual(fleet.entries);
    await page.goto("/#/drivers");
    await page.getByRole("textbox", { name: "Buscar conductores" }).fill(second.name);
    const card = page.locator("article.driver-card").filter({ hasText: second.name });
    await expect(card).toContainText("Segundo conductor");
    await expect(card).toContainText(truck.plate);
    await page.goto("/#/trucks");
    await page.getByRole("textbox", { name: "Buscar camiones" }).fill(second.name);
    await expect(page.getByRole("row").filter({ hasText: truck.plate })).toBeVisible();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar", exact: true }).click();
    const file = info.outputPath("second-driver.csv");
    await (await downloading).saveAs(file);
    const csv = await readFile(file, "utf8");
    expect(csv).toContain("Segundo conductor");
    expect(csv).toContain(second.name);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth+1)).toBe(true);
    await page.screenshot({ path: info.outputPath("truck-second-driver-"+(theme==="Fleet Light"?"light":"cockpit")+".png"), fullPage: true });
    await page.getByRole("button", { name: "Ver ficha de "+truck.plate }).click();
    await page.getByRole("button", { name: "Editar ficha", exact: true }).click();
    editor = page.getByRole("dialog");
    await editor.getByLabel("Segundo conductor (opcional)", { exact: true }).selectOption("");
    await editor.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(editor).not.toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).trucks[0].driverId)).toBe(truck.driverId);
  });
}
