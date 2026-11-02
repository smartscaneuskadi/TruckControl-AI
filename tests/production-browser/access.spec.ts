import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleCatalog, noFeatures } from "../../src/domain/subscriptions";
const userId = "10000000-0000-4000-8000-000000000091",
  hash = "a".repeat(64),
  now = new Date().toISOString();
const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString("base64url")}.synthetic`;
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@company.invalid",
  email_confirmed_at: now,
  created_at: now,
  updated_at: now,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
};
async function fixtures(
  page: Page,
  open = true,
  basicAfterVerification = false,
) {
  let verified = false;
  const org = "bd200000-0000-4000-8000-000000000001";
  const profile = {
    user_id: userId,
    email: user.email,
    contact_name: "Persona ficticia",
    company_name: "Empresa ficticia",
    tax_id: "DEMO-001",
    address: "Calle ficticia 1",
    phone: "+34600000001",
    requested_plan: "full",
    trial_plan_id: "limited",
    paid_plan: null,
    status: "trial",
    trial_started_at: now,
    trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(),
    paid_until: null,
    ai_allowed: true,
    ai_opt_in: true,
    module_overrides: {},
    created_at: now,
    updated_at: now,
  };
  const access = () => ({
    is_admin: false,
    active: verified,
    profile: verified ? profile : null,
    features: verified ? { ...exampleCatalog.plans[0].modules } : noFeatures,
    plan: "limited",
    max_trucks: 50,
    organization_id: org,
    company_role: "owner",
    can_write: verified,
    can_manage: verified,
    sms_ready: false,
    requires_phone_verification: false,
    prices_are_examples: false,
    payments_enabled: false,
  });
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  await page.route(
    "https://kkkemaycedexymrpaqtp.supabase.co/**",
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      let body: Record<string, unknown> | null = null;
      try {
        body = request.postDataJSON();
      } catch {}
      calls.push({ path, body });
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      let data: unknown = [];
      if (path.endsWith("/tc_public_catalog"))
        data = {
          ...exampleCatalog,
          registration_open: open,
          payments_enabled: false,
        };
      else if (path.endsWith("/company-auth")) data = { accepted: true };
      else if (path === "/auth/v1/verify") {
        verified = true;
        data = {
          access_token: jwt,
          refresh_token: "synthetic-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        };
      } else if (path === "/auth/v1/user") data = user;
      else if (path === "/rest/v1/organizations")
        data =
          basicAfterVerification && verified
            ? [
                {
                  id: org,
                  owner_id: userId,
                  name: "Empresa ficticia",
                  created_at: now,
                },
              ]
            : [];
      else if (
        basicAfterVerification &&
        [
          "/rest/v1/rpc/tc_finish_registration",
          "/rest/v1/rpc/tc_my_access",
          "/rest/v1/rpc/tc_organization_access",
        ].includes(path)
      )
        data = access();
      else if (path.endsWith("/tc_request_plan"))
        data = "bd300000-0000-4000-8000-000000000001";
      else if (path.endsWith("/tc_finish_registration"))
        data = {
          is_admin: false,
          active: false,
          features: noFeatures,
          profile: null,
          plan: "trial",
          max_trucks: 50,
          sms_ready: false,
          requires_phone_verification: false,
          prices_are_examples: false,
          payments_enabled: false,
        };
      return route.fulfill({
        status: 200,
        headers,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  return calls;
}
async function fillSignup(page: Page) {
  for (const [label, value] of [
    ["Nombre y apellidos", "Persona ficticia"],
    ["Nombre de la empresa", "Empresa ficticia"],
    ["NIF / CIF de la empresa", "DEMO-001"],
    ["Dirección fiscal", "Calle ficticia 1"],
    ["Teléfono móvil con prefijo", "+34600000001"],
    ["Correo electrónico", "fixture@company.invalid"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
}
test("el correo confirmado abre una cuenta Básico y solicitar Full no la amplía", async ({
  page,
}) => {
  const calls = await fixtures(page, true, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir Full", exact: true }).click();
  await expect(page.locator(".registration-card")).toContainText(
    "acceso Básico",
  );
  await fillSignup(page);
  await page.getByRole("checkbox", { name: /He leído la privacidad/ }).check();
  await page
    .getByRole("button", { name: "Solicitar acceso Básico", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Confirma tu correo");
  expect(calls.some((c) => c.path === "/rest/v1/organizations")).toBe(false);
  await page.goto(`/#tc-auth=invite&token_hash=${hash}`);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Synthetic-passphrase-123!");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.locator(".workspace-label")).toContainText(
    "Empresa ficticia",
  );
  await expect(page.locator(".demo-pill")).toContainText("Básico");
  const menu = page.getByRole("button", { name: "Abrir menú", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Mi plan y suscripción" }).click();
  await expect(page.locator(".billing-page")).toContainText(
    "prueba del plan Básico",
  );
  await page.getByRole("button", { name: "Elegir Full", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Solicitud del plan Full guardada",
  );
  expect(calls.some((c) => c.path.includes("tc_request_plan"))).toBe(true);
  expect(
    calls.some((c) => c.path.includes("checkout") || c.path.includes("stripe")),
  ).toBe(false);
  await expect(page.locator(".billing-page")).toContainText(
    "prueba del plan Básico",
  );
});
test("alta sin contraseña previa, consentimiento versionado y ninguna llamada SMTP", async ({
  page,
}) => {
  const calls = await fixtures(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Pedir acceso Básico", exact: true })
    .click();
  await fillSignup(page);
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  const checkbox = page.getByRole("checkbox", {
    name: /He leído la privacidad/,
  });
  const bounds = await checkbox.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(18);
  expect(bounds?.width).toBeLessThanOrEqual(24);
  expect(bounds?.height).toBeLessThanOrEqual(24);
  await page
    .getByRole("button", {
      name: "Solicitar acceso Básico",
      exact: true,
    })
    .click();
  expect(calls.some((c) => c.path.endsWith("/company-auth"))).toBe(false);
  await page.getByRole("checkbox", { name: /He leído la privacidad/ }).check();
  await page
    .getByRole("button", {
      name: "Solicitar acceso Básico",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText("Confirma tu correo");
  const body = calls.find((c) => c.path.endsWith("/company-auth"))!.body!;
  expect(body).toMatchObject({
    action: "signup",
    terms_accepted: true,
    terms_version: "2026-11-02",
    registration: { company_name: "Empresa ficticia" },
  });
  expect(body).not.toHaveProperty("password");
  expect(calls.some((c) => c.path === "/auth/v1/signup")).toBe(false);
  await expect(
    page.getByRole("link", { name: "Privacidad", exact: true }),
  ).toHaveAttribute("href", "/?legal=privacy");
});
test("un fallo de correo muestra su causa y conserva la solicitud para reintentar", async ({
  page,
}) => {
  await fixtures(page);
  let attempts = 0;
  await page.route(
    "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-auth",
    (route) => {
      attempts++;
      return route.fulfill({
        status: attempts === 1 ? 503 : 202,
        headers: { "access-control-allow-origin": "*" },
        contentType: "application/json",
        body: JSON.stringify(
          attempts === 1
            ? {
                error: "auth_mail_unavailable",
                debug: "fictitious-private-detail",
              }
            : { accepted: true },
        ),
      });
    },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Pedir acceso Básico", exact: true })
    .click();
  await fillSignup(page);
  await page.getByRole("checkbox", { name: /He leído la privacidad/ }).check();
  const submit = page.getByRole("button", {
    name: "Solicitar acceso Básico",
    exact: true,
  });
  await submit.click();
  await expect(page.getByRole("alert")).toContainText(
    "servicio de confirmación",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "fictitious-private-detail",
  );
  await expect(
    page.getByLabel("NIF / CIF de la empresa", { exact: true }),
  ).toHaveValue("DEMO-001");
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toHaveValue("fixture@company.invalid");
  await expect(
    page.getByRole("checkbox", { name: /He leído la privacidad/ }),
  ).toBeChecked();
  await submit.click();
  await expect(page.getByRole("status")).toContainText("Confirma tu correo");
  expect(attempts).toBe(2);
});
test("registro cerrado y precios visibles sin ofrecer un alta falsa", async ({
  page,
}) => {
  const calls = await fixtures(page, false);
  await page.goto("/");
  await expect(
    page.getByRole("button", {
      name: "Pedir acceso Básico",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".plan-grid")).toContainText("300");
  await expect(page.locator(".plan-grid")).toContainText("700");
  expect(calls.some((c) => c.path.endsWith("/company-auth"))).toBe(false);
});
test("recuperación se envía por el backend sin exponer la existencia de cuenta", async ({
  page,
}) => {
  const calls = await fixtures(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "He olvidado la contraseña" }).click();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("fixture@company.invalid");
  await page
    .getByRole("button", { name: "Enviar enlace de recuperación" })
    .click();
  await expect(page.getByRole("status")).toContainText("Si existe una cuenta");
  expect(calls.find((c) => c.path.endsWith("/company-auth"))?.body).toEqual({
    action: "recovery",
    email: "fixture@company.invalid",
  });
  expect(calls.some((c) => c.path === "/auth/v1/recover")).toBe(false);
});
for (const type of ["invite", "recovery"] as const)
  test(`enlace ${type} fuera del historial y verificación solo al confirmar`, async ({
    page,
  }) => {
    const calls = await fixtures(page);
    await page.goto(`/#tc-auth=${type}&token_hash=${hash}`);
    await expect(
      page.getByRole("button", { name: "Confirmar y continuar" }),
    ).toBeVisible();
    expect(page.url()).not.toContain("token_hash");
    expect(calls.some((c) => c.path === "/auth/v1/verify")).toBe(false);
    await page.getByRole("button", { name: "Confirmar y continuar" }).click();
    await expect(
      page.getByRole("heading", { name: "Recupera tu acceso", exact: true }),
    ).toBeVisible();
    expect(calls.find((c) => c.path === "/auth/v1/verify")?.body).toMatchObject(
      { type, token_hash: hash },
    );
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("Synthetic-passphrase-123!");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect
      .poll(
        () =>
          calls.filter((c) => c.path === "/auth/v1/user" && c.body?.password)
            .length,
      )
      .toBe(1);
  });
test("el enlace ambiguo no consume un token", async ({ page }) => {
  const calls = await fixtures(page);
  await page.goto(
    `/#tc-auth=invite&token_hash=${hash}&redirect=https://evil.invalid`,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Cada kilómetro",
  );
  expect(calls.some((c) => c.path === "/auth/v1/verify")).toBe(false);
});
test("aviso legal, privacidad y encargo se muestran con el titular correcto", async ({
  page,
}) => {
  await fixtures(page);
  for (const kind of ["notice", "privacy", "terms"]) {
    await page.goto(`/?legal=${kind}`);
    await expect(page.locator("main")).toContainText("ELEVADANCOR S.L.");
    if (kind === "notice")
      await expect(page.locator("main")).toContainText("B02993426");
    await expect(
      page.getByRole("button", { name: "Volver a TruckControl AI" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});
test("portal y consentimiento accesibles en los dos temas", async ({
  page,
}) => {
  await fixtures(page);
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Cambiar apariencia", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await dialog.getByRole("radio", { name: theme, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Pedir acceso Básico", exact: true })
      .click();
    await expect(page.getByRole("checkbox")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Volver a los planes", exact: true })
      .click();
  }
});
