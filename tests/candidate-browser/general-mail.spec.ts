import { expect, test } from "@playwright/test";

test("el correo ficticio funciona con la PWA sin red y sin contactar proveedores", async ({
  page,
  context,
}) => {
  let companyRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith(".supabase.co"))
      companyRequests++;
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await page.goto("/#/invoices");
  await expect(
    page.getByRole("heading", { name: "Del correo a tus gastos", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await page.goto("/#/invoices");
  await expect(
    page.getByRole("heading", { name: "Del correo a tus gastos", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Probar correo ficticio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Adjuntos listos para revisar",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importar adjuntos de prueba", exact: true })
    .click();
  await expect(
    page
      .locator(".document-card")
      .filter({ has: page.getByText("Archivo de correo", { exact: true }) }),
  ).toHaveCount(1);
  expect(companyRequests).toBe(0);
  await context.setOffline(false);
});
