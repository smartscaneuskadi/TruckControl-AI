import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { fixture, login, orgA } from "./fixture";

const phrase = "frase-offline-ficticia-para-pruebas";
async function createCopy(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Frase para proteger tu copia", { exact: true })
    .fill(phrase);
  await page
    .getByRole("button", { name: "Activar copia cifrada", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copia cifrada habilitada" }),
  ).toBeVisible();
}
async function openCopy(page: Page) {
  await page
    .getByRole("button", { name: "Abrir copia sin conexión", exact: true })
    .click();
  await page.getByLabel("Frase de desbloqueo", { exact: true }).fill(phrase);
  await page
    .getByRole("button", { name: "Abrir copia cifrada", exact: true })
    .click();
  await expect(page.locator(".offline-workspace-banner")).toBeVisible();
}
async function encrypted(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("truckcontrol-encrypted-offline-v1", 1);
        request.onsuccess = () => {
          const transaction = request.result.transaction("vaults", "readonly");
          const rows = transaction.objectStore("vaults").getAll();
          transaction.oncomplete = () => {
            resolve(JSON.stringify(rows.result));
            request.result.close();
          };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
test("reconnect OFF locks the encrypted workspace without sending its queue; reactivation renews the same retained copy", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  f.change(orgA, true);
  await login(page, "owner");
  await createCopy(page);
  await context.setOffline(true);
  await openCopy(page);
  const menu = page.getByRole("button", { name: "Abrir menú", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await page
    .getByRole("button", { name: "Añadir registro", exact: true })
    .click();
  await page
    .getByLabel("Nombre o razón social", { exact: true })
    .fill("Cliente Full cifrado pendiente");
  await page.getByLabel("NIF / CIF", { exact: true }).fill("DEMO-MANUAL-FULL");
  await page
    .getByRole("button", { name: "Guardar registro", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", {
      name: "Cliente Full cifrado pendiente",
      exact: true,
    }),
  ).toBeVisible();
  const before = await encrypted(page);
  expect(before).not.toContain("Cliente Full cifrado pendiente");
  expect(before).not.toContain(phrase);
  f.change(orgA, false);
  await context.setOffline(false);
  await expect(page.locator(".offline-workspace-banner")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "ya no permite el acceso",
  );
  expect(f.calls.some((c) => c.path.endsWith("tc_save_record"))).toBe(false);
  expect(JSON.parse(await encrypted(page))).toHaveLength(1);
  await page.getByRole("button", { name: "Entendido", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pack Full de tu empresa", exact: true }),
  ).toBeVisible();
  f.change(orgA, true);
  await page
    .getByRole("button", { name: "Comprobar acceso", exact: true })
    .click();
  await page.goto("/#/settings");
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Frase para proteger tu copia", { exact: true })
    .fill(phrase);
  await page
    .getByLabel("Ya tengo una copia cifrada en este navegador", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Desbloquear mi copia", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copia cifrada habilitada" }),
  ).toBeVisible();
  await context.setOffline(true);
  await openCopy(page);
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await expect(
    page.getByRole("cell", {
      name: "Cliente Full cifrado pendiente",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.calls.some((c) => c.path.endsWith("tc_save_record"))).toBe(false);
  expect(f.blocked).toEqual([]);
});

test("the manual expiry also bounds an already unlocked disconnected copy", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await page.clock.install();
  f.change(orgA, true, new Date(Date.now() + 90_000).toISOString());
  await login(page, "owner");
  await createCopy(page);
  await context.setOffline(true);
  await openCopy(page);
  await page.clock.runFor(91_000);
  await expect(page.locator(".offline-workspace-banner")).toHaveCount(0);
  expect(JSON.parse(await encrypted(page))).toHaveLength(1);
  await page
    .getByRole("button", { name: "Abrir copia sin conexión", exact: true })
    .click();
  await page.getByLabel("Frase de desbloqueo", { exact: true }).fill(phrase);
  await page
    .getByRole("button", { name: "Abrir copia cifrada", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "ha caducado",
  );
  expect(f.calls.some((c) => c.path.endsWith("tc_save_record"))).toBe(false);
  expect(f.blocked).toEqual([]);
});
