import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("la candidata cierra las altas y permite explorar sin pedir credenciales ni contactar proveedores", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:4195")
      await route.continue();
    else {
      external.push(new URL(route.request().url()).origin);
      await route.abort();
    }
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Estado de la versión candidata" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Probar Full gratis 10 días",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Elegir Básico", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Elegir Full", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".plan-card")).toHaveCount(2);
  await expect(page.locator(".plan-tax")).toHaveText([
    "+ 21 % IVA",
    "+ 21 % IVA",
  ]);
  await expect(page.locator(".plan-total").nth(0)).toContainText("363,00");
  await expect(page.locator(".plan-total").nth(1)).toContainText("847,00");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acceso comercial en preparación" }),
  ).toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Volver a la entrada", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/dashboard/);
  await expect(
    page.getByText("Candidata · datos ficticios", { exact: true }),
  ).toBeVisible();
  expect(external).toEqual([]);
});

test("publica procedencia y manifiesto instalable y conserva una entrada offline", async ({
  page,
}) => {
  await page.goto("/");
  const metadata = await page.evaluate(async () =>
    (await fetch("release.json", { cache: "no-store" })).json(),
  );
  expect(metadata).toMatchObject({
    app: "TruckControl AI",
    channel: "candidate",
    companyConnectionBundled: false,
    registrationForcedClosed: true,
  });
  expect(metadata.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  const manifest = await page.evaluate(async () =>
    (await fetch("manifest.webmanifest")).json(),
  );
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Explorar la demo", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/dashboard/);
  await expect(
    page.getByText("Candidata · datos ficticios", { exact: true }),
  ).toBeVisible();
});

test("el acceso de la candidata es accesible en móvil y escritorio", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Estado de la versión candidata" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("candidate-portal.png"),
  });
});
