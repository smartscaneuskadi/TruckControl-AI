import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  fixture,
  login,
  openCompanies,
  orgA,
  orgA2,
  orgR,
  root,
  other,
  broadcast,
} from "./fixture";

test("Root activates Full for one company, with audit and no payment request", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await openCompanies(page);
  const row = page.getByRole("article", { name: "Empresa A", exact: true });
  await expect(row).toContainText("Sin asignación manual");
  await row
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row.getByText("Activo", { exact: true })).toBeVisible();
  expect(f.state(orgA).configured).toBe(true);
  expect(f.state(orgA2).configured).toBe(false);
  expect(f.audit).toHaveLength(1);
  expect(f.audit[0].actor_id).toBe(root);
  await row.getByRole("button", { name: "Ver historial", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("root@example.com");
  await expect(page.getByRole("dialog")).toContainText("UTC");
  expect(
    f.calls.some(
      (c) => c.body?.action === "checkout" || c.body?.p_action === "customer",
    ),
  ).toBe(false);
  expect(f.blocked).toEqual([]);
});
for (const mode of ["missing", "mismatch"])
  test(`capability ${mode} fails closed without changing a licence`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    if (mode === "missing") f.controls.cap = false;
    else f.controls.capVersion = 2;
    await login(page);
    await openCompanies(page);
    await expect(page.getByRole("alert")).toContainText(
      "todavía no está disponible",
    );
    await expect(
      page.getByRole("button", { name: "Activar Pack Full", exact: true }),
    ).toHaveCount(0);
    expect(f.calls.some((c) => c.body?.p_action === "set")).toBe(false);
    expect(f.blocked).toEqual([]);
  });
test("an uncertain result retries exactly the same operation and produces one audit entry", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  f.controls.loseAck = true;
  await login(page);
  await openCompanies(page);
  await page
    .getByRole("article", { name: "Empresa A", exact: true })
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "No hemos podido confirmar",
  );
  await dialog
    .getByRole("button", { name: "Reintentar la misma solicitud", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const writes = f.calls.filter((c) => c.body?.p_action === "set");
  expect(writes).toHaveLength(2);
  expect(writes[0].body).toEqual(writes[1].body);
  expect(f.audit).toHaveLength(1);
  expect(f.blocked).toEqual([]);
});
test("a stale revision requires review of the server state before another command", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await openCompanies(page);
  const row = page.getByRole("article", { name: "Empresa A", exact: true });
  await row
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  f.change(orgA, false);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "Otra persona ha cambiado",
  );
  expect(f.state(orgA).enabled).toBe(false);
  expect(f.audit).toHaveLength(1);
  await row
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(row.getByText("Activo", { exact: true })).toBeVisible();
  expect(f.audit).toHaveLength(2);
  expect(f.blocked).toEqual([]);
});
test("an expired owner trial does not block the selected manual Full company or grant its sibling Full", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  f.controls.orgDelay = 250;
  f.change(orgA, true);
  await login(page, "owner");
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".demo-pill")).toContainText("Pack Full · Activo");
  await expect(page.locator("body")).not.toContainText(
    "Tu prueba gratuita ha terminado",
  );
  await page.getByLabel("Empresa activa", { exact: true }).selectOption(orgA2);
  await expect(
    page.getByRole("heading", {
      name: "Elige cómo quieres continuar",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    f.calls.some((c) => c.path === "/rest/v1/trucks" && c.org === orgA2),
  ).toBe(false);
  await page
    .getByLabel("Empresa seleccionada", { exact: true })
    .selectOption(orgA);
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(f.calls.some((c) => c.body?.action === "checkout")).toBe(false);
  expect(f.blocked).toEqual([]);
});
test("explicit OFF overrides a live trial, keeps account access and reactivation retains fleet data", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  f.controls.ownerTrialActive = true;
  f.change(orgA, false);
  await login(page, "owner");
  await expect(
    page.getByRole("heading", { name: "Pack Full de tu empresa", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Desactivado", { exact: true })).toBeVisible();
  expect(f.calls.some((c) => c.path === "/rest/v1/trucks")).toBe(false);
  await expect(
    page.getByRole("button", { name: "Cerrar sesión", exact: true }),
  ).toBeVisible();
  f.change(orgA, true);
  await page
    .getByRole("button", { name: "Comprobar acceso", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await page.goto("/#/trucks");
  await expect(page.locator("main")).toContainText("1111 FUL");
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  expect(f.blocked).toEqual([]);
});
test("expiry closes company commercial views and server reactivation opens the same retained company", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await page.clock.install();
  f.change(orgA, true, new Date(Date.now() + 6000).toISOString());
  await login(page, "owner");
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  f.controls.offset = 10000;
  await page.clock.runFor(10000);
  await expect(
    page.getByRole("heading", { name: "Pack Full de tu empresa", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Vencido", { exact: true })).toBeVisible();
  f.change(orgA, true);
  await page
    .getByRole("button", { name: "Comprobar acceso", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
  expect(f.blocked).toEqual([]);
});
test("root management stays available with its own company explicitly OFF", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  f.change(orgR, false);
  await login(page);
  await openCompanies(page);
  await expect(
    page.getByRole("article", { name: "Empresa Root", exact: true }),
  ).toContainText("Desactivado");
  await page
    .getByRole("article", { name: "Empresa A", exact: true })
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Empresas · Pack Full", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.state(orgA).status).toBe("active");
  expect(f.blocked).toEqual([]);
});
test("a company administrator has no self-grant controls despite editable metadata", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  f.change(orgA, true);
  await login(page, "member");
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Activar Pack Full", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Empresas · Pack Full", exact: true }),
  ).toHaveCount(0);
  expect(f.calls.some((c) => c.path.endsWith("tc_admin_company_full"))).toBe(
    false,
  );
  expect(f.audit).toHaveLength(1);
  expect(f.blocked).toEqual([]);
});
test("a late root response cannot replace another account's company view", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  f.controls.holdSet = true;
  await login(page);
  await openCompanies(page);
  await page
    .getByRole("article", { name: "Empresa A", exact: true })
    .getByRole("button", { name: "Activar Pack Full", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect.poll(() => f.controls.setPending).toBe(true);
  await broadcast(page, f.session(other));
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  f.controls.releaseSet();
  await page.goto("/#/trucks");
  await expect(page.locator("main")).toContainText("3333 FUL");
  await expect(page.locator("body")).not.toContainText("Empresa A");
  expect(f.blocked).toEqual([]);
});
for (const theme of ["light", "cockpit"])
  test(`Full activation is accessible in ${theme}`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page, "root", theme);
    await openCompanies(page);
    await page
      .getByRole("article", { name: "Empresa A", exact: true })
      .getByRole("button", { name: "Activar Pack Full", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(f.blocked).toEqual([]);
  });
