import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const en = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
const ro = JSON.parse(readFileSync("src/i18n/locales/ro.json", "utf8"));
const fr = JSON.parse(readFileSync("src/i18n/locales/fr.json", "utf8"));
import {
  actor,
  other,
  primary,
  backup,
  secret,
  goodCode,
  factor,
  nativeFixture,
  login,
  openSecurity,
  noSecretStorage,
  broadcast,
} from "./fixture";

test("ordinary access stays available without MFA and uses the shared company settings", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { company: true });
  await login(page);
  await openSecurity(page, true);
  await expect(
    page.getByRole("button", { name: "Añadir autenticador", exact: true }),
  ).toBeEnabled();
  expect(f.calls.some((c) => c.path === "/auth/v1/factors")).toBe(false);
  expect(f.calls.some((c) => c.path === "/rest/v1/trucks")).toBe(true);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
for (const mode of ["missing", "mismatch", "failure"] as const)
  test(`capability ${mode} prevents enrollment and preserves ordinary access`, async ({
    page,
    context,
  }) => {
    const f = await nativeFixture(context);
    f.controls.capability =
      mode === "missing"
        ? null
        : mode === "mismatch"
          ? { schema_version: 2, totp_enforcement: true }
          : { schema_version: 1, totp_enforcement: true };
    if (mode === "failure") f.controls.capabilityStatus = 503;
    await login(page);
    await openSecurity(page);
    await expect(
      page.getByRole("button", { name: "Añadir autenticador", exact: true }),
    ).toBeDisabled();
    await expect(page.locator(".mfa-settings")).toContainText(
      "La protección del servidor todavía no está disponible",
    );
    expect(f.calls.some((c) => c.path === "/auth/v1/factors")).toBe(false);
    await noSecretStorage(page);
    expect(f.blocked).toEqual([]);
  });
