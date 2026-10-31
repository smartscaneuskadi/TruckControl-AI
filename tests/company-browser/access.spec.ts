import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ownerA = "10000000-0000-4000-8000-000000000031",
  ownerB = "10000000-0000-4000-8000-000000000032";
const orgA = "20000000-0000-4000-8000-000000000031",
  orgA2 = "20000000-0000-4000-8000-000000000033",
  orgB = "20000000-0000-4000-8000-000000000032";
const created = "2026-10-01T00:00:00Z";
const jwt = (id: string) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.synthetic`;
const user = (id: string) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: id === ownerA ? "owner-a@example.com" : "owner-b@example.com",
  email_confirmed_at: created,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: created,
  updated_at: created,
});
async function mockSupabase(page: Page) {
  const organizations = [
    { id: orgA, owner_id: ownerA, name: "Empresa Demo A", created_at: created },
    {
      id: orgA2,
      owner_id: ownerA,
      name: "Empresa Demo A2",
      created_at: created,
    },
    { id: orgB, owner_id: ownerB, name: "Empresa Demo B", created_at: created },
  ];
  const trucks = organizations.map((o, i) => ({
    id: `30000000-0000-4000-8000-00000000003${i + 1}`,
    organization_id: o.id,
    plate: ["1111 TST", "3333 TST", "2222 TST"][i],
    brand: "Camión ficticio",
    model: "Prueba",
    year: 2026,
    odometer_km: 1000,
    status: "available",
    driver_id: null,
    inspection_due_on: "2028-01-01",
    route: "Ruta ficticia",
    created_at: created,
    row_version: 1,
  }));
  const requests: { path: string; method: string; data: unknown }[] = [];
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method();
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4184",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,prefer",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Content-Type": "application/json",
    };
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers, body: "" });
      return;
    }
    let actor: string | null = null;
    const token = request.headers().authorization?.replace(/^Bearer /, "");
    if (token?.startsWith("ey"))
      try {
        actor = JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString(),
        ).sub;
      } catch {
        /* Invalid synthetic token. */
      }
    const data = request.postDataJSON();
    requests.push({ path: url.pathname, method, data });
    let result: unknown = [];
    let status = 200;
    if (url.pathname === "/auth/v1/token") {
      actor = data.email === "owner-a@example.com" ? ownerA : ownerB;
      result = {
        access_token: jwt(actor),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: `synthetic-${actor}`,
        user: user(actor),
      };
    } else if (url.pathname === "/auth/v1/user") result = user(actor ?? ownerA);
    else if (url.pathname === "/auth/v1/logout") result = {};
    else if (url.pathname === "/auth/v1/signup")
      result = { user: user(ownerA), session: null };
    else if (url.pathname === "/rest/v1/organizations") {
      if (method === "POST") {
        expect(data.owner_id).toBe(actor);
        const next = {
          id: "20000000-0000-4000-8000-000000000039",
          owner_id: actor!,
          name: data.name,
          created_at: created,
        };
        organizations.push(next);
        result = { id: next.id };
        status = 201;
      } else
        result = organizations
          .filter((o) => o.owner_id === actor)
          .map((o) => ({ id: o.id, name: o.name }));
    } else if (url.pathname === "/rest/v1/trucks") {
      const scope = url.searchParams
        .get("organization_id")
        ?.replace(/^eq\./, "");
      expect(scope).toBeTruthy();
      expect(
        organizations.some((o) => o.id === scope && o.owner_id === actor),
      ).toBe(true);
      result = trucks.filter((t) => t.organization_id === scope);
    } else if (
      url.pathname === "/rest/v1/drivers" ||
      url.pathname === "/rest/v1/finance_entries"
    ) {
      const scope = url.searchParams
        .get("organization_id")
        ?.replace(/^eq\./, "");
      expect(
        organizations.some((o) => o.id === scope && o.owner_id === actor),
      ).toBe(true);
      result = [];
    } else if (url.pathname === "/functions/v1/company-gmail")
      result = { oauth_ready: false, ai_enabled: false };
    else {
      status = 400;
      result = { message: "Unexpected fixture request" };
    }
    await route.fulfill({ status, headers, body: JSON.stringify(result) });
  });
  return requests;
}
async function start(page: Page) {
  await page.goto("/#/settings");
  await expect(page.locator("main h1")).toBeVisible();
  await page
    .locator("main")
    .getByRole("button", { name: "Acceso de empresas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Entrar en mi empresa", exact: true }),
  ).toBeVisible();
}
async function signIn(page: Page, email = "owner-a@example.com") {
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Configuración");
}
test("cambia de empresa y de cuenta sin mezclar datos ni sobrescribir la demo", async ({
  page,
}) => {
  await mockSupabase(page);
  await start(page);
  const demo = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await signIn(page);
  await expect(page.getByLabel("Empresa activa")).toHaveValue(orgA);
  await page.getByLabel("Empresa activa").selectOption(orgA2);
  await expect(page.getByLabel("Empresa activa")).toHaveValue(orgA2);
  await page.goto("/#/trucks");
  await expect(page.locator("main")).toContainText("3333 TST");
  await expect(page.locator("main")).not.toContainText("1111 TST");
  await page.goto("/#/settings");
  await page
    .locator("main")
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Entrar en mi empresa", exact: true }),
  ).toBeVisible();
  await signIn(page, "owner-b@example.com");
  await expect(page.getByLabel("Empresa activa")).toHaveValue(orgB);
  expect(
    await page.getByLabel("Empresa activa").locator("option").count(),
  ).toBe(1);
  await page.goto("/#/trucks");
  await expect(page.locator("main")).toContainText("2222 TST");
  await expect(page.locator("body")).not.toContainText("Empresa Demo A");
  await page.reload();
  await expect(page.locator("main")).toContainText("2222 TST");
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(demo);
});
test("crea otra empresa vacía con el propietario autenticado", async ({
  page,
}) => {
  const requests = await mockSupabase(page);
  await start(page);
  await signIn(page);
  await page
    .getByRole("button", { name: "Crear otra empresa", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Crea tu empresa", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Nombre de la empresa", { exact: true })
    .fill("Empresa Demo Nueva");
  await page
    .getByRole("button", { name: "Crear empresa", exact: true })
    .click();
  await expect(page.getByLabel("Empresa activa")).toHaveValue(
    "20000000-0000-4000-8000-000000000039",
  );
  await expect(page.locator("main")).toContainText("0 camiones");
  expect(
    requests.some(
      (r) => r.method === "POST" && r.path === "/rest/v1/organizations",
    ),
  ).toBe(true);
});
test("presenta confirmación de correo y un formulario accesible sin enviar correos reales", async ({
  page,
}) => {
  const requests = await mockSupabase(page);
  await start(page);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("new-owner@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-123");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Revisa tu correo y confirma la cuenta",
  );
  expect(requests.filter((r) => r.path === "/auth/v1/signup")).toHaveLength(1);
});

test("un fallo de nube no sustituye datos de empresa por la demo ni ofrece borrarlos", async ({
  page,
}) => {
  await mockSupabase(page);
  await page.route("http://127.0.0.1:9999/rest/v1/trucks**", (route) =>
    route.fulfill({
      status: 503,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4184",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Synthetic unavailable service" }),
    }),
  );
  await start(page);
  const demo = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("owner-a@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No se ha podido cargar la empresa",
    { timeout: 15000 }, // The SDK retries transient 503 responses before failing.
  );
  await expect(
    page.getByRole("button", { name: "Restablecer demostración", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Volver a la demo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(demo);
});
