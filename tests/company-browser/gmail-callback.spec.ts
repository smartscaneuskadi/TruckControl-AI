import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const endpoint =
  "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-gmail/oauth-callback";
const state = "s".repeat(43);
const ticket = "t".repeat(43);

test("el retorno elimina el código del historial, no usa credenciales y vuelve solo con un ticket", async ({
  page,
}) => {
  const calls: {
    data: unknown;
    headers: Record<string, string>;
    pageUrl: string;
  }[] = [];
  await page.route(endpoint, async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4184",
      "Access-Control-Allow-Headers": "content-type",
      "Content-Type": "application/json",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    calls.push({
      data: request.postDataJSON(),
      headers: request.headers(),
      pageUrl: page.url(),
    });
    await route.fulfill({
      headers,
      body: JSON.stringify({
        url: `https://truckcontrolai.com/#/invoices?gmail_ticket=${ticket}`,
      }),
    });
  });
  await page.route("https://truckcontrolai.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html lang='es'><title>Empresa sintética</title><p>Retorno autorizado</p></html>",
    }),
  );
  await page.goto(`/gmail-callback.html?state=${state}&code=synthetic-code`);
  await expect(page).toHaveURL(
    `https://truckcontrolai.com/#/invoices?gmail_ticket=${ticket}`,
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].data).toEqual({ state, code: "synthetic-code" });
  expect(calls[0].headers.authorization).toBeUndefined();
  expect(calls[0].headers.cookie).toBeUndefined();
  expect(calls[0].headers.referer).toBeUndefined();
  expect(calls[0].pageUrl).toBe("http://127.0.0.1:4184/gmail-callback.html");
  await page.goBack();
  expect(page.url()).not.toContain("synthetic-code");
});

test("un retorno inválido no consulta el servidor y conserva contraste y anchura en ambos temas", async ({
  page,
}) => {
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests++;
    return route.abort();
  });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/gmail-callback.html?state=invalid&code=synthetic-code");
    await expect(page.getByRole("status")).toContainText(
      "No se ha podido conectar Gmail",
    );
    expect(new URL(page.url()).search).toBe("");
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
      })),
    ).toEqual({ local: 0, session: 0 });
  }
  expect(requests).toBe(0);
});

test("no sigue destinos externos, credenciales en URL ni tickets manipulados", async ({
  page,
}) => {
  for (const url of [
    "https://evil.example/#/invoices?gmail_error=declined",
    "https://truckcontrolai.com.evil.example/#/invoices?gmail_error=declined",
    "https://user@truckcontrolai.com/#/invoices?gmail_error=declined",
    "https://truckcontrolai.com/#/invoices?gmail_ticket=manipulated",
  ]) {
    await page.route(endpoint, (route) =>
      route.fulfill({
        headers: {
          "Access-Control-Allow-Origin": "http://127.0.0.1:4184",
          "Access-Control-Allow-Headers": "content-type",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      }),
    );
    await page.goto(`/gmail-callback.html?state=${state}&code=synthetic-code`);
    await expect(page.getByRole("status")).toContainText(
      "No se ha podido conectar Gmail",
    );
    expect(page.url()).toBe("http://127.0.0.1:4184/gmail-callback.html");
    await page.unroute(endpoint);
  }
});

test("un fallo del proveedor deja una salida clara sin guardar credenciales", async ({
  page,
}) => {
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4184" },
      body: "provider-private-response",
    }),
  );
  await page.goto(`/gmail-callback.html?state=${state}&error=access_denied`);
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido conectar Gmail",
  );
  await expect(
    page.getByRole("link", { name: "Volver a TruckControl" }),
  ).toHaveAttribute("href", "https://truckcontrolai.com/#/invoices");
  await expect(page.locator("body")).not.toContainText(
    "provider-private-response",
  );
  expect(new URL(page.url()).search).toBe("");
});