test("native challenge gates organizations and provisioning, rejects an invalid code, then opens the account", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.capabilityStatus = 503;
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Confirma tu autenticador" }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await page.getByLabel("Código de 6 dígitos").fill("000000");
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("El código no es válido");
  expect(f.privateCalls()).toEqual([]);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.path.endsWith("/verify"))).toHaveLength(2);
  expect(f.privateCalls().every((c) => c.aal === "aal2")).toBe(true);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("persisted native AAL1 sessions are challenged before any private read", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  await page.addInitScript((session) => {
    localStorage.setItem("truckcontrol-auth-v1", JSON.stringify(session));
    sessionStorage.setItem("truckcontrol-company-mode", "yes");
  }, f.session());
  await page.goto("/#/settings");
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  expect(f.calls.some((c) => c.path === "/auth/v1/token")).toBe(false);
  expect(f.blocked).toEqual([]);
});
test("unavailable native factor state fails closed and retry still requires the native challenge", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.failUser = true;
  await login(page);
  await expect(page.getByRole("alert")).toContainText(
    "No se puede comprobar la seguridad de la sesión",
  );
  expect(f.privateCalls()).toEqual([]);
  f.controls.failUser = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  expect(f.blocked).toEqual([]);
});
test("a persisted stale AAL2 token with a removed live factor binding is challenged before private reads", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor(backup, "Respaldo ficticio")],
  });
  await page.addInitScript(
    (session) => {
      localStorage.setItem("truckcontrol-auth-v1", JSON.stringify(session));
      sessionStorage.setItem("truckcontrol-company-mode", "yes");
    },
    f.session(actor, "aal2"),
  );
  await page.goto("/#/settings");
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  expect(
    f.calls.some(
      (c) => c.path.endsWith("tc_verified_session") && c.aal === "aal2",
    ),
  ).toBe(true);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  expect(f.controls.boundFactor.get(actor)).toBe(backup);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("an unavailable authoritative session predicate keeps AAL2 private data closed until retry", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  f.controls.sessionStatus = 503;
  await login(page);
  await expect(page.getByRole("alert")).toContainText(
    "No se puede comprobar la seguridad de la sesión",
  );
  expect(f.privateCalls()).toEqual([]);
  f.controls.sessionStatus = 200;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  expect(f.blocked).toEqual([]);
});
test("a company scope change clears an unfinished setup and leaves its factor unverified", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { company: true });
  const secondOrg = "20000000-0000-4000-8000-000000000152";
  f.controls.organizations.push({
    id: secondOrg,
    name: "Segunda empresa MFA ficticia",
  });
  await login(page);
  await openSecurity(page, true);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(secret);
  await page
    .getByLabel("Empresa activa", { exact: true })
    .selectOption(secondOrg, { force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(secret);
  await expect(page.getByLabel("Empresa activa", { exact: true })).toHaveValue(
    secondOrg,
  );
  expect(f.controls.factors.get(actor)?.[0].status).toBe("unverified");
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("setup remains unverified until native code verification; invalid codes can retry", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Configura tu autenticador",
  });
  await expect(dialog).toContainText(secret);
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml;charset=utf-8,/,
  );
  expect(f.controls.factors.get(actor)?.[0].status).toBe("unverified");
  await noSecretStorage(page);
  await dialog.getByLabel("Código de 6 dígitos").fill("000000");
  await dialog
    .getByRole("button", { name: "Verificar autenticador", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "El código no es válido",
  );
  await expect(dialog.getByLabel("Código de 6 dígitos")).toHaveValue("");
  await dialog.getByLabel("Código de 6 dígitos").fill(goodCode);
  await dialog
    .getByRole("button", { name: "Verificar autenticador", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Autenticador verificado",
  );
  await expect(dialog).toHaveCount(0);
  expect(f.controls.factors.get(actor)?.[0].status).toBe("verified");
  expect(
    f.calls.filter((c) => c.path.endsWith("tc_mfa_protection_status")).length,
  ).toBeGreaterThanOrEqual(4);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("new enrollment verification rechecks backend capability and does not call native verify when it disappears", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  f.controls.capabilityStatus = 503;
  await dialog.getByLabel("Código de 6 dígitos").fill(goodCode);
  await dialog
    .getByRole("button", { name: "Verificar autenticador", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "La protección del servidor todavía no está disponible",
  );
  expect(f.calls.some((c) => c.path.endsWith("/verify"))).toBe(false);
  await dialog
    .getByRole("button", { name: "Cancelar configuración", exact: true })
    .click();
  await expect(page.locator("body")).not.toContainText(secret);
  await expect(page.locator(".mfa-pending-factors")).toBeVisible();
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("a native success response without a verified factor never shows setup success", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  f.controls.ignoreVerification = true;
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Verificar autenticador", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "No se ha podido confirmar el autenticador",
  );
  await expect(
    page.getByText(
      "Autenticador verificado. Ya puedes usar sus códigos para esta cuenta.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("unsafe QR is not rendered or fetched; close and offline clear RAM setup without deleting factors", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  f.controls.unsafeQr = true;
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(secret);
  await expect(page.getByRole("dialog").getByRole("img")).toHaveCount(0);
  await page.getByLabel("Código de 6 dígitos").fill("999999");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(secret);
  expect(f.controls.factors.get(actor)?.[0].status).toBe("unverified");
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  f.controls.unsafeQr = false;
  f.controls.unsafeStyle = true;
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(secret);
  await expect(page.getByRole("dialog").getByRole("img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancelar configuración", exact: true })
    .click();
  const names = f.calls
    .filter((c) => c.path === "/auth/v1/factors")
    .map((c) => c.body?.friendly_name);
  expect(names).toHaveLength(2);
  expect(new Set(names).size).toBe(2);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("provider rect/style QR larger than the former limit is normalized locally", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  f.controls.largeQr = true;
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  const qr = page.getByRole("dialog").getByRole("img");
  await expect(qr).toBeVisible();
  const normalized = await qr.evaluate((element) =>
    decodeURIComponent(
      (element as HTMLImageElement).src.split(",").slice(1).join(","),
    ),
  );
  expect(normalized.length).toBeGreaterThan(262144);
  expect(normalized).not.toMatch(/style=|xmlns:xlink|https:\/\/blocked/);
  expect(normalized).toContain('fill="black"');
  expect(normalized).toContain('fill="white"');
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("pending-factor discard is explicit and removes only the selected current attempt", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [
      factor(primary, "Intento A", "unverified"),
      factor(backup, "Intento B", "unverified"),
    ],
  });
  await login(page);
  await openSecurity(page);
  await page
    .locator(".mfa-pending-factors li")
    .filter({ hasText: "Intento A" })
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Otra sesión podría verificarlo",
  );
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect
    .poll(() => f.controls.factors.get(actor)?.map((factor) => factor.id))
    .toEqual([backup]);
  await openSecurity(page);
  await expect(page.locator(".mfa-pending-factors")).toContainText("Intento B");
  await expect(page.locator(".mfa-pending-factors")).not.toContainText(
    "Intento A",
  );
  expect(f.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("pending discard refuses a factor already verified elsewhere and refreshes the gate", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor(primary, "Intento A", "unverified")],
  });
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Descartar configuración", exact: true })
    .click();
  f.controls.factors.get(actor)![0].status = "verified";
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("native AAL rejection of a concurrent pending-to-verified change refreshes the challenge without deleting it", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor(primary, "Intento A", "unverified")],
  });
  f.controls.holdRemoval = true;
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Descartar configuración", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect.poll(() => f.controls.removalPending).toBe(true);
  f.controls.factors.get(actor)![0].status = "verified";
  f.controls.releaseRemoval();
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.controls.factors.get(actor)?.[0].status).toBe("verified");
  expect(f.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("successful removal still suspends and challenges after the initiating modal was canceled", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor(), factor(backup, "Respaldo ficticio")],
  });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  f.controls.holdRemoval = true;
  await login(page);
  await openSecurity(page);
  await page
    .locator(".mfa-factor-list li")
    .filter({ hasText: "Principal ficticio" })
    .getByRole("button")
    .click();
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect.poll(() => f.controls.removalPending).toBe(true);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  f.controls.releaseRemoval();
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.controls.factors.get(actor)?.map((factor) => factor.id)).toEqual([
    backup,
  ]);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("a late removal cannot refresh or disturb a newer actor session", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor(), factor(backup, "Respaldo ficticio")],
  });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  f.controls.holdRemoval = true;
  await login(page);
  await openSecurity(page);
  await page
    .locator(".mfa-factor-list li")
    .filter({ hasText: "Principal ficticio" })
    .getByRole("button")
    .click();
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect.poll(() => f.controls.removalPending).toBe(true);
  await broadcast(page, "SIGNED_IN", f.session(other, "aal1"));
  await expect(page.locator(".admin-account")).toContainText(
    "other@example.com",
  );
  f.controls.releaseRemoval();
  await expect.poll(() => f.controls.factors.get(actor)?.length).toBe(1);
  await expect(page.locator(".admin-account")).toContainText(
    "other@example.com",
  );
  expect(
    f.calls.some((c) => c.path === "/auth/v1/token" && c.body?.refresh_token),
  ).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("a late removal revalidates a newer same-account SID without refreshing its native session", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor(), factor(backup, "Respaldo ficticio")],
  });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  f.controls.holdRemoval = true;
  await login(page);
  await openSecurity(page);
  await page
    .locator(".mfa-factor-list li")
    .filter({ hasText: "Principal ficticio" })
    .getByRole("button")
    .click();
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect.poll(() => f.controls.removalPending).toBe(true);
  f.controls.boundFactor.set(actor, backup);
  await broadcast(
    page,
    "SIGNED_IN",
    f.session(actor, "aal2", "newer-valid-backup-session"),
  );
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  const reads = f.calls.filter((c) =>
    c.path.endsWith("tc_verified_session"),
  ).length;
  f.controls.releaseRemoval();
  await expect
    .poll(
      () =>
        f.calls.filter((c) => c.path.endsWith("tc_verified_session")).length,
    )
    .toBeGreaterThan(reads);
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  expect(
    f.calls.some((c) => c.path === "/auth/v1/token" && c.body?.refresh_token),
  ).toBe(false);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          atob(
            JSON.parse(
              localStorage.getItem("truckcontrol-auth-v1")!,
            ).access_token.split(".")[1],
          ),
        ).session_id,
    ),
  ).toBe("newer-valid-backup-session");
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("a completed native verification after setup cancellation refreshes factors without restoring the secret", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  f.controls.holdVerify = true;
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Verificar autenticador", exact: true })
    .click();
  await expect.poll(() => f.controls.verificationPending).toBe(true);
  await page
    .getByRole("button", { name: "Cancelar configuración", exact: true })
    .click();
  f.controls.releaseVerify();
  await expect(
    page.getByText("Autenticadores verificados", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(secret);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
for (const event of ["SIGNED_IN", "PASSWORD_RECOVERY"])
  test(`late native verify cannot replace a newer same-actor SID established by ${event}`, async ({
    page,
    context,
  }) => {
    const f = await nativeFixture(context, { factors: [factor()] });
    f.controls.holdVerify = true;
    await login(page);
    await page.getByLabel("Código de 6 dígitos").fill(goodCode);
    await page
      .getByRole("button", { name: "Confirmar código", exact: true })
      .click();
    await expect.poll(() => f.controls.verificationPending).toBe(true);
    await broadcast(
      page,
      event,
      f.session(actor, "aal1", "replacement-same-actor-session"),
    );
    await expect(
      page.getByRole("button", { name: "Confirmar código", exact: true }),
    ).toBeVisible();
    f.controls.releaseVerify();
    await expect(
      page.getByRole("heading", {
        name: "Bienvenido a TruckControl",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.privateCalls()).toEqual([]);
    await noSecretStorage(page);
    expect(f.blocked).toEqual([]);
  });
test("native removal refreshes the session and challenges the remaining backup despite a stale AAL2 JWT", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor(), factor(backup, "Respaldo ficticio")],
  });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  await login(page);
  await openSecurity(page);
  await page
    .locator(".mfa-factor-list li")
    .filter({ hasText: "Principal ficticio" })
    .getByRole("button")
    .click();
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirma tu autenticador" }),
  ).toBeVisible();
  const privateCount = f.privateCalls().length;
  expect(f.controls.factors.get(actor)?.map((factor) => factor.id)).toEqual([
    backup,
  ]);
  await expect
    .poll(() =>
      f.calls.some((c) => c.path === "/auth/v1/token" && c.body?.refresh_token),
    )
    .toBe(true);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  expect(f.controls.boundFactor.get(actor)).toBe(backup);
  expect(f.privateCalls().length).toBeGreaterThan(privateCount);
  expect(f.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("removing the last verified factor requires an explicit warning and restores baseline after native refresh", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Quitar autenticador", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Al quitar el último autenticador",
  );
  await page
    .getByRole("button", { name: "Sí, quitar autenticador", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  await openSecurity(page);
  await expect(
    page.getByText("Sin autenticadores verificados", { exact: true }),
  ).toBeVisible();
  expect(f.controls.factors.get(actor)).toEqual([]);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("unchanged AAL2 refresh keeps an open form; a later AAL1 token closes private content", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", {
      name: "Añadir autenticador de respaldo",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Código de 6 dígitos").fill("999");
  await broadcast(page, "TOKEN_REFRESHED", f.session(actor, "aal2"));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Código de 6 dígitos")).toHaveValue("999");
  const before = f.privateCalls().length;
  await broadcast(page, "TOKEN_REFRESHED", f.session(actor, "aal1"));
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(secret);
  expect(f.privateCalls().length).toBe(before);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("BFCache restoration revalidates fresh native factors and assurance before remounting private content", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.loginAal = "aal2";
  f.controls.boundFactor.set(actor, primary);
  await login(page);
  await openSecurity(page);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toHaveCount(0);
  await page.evaluate(
    (session) =>
      localStorage.setItem("truckcontrol-auth-v1", JSON.stringify(session)),
    f.session(actor, "aal1"),
  );
  const before = f.privateCalls().length;
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls().length).toBe(before);
  expect(f.blocked).toEqual([]);
});
test("password recovery retains native MFA and does not provision while waiting for a code", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  await login(page);
  await broadcast(page, "PASSWORD_RECOVERY", f.session(actor, "aal1"));
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recupera tu acceso", exact: true }),
  ).toBeVisible();
  expect(f.calls.some((c) => c.path.endsWith("tc_finish_registration"))).toBe(
    false,
  );
  expect(f.controls.factors.get(actor)?.[0].status).toBe("verified");
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("late setup after logout and another actor cannot reveal the old secret or delete factors", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  f.controls.holdEnroll = true;
  await login(page);
  await openSecurity(page);
  await page
    .getByRole("button", { name: "Añadir autenticador", exact: true })
    .click();
  await expect.poll(() => f.controls.enrollmentPending).toBe(true);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bienvenido a TruckControl" }),
  ).toBeVisible();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("other@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  f.controls.releaseEnroll();
  await expect.poll(() => f.controls.factors.get(actor)?.length).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(secret);
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("a late native verification response after signout cannot reopen private data", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.holdVerify = true;
  await login(page);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect.poll(() => f.controls.verificationPending).toBe(true);
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  f.controls.releaseVerify();
  await expect(
    page.getByRole("heading", { name: "Bienvenido a TruckControl" }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("native other-tab actor changes replace the challenged actor without carrying factor state", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  await login(page);
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  await broadcast(page, "SIGNED_IN", f.session(other, "aal1"));
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  await expect(page.locator(".admin-account")).toContainText(
    "other@example.com",
  );
  expect(f.privateCalls().every((c) => c.actor === other)).toBe(true);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("a pre-request native signout failure stays closed, ignores late MFA and lets retry revoke the session", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  await login(page);
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.getItem;
    let fail = true;
    Storage.prototype.getItem = function (key) {
      if (fail && key === "truckcontrol-auth-v1") {
        fail = false;
        throw new Error("Synthetic private storage failure");
      }
      return original.call(this, key);
    };
  });
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cerrar sesión", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar", exact: true }),
  ).toBeEnabled();
  expect(f.calls.filter((c) => c.path === "/auth/v1/logout")).toHaveLength(0);
  await broadcast(page, "MFA_CHALLENGE_VERIFIED", f.session(actor, "aal2"));
  await expect(
    page.getByRole("heading", { name: "Cerrar sesión", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Bienvenido a TruckControl",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.path === "/auth/v1/logout")).toHaveLength(1);
  await expect(page.locator("body")).not.toContainText(
    "Synthetic private storage failure",
  );
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("native signout completed while BFCache-suspended remains terminal and permits a fresh same-actor login", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.holdLogout = true;
  await login(page);
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect.poll(() => f.controls.logoutPending).toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  f.controls.releaseLogout();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("truckcontrol-auth-v1")),
    )
    .toBeNull();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: "Bienvenido a TruckControl",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("owner@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar código", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
for (const theme of ["light", "cockpit"])
  test(`setup and four-language challenge are accessible on ${theme}`, async ({
    page,
    context,
  }) => {
    const f = await nativeFixture(context);
    await login(page, { theme });
    await openSecurity(page);
    await page
      .getByRole("button", { name: "Añadir autenticador", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Cancelar configuración", exact: true })
      .click();
    f.controls.factors.set(actor, [factor()]);
    await broadcast(page, "TOKEN_REFRESHED", f.session(actor, "aal1"));
    await expect(
      page.getByRole("button", { name: "Confirmar código", exact: true }),
    ).toBeVisible();
    for (const language of ["ro", "en", "fr", "es"] as const) {
      await page.locator(".language-switcher select").selectOption(language);
      const title =
        language === "es"
          ? "Confirma tu autenticador"
          : { en, ro, fr }[language]["Confirma tu autenticador"];
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await noSecretStorage(page);
    expect(f.blocked).toEqual([]);
  });
