import { expect, test } from "@playwright/test";
import {
  actor,
  broadcast,
  factor,
  goodCode,
  login,
  nativeFixture,
  noSecretStorage,
} from "./fixture";

test("Root must complete native MFA before listing or activating a company Full licence", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Confirma tu autenticador",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  expect(
    f.calls.some((call) => call.path.endsWith("tc_admin_company_full")),
  ).toBe(false);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  const row = page.getByRole("article", {
    name: "Empresa MFA ficticia",
    exact: true,
  });
  await expect(
    row.getByRole("button", { name: "Activar Pack Full", exact: true }),
  ).toBeVisible();
  await row
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  // Losing native AAL2 must also close a licence edit that was already open.
  await expect(page.getByRole("dialog")).toBeVisible();
  await broadcast(page, "TOKEN_REFRESHED", f.session(actor, "aal1"));
  await expect(
    page.getByRole("heading", {
      name: "Confirma tu autenticador",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.controls.manualFullEnabled).toBeNull();
  expect(f.calls.some((call) => call.body?.p_action === "set")).toBe(false);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  await row
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(row.getByText("Activo", { exact: true })).toBeVisible();
  expect(f.controls.manualFullEnabled).toBe(true);
  const writes = f.calls.filter(
    (call) =>
      call.path.endsWith("tc_admin_company_full") &&
      call.body?.p_action === "set",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0].aal).toBe("aal2");
  expect(f.privateCalls().every((call) => call.aal === "aal2")).toBe(true);
  expect(f.calls.some((call) => call.body?.action === "checkout")).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});

test("a company user with completed native MFA still cannot use or self-enable a disabled Full licence", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    company: true,
    factors: [factor()],
  });
  f.controls.manualFullEnabled = false;
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Confirma tu autenticador",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pack Full de tu empresa", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".company-full-account")
      .getByText("Desactivado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Activar Pack Full", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toHaveCount(0);
  expect(
    f.calls.some(
      (call) =>
        call.path === "/rest/v1/trucks" ||
        call.path.endsWith("tc_admin_company_full"),
    ),
  ).toBe(false);
  expect(f.privateCalls().every((call) => call.aal === "aal2")).toBe(true);
  expect(f.controls.manualFullEnabled).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});

test("an active Full licence does not bypass the company native MFA challenge", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    company: true,
    factors: [factor()],
  });
  f.controls.manualFullEnabled = true;
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Confirma tu autenticador",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(f.calls.some((call) => call.path === "/rest/v1/trucks")).toBe(true);
  expect(f.privateCalls().every((call) => call.aal === "aal2")).toBe(true);
  expect(
    f.calls.some(
      (call) =>
        call.path.endsWith("tc_admin_company_full") ||
        call.body?.action === "checkout",
    ),
  ).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
