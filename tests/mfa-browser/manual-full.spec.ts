import { expect, test } from "@playwright/test";
import {
  actor,
  other,
  broadcast,
  factor,
  goodCode,
  login,
  nativeFixture,
  noSecretStorage,
  openSecurity,
} from "./fixture";

test("a baseline TOKEN_REFRESHED account change validates the new company identity with old Root views unmounted", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  f.controls.companyActor = other;
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  const reads = f.privateCalls().length;
  f.controls.holdUser = true;
  await broadcast(
    page,
    "TOKEN_REFRESHED",
    f.session(other, "aal1", "new-company-session"),
  );
  await expect.poll(() => f.controls.userPending).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.privateCalls()).toHaveLength(reads);
  f.controls.holdUser = false;
  f.controls.releaseUser();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(
    f
      .privateCalls()
      .slice(reads)
      .every((call) => call.actor === other),
  ).toBe(true);
  expect(
    f
      .privateCalls()
      .slice(reads)
      .some((call) => call.path.endsWith("tc_organization_access")),
  ).toBe(true);
  expect(f.calls.some((call) => call.path === "/auth/v1/logout")).toBe(false);
  expect(f.blocked).toEqual([]);
});

test("a baseline TOKEN_REFRESHED account change cannot reuse Root permissions when native identity validation fails", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  f.controls.companyActor = other;
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  const reads = f.privateCalls().length;
  f.controls.failUser = true;
  await broadcast(
    page,
    "TOKEN_REFRESHED",
    f.session(other, "aal1", "failed-company-session"),
  );
  await expect(page.getByRole("alert")).toContainText(
    "No se puede comprobar la seguridad de la sesión",
  );
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toHaveCount(0);
  expect(f.privateCalls()).toHaveLength(reads);
  expect(f.blocked).toEqual([]);
});

test("an unrecognized AAL2 TOKEN_REFRESHED actor change is rejected rather than granting a new MFA context", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  const reads = f.privateCalls().length;
  await broadcast(
    page,
    "TOKEN_REFRESHED",
    f.session(other, "aal2", "unknown-aal2-session"),
  );
  await expect(
    page.getByRole("heading", {
      name: "Bienvenido a TruckControl",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.privateCalls()).toHaveLength(reads);
  expect(f.blocked).toEqual([]);
});

test("an old MFA actor refresh cannot replace another baseline account after the last factor was removed", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.companyActor = other;
  f.controls.loginAal = "aal2";
  f.controls.refreshAal = "aal1";
  f.controls.boundFactor.set(actor, factor().id);
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Quitar autenticador", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect(
    page.getByText("Sin autenticadores verificados", { exact: true }),
  ).toBeVisible();
  const oldMfaRefresh = f.session(actor, "aal1");
  await broadcast(
    page,
    "SIGNED_IN",
    f.session(other, "aal1", "ordinary-other-session"),
  );
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sin autenticadores verificados", { exact: true }),
  ).toBeVisible();
  // Another account's MFA history does not taint this ordinary identity.
  f.controls.holdUser = true;
  await broadcast(
    page,
    "TOKEN_REFRESHED",
    f.session(other, "aal1", "ordinary-other-refreshed-session"),
  );
  await expect.poll(() => f.controls.userPending).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toHaveCount(0);
  f.controls.holdUser = false;
  f.controls.releaseUser();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  const reads = f.privateCalls().length;
  await broadcast(page, "TOKEN_REFRESHED", oldMfaRefresh);
  await expect(
    page.getByRole("heading", {
      name: "Bienvenido a TruckControl",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.privateCalls()).toHaveLength(reads);
  expect(f.blocked).toEqual([]);
});

test("a baseline same-actor SID replacement hides private views until native validation then restores only the current section", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Empresa MFA ficticia", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const reads = f.privateCalls().length;
  f.controls.holdUser = true;
  await broadcast(
    page,
    "TOKEN_REFRESHED",
    f.session(actor, "aal1", "new-baseline-session"),
  );
  await expect.poll(() => f.controls.userPending).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.privateCalls()).toHaveLength(reads);
  f.controls.holdUser = false;
  f.controls.releaseUser();
  await expect(
    page.getByRole("heading", { name: "Empresas · Pack Full", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Empresa MFA ficticia", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("#/admin?section=companies");
  expect(
    f.calls.some(
      (call) =>
        call.path === "/auth/v1/logout" || call.body?.p_action === "set",
    ),
  ).toBe(false);
  expect(f.controls.manualFullEnabled).toBeNull();
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});

test("an unavailable native identity during baseline SID replacement keeps all Root data closed", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Empresa MFA ficticia", exact: true }),
  ).toBeVisible();
  const reads = f.privateCalls().length;
  f.controls.failUser = true;
  await broadcast(
    page,
    "TOKEN_REFRESHED",
    f.session(actor, "aal1", "unavailable-baseline-session"),
  );
  await expect(page.getByRole("alert")).toContainText(
    "No se puede comprobar la seguridad de la sesión",
  );
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: "Empresa MFA ficticia", exact: true }),
  ).toHaveCount(0);
  expect(f.privateCalls()).toHaveLength(reads);
  expect(f.blocked).toEqual([]);
});

test("fresh native factors during baseline SID replacement require a challenge despite the previous no-factor state", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  await login(page);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Empresa MFA ficticia", exact: true }),
  ).toBeVisible();
  const reads = f.privateCalls().length;
  f.controls.factors.set(actor, [factor()]);
  await broadcast(
    page,
    "TOKEN_REFRESHED",
    f.session(actor, "aal1", "new-factor-session"),
  );
  await expect(
    page.getByRole("heading", {
      name: "Confirma tu autenticador",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.privateCalls()).toHaveLength(reads);
  expect(f.blocked).toEqual([]);
});

test("a replayed old MFA refresh cannot replace a newer baseline SID after the last factor was removed", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.loginAal = "aal2";
  f.controls.refreshAal = "aal1";
  f.controls.boundFactor.set(actor, factor().id);
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Quitar autenticador", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect(
    page.getByText("Sin autenticadores verificados", { exact: true }),
  ).toBeVisible();
  expect(
    f.calls.filter(
      (call) => call.path === "/auth/v1/token" && call.body?.refresh_token,
    ),
  ).toHaveLength(1);
  const oldRefresh = f.session(actor, "aal1");
  await broadcast(
    page,
    "SIGNED_IN",
    f.session(actor, "aal1", "new-no-factor-session"),
  );
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Sin autenticadores verificados", { exact: true }),
  ).toBeVisible();
  const reads = f.privateCalls().length;
  await broadcast(page, "TOKEN_REFRESHED", oldRefresh);
  await expect(
    page.getByRole("heading", {
      name: "Bienvenido a TruckControl",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.privateCalls()).toHaveLength(reads);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});

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
