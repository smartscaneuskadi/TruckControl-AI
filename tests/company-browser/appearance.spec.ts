import { devices, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const accountA = "10000000-0000-4000-8000-000000000081";
const accountB = "10000000-0000-4000-8000-000000000082";
const stamp = "2026-10-01T00:00:00Z";
const jwt = (id: string) =>
  `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.synthetic`;

test("guarda en el perfil, recupera en otro dispositivo y aísla las preferencias al cambiar de cuenta", async ({
  page,
  browser,
}, info) => {
  const metadata = new Map([
    [
      accountA,
      {
        truckcontrol_registration: { company_name: "Empresa ficticia A" },
        truckcontrol_appearance: { theme: "cockpit", motion: "system" },
      },
    ],
    [
      accountB,
      {
        truckcontrol_registration: { company_name: "Empresa ficticia B" },
        truckcontrol_appearance: { theme: "cockpit", motion: "system" },
      },
    ],
  ]);
  const writes: { actor: string; data: unknown }[] = [];
  const user = (id: string) => ({
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === accountA ? "a@example.com" : "b@example.com",
    email_confirmed_at: stamp,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: metadata.get(id),
    identities: [],
    created_at: stamp,
    updated_at: stamp,
  });
  async function mock(p: Page) {
    await p.route("http://127.0.0.1:9999/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4184",
        "Access-Control-Allow-Headers":
          "authorization,apikey,content-type,x-client-info,prefer",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Content-Type": "application/json",
      };
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const token = request.headers().authorization?.replace(/^Bearer /, "");
      const actor = token?.startsWith("ey")
        ? JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
            .sub
        : null;
      const data = request.postDataJSON();
      let body: unknown = [];
      if (url.pathname === "/auth/v1/token") {
        const id = data.email === "a@example.com" ? accountA : accountB;
        body = {
          access_token: jwt(id),
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: `synthetic-${id}`,
          user: user(id),
        };
      } else if (url.pathname === "/auth/v1/user") {
        expect([accountA, accountB]).toContain(actor);
        if (method === "PUT") {
          expect(
            Object.keys(data).every((key) =>
              ["data", "code_challenge", "code_challenge_method"].includes(key),
            ),
          ).toBe(true);
          expect(Object.keys(data.data)).toEqual(["truckcontrol_appearance"]);
          expect(Object.keys(data.data.truckcontrol_appearance).sort()).toEqual(
            ["motion", "theme"],
          );
          metadata.set(actor, { ...metadata.get(actor)!, ...data.data });
          writes.push({ actor, data });
        }
        body = user(actor);
      } else if (url.pathname === "/auth/v1/logout") body = {};
      else if (url.pathname === "/rest/v1/organizations")
        body = [
          {
            id:
              actor === accountA
                ? "20000000-0000-4000-8000-000000000081"
                : "20000000-0000-4000-8000-000000000082",
            name:
              actor === accountA ? "Empresa ficticia A" : "Empresa ficticia B",
          },
        ];
      else if (url.pathname === "/functions/v1/company-gmail")
        body = { oauth_ready: false, ai_enabled: false };
      await route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
    });
  }
  async function signIn(p: Page, email: string, initial = true) {
    if (initial) {
      await p.goto("http://127.0.0.1:4184/#/settings");
      await p
        .locator("main")
        .getByRole("button", { name: "Acceso de empresas", exact: true })
        .click();
    }
    await p.getByLabel("Correo electrónico", { exact: true }).fill(email);
    await p
      .getByLabel("Contraseña", { exact: true })
      .fill("synthetic-password-123");
    await p.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(p.locator("main h1")).toHaveText("Configuración");
  }
  async function apply(p: Page, theme: string) {
    const settings = p.getByRole("region", { name: "Apariencia", exact: true });
    await settings.getByRole("radio", { name: theme, exact: true }).check();
    await settings.getByRole("button", { name: "Aplicar apariencia" }).click();
  }
  await mock(page);
  await signIn(page, "a@example.com");
  await apply(page, "Fleet Light");
  await expect(
    page.getByRole("status").filter({ hasText: "Guardado en tu perfil" }),
  ).toBeVisible();
  expect(metadata.get(accountA)!.truckcontrol_appearance.theme).toBe("light");
  expect(metadata.get(accountA)!.truckcontrol_registration.company_name).toBe(
    "Empresa ficticia A",
  );
  const other = await browser.newContext({
    ...(info.project.name.includes("windows")
      ? devices["Pixel 7"]
      : devices["Desktop Chrome"]),
    locale: "es-ES",
    serviceWorkers: "block",
  });
  try {
    const second = await other.newPage();
    await mock(second);
    await signIn(second, "a@example.com");
    await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
    await page.context().setOffline(true);
    await apply(page, "Fleet Cockpit");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "cockpit");
    expect(metadata.get(accountA)!.truckcontrol_appearance.theme).toBe("light");
    await page.context().setOffline(false);
    await expect
      .poll(() => metadata.get(accountA)!.truckcontrol_appearance.theme)
      .toBe("cockpit");
    await second.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(second.locator("html")).toHaveAttribute(
      "data-theme",
      "cockpit",
    );
    await page
      .locator("main")
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await signIn(page, "b@example.com", false);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "cockpit");
    await apply(page, "Fleet Light");
    await expect
      .poll(() => metadata.get(accountB)!.truckcontrol_appearance.theme)
      .toBe("light");
    expect(metadata.get(accountA)!.truckcontrol_appearance.theme).toBe(
      "cockpit",
    );
    expect(writes.map((w) => w.actor)).toEqual([accountA, accountA, accountB]);
    await expect(second.locator("html")).toHaveAttribute(
      "data-theme",
      "cockpit",
    );
  } finally {
    await other.close();
  }
});
