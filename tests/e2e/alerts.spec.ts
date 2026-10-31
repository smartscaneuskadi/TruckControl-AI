import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("el aviso urgente aparece en la campana y se revisa sin duplicar su registro", async ({
  page,
}) => {
  await page.goto("/#/alerts");
  await expect(page.locator("h1")).toBeVisible();
  await page.evaluate(() => {
    const core = JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!);
    for (const t of core.trucks) t.inspectionDueOn = "2099-01-01";
    for (const d of core.drivers) d.licenseExpiresOn = "2099-01-01";
    localStorage.setItem("truckcontrol.demo.v1", JSON.stringify(core));
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Añadir registro", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Aviso", { exact: true })
    .fill("Aviso urgente ficticio de prueba");
  await modal
    .getByLabel("Fecha", { exact: true })
    .fill(new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10));
  await modal.getByLabel("Prioridad", { exact: true }).selectOption("urgent");
  await modal
    .getByRole("button", { name: "Guardar registro", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await page
    .getByLabel("Mostrar avisos", { exact: true })
    .selectOption("urgent");
  const alert = page
    .locator(".operation-alert")
    .filter({ hasText: "Aviso urgente ficticio de prueba" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Urgente");
  await page.getByRole("button", { name: /^Ver \d+ avisos$/ }).click();
  await expect(
    page.getByRole("dialog").locator(".notification-list"),
  ).toContainText("Aviso urgente ficticio de prueba");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  await alert.getByRole("button", { name: "Revisado", exact: true }).click();
  await expect(alert).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("truckcontrol.demo.v1")!,
    ).demoOperationsV1.filter(
      (r: { kind: string; data: { title: string } }) =>
        r.kind === "alerts" &&
        r.data.title === "Aviso urgente ficticio de prueba",
    ),
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].data.status).toBe("acknowledged");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.reload();
  await expect(alert).toHaveCount(0);
});
test("el mantenimiento usa el kilometraje de repostajes y no repite avisos revisados al cambiar de día", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-31T12:00:00Z") });
  await page.goto("/#/alerts");
  await expect(page.locator("h1")).toBeVisible();
  await page.evaluate(() => {
    const core = JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!);
    const truck = core.trucks[0],
      maintenance = core.demoOperationsV1.find(
        (r: { kind: string }) => r.kind === "maintenance",
      );
    maintenance.data.status = "completed";
    maintenance.data.scheduledOn = "2026-10-30";
    maintenance.data.completedOn = "2026-10-31";
    maintenance.data.nextDueKm = truck.odometerKm + 500;
    maintenance.data.nextDueOn = null;
    const fuel = structuredClone(
      core.demoOperationsV1.find((r: { kind: string }) => r.kind === "fuel"),
    );
    fuel.id = crypto.randomUUID();
    fuel.data.date = "2026-10-31";
    fuel.data.odometerKm = truck.odometerKm + 600;
    core.demoOperationsV1.push(fuel);
    localStorage.setItem("truckcontrol.demo.v1", JSON.stringify(core));
  });
  await page.reload();
  const alert = page
    .locator(".operation-alert")
    .filter({ hasText: "Revisión por kilometraje" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("revisión desde");
  await expect(alert).toContainText("Urgente");
  await alert.getByRole("button", { name: "Revisado", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-11-01T12:00:00Z"));
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
  await expect(alert).toHaveCount(0);
});
