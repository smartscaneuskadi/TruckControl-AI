import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const ownerA = "10000000-0000-4000-8000-000000000061";
const ownerB = "10000000-0000-4000-8000-000000000062";
const orgA = "20000000-0000-4000-8000-000000000061";
const orgA2 = "20000000-0000-4000-8000-000000000063";
const orgB = "20000000-0000-4000-8000-000000000062";
const ticket = "t".repeat(43);
function jwt(id: string) {
  return `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.synthetic`;
}
function user(id: string) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === ownerA ? "a@example.com" : "b@example.com",
    email_confirmed_at: "2026-10-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
  };
}
async function fixture(page: Page) {
  const calls: {
    path: string;
    data: Record<string, unknown> | null;
    actor: string | null;
  }[] = [];
  let connected = false;
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method();
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4184",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,prefer",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Content-Type": "application/json",
    };
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    const raw = req.headers().authorization?.replace(/^Bearer /, "");
    const actor = raw?.startsWith("ey")
      ? JSON.parse(Buffer.from(raw.split(".")[1], "base64url").toString()).sub
      : null;
    const data = req.postDataJSON();
    calls.push({ path: url.pathname, data, actor });
    let body: unknown = [];
    if (url.pathname === "/auth/v1/token") {
      const id = data.email === "a@example.com" ? ownerA : ownerB;
      body = {
        access_token: jwt(id),
        refresh_token: `synthetic-${id}`,
        token_type: "bearer",
        expires_in: 3600,
        user: user(id),
      };
    } else if (url.pathname === "/auth/v1/user") body = user(actor);
    else if (url.pathname === "/auth/v1/logout") body = {};
    else if (url.pathname === "/rest/v1/organizations")
      body =
        actor === ownerA
          ? [
              { id: orgA, name: "Empresa ficticia A" },
              { id: orgA2, name: "Empresa ficticia A2" },
            ]
          : [{ id: orgB, name: "Empresa ficticia B" }];
    else if (
      [
        "/rest/v1/trucks",
        "/rest/v1/drivers",
        "/rest/v1/finance_entries",
      ].includes(url.pathname)
    ) {
      const organization = url.searchParams
        .get("organization_id")
        ?.replace(/^eq\./, "");
      expect(actor === ownerA ? [orgA, orgA2] : [orgB]).toContain(organization);
    } else if (url.pathname === "/rest/v1/rpc/get_company_gmail") {
      expect(actor === ownerA ? [orgA, orgA2] : [orgB]).toContain(
        data.p_organization_id,
      );
      body =
        connected && data.p_organization_id === orgA2
          ? [
              {
                email: "company-a2@example.com",
                status: "connected",
                connected_at: "2026-11-01T00:00:00Z",
                last_sync_at: null,
              },
            ]
          : [];
    } else if (url.pathname === "/functions/v1/company-gmail") {
      expect(actor === ownerA ? [orgA, orgA2] : [orgB]).toContain(
        data.organization_id,
      );
      if (data.action === "complete") {
        expect(actor).toBe(ownerA);
        expect(data.organization_id).toBe(orgA2);
        expect(data.ticket).toBe(ticket);
        connected = true;
        body = { connected: true };
      } else body = { oauth_ready: true, ai_enabled: false };
    }
    await route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  });
  return calls;
}
async function signIn(page: Page, email = "a@example.com", initial = true) {
  if (initial) {
    await page.goto("/#/settings");
    await page
      .locator("main")
      .getByRole("button", { name: "Acceso de empresas", exact: true })
      .click();
  }
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Configuración");
}
test("el regreso de Google finaliza en la empresa que inició la conexión y limpia el ticket", async ({
  page,
}) => {
  const calls = await fixture(page);
  await signIn(page);
  await page.getByLabel("Empresa activa").selectOption(orgA2);
  await expect(page.getByLabel("Empresa activa")).toHaveValue(orgA2);
  await page.reload();
  await expect(page.getByLabel("Empresa activa")).toHaveValue(orgA2);
  await page.goto(`/#/invoices?gmail_ticket=${ticket}`);
  await expect(page.locator("main h1")).toHaveText("Del correo a tus gastos");
  await expect(
    page.getByText("company-a2@example.com", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  await expect(page).toHaveURL(/#\/invoices$/);
  expect(calls.filter((c) => c.data?.action === "complete")).toHaveLength(1);
  expect(calls.some((c) => c.path.includes("gmail_runtime_config"))).toBe(
    false,
  );
  await expect(
    page.getByRole("region", { name: "Tu correo, conectado a tu empresa" }),
  ).toBeVisible();
});
test("una preferencia de otra empresa no concede acceso al cambiar de usuario", async ({
  page,
}) => {
  const calls = await fixture(page);
  await signIn(page);
  await page.getByLabel("Empresa activa").selectOption(orgA2);
  await page
    .locator("main")
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.evaluate(
    ({ ownerB, orgA2 }) =>
      localStorage.setItem(
        `truckcontrol-company-selection-v1:${ownerB}`,
        orgA2,
      ),
    { ownerB, orgA2 },
  );
  await signIn(page, "b@example.com", false);
  await expect(page.getByLabel("Empresa activa")).toHaveValue(orgB);
  await page.reload();
  await expect(page.getByLabel("Empresa activa")).toHaveValue(orgB);
  expect(
    await page.getByLabel("Empresa activa").locator("option").count(),
  ).toBe(1);
  await page.goto("/#/invoices");
  await expect(page.locator("main")).toContainText("Empresa ficticia B");
  await expect(page.locator("body")).not.toContainText("Empresa ficticia A2");
  expect(
    calls
      .filter(
        (c) => c.actor === ownerB && c.path === "/functions/v1/company-gmail",
      )
      .every((c) => c.data?.organization_id === orgB),
  ).toBe(true);
});
