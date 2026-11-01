import { expect, test } from "@playwright/test";

test("la PWA instalada no sustituye el retorno de Google ni guarda sus códigos en la caché", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.goto("/gmail-callback?state=invalid&code=synthetic-private-code");
  await expect(
    page.getByRole("heading", { name: "Conectando tu correo" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido conectar Gmail",
  );
  expect(new URL(page.url()).search).toBe("");
  expect(new URL(page.url()).pathname).toBe("/gmail-callback");
  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(request.url);
    return urls;
  });
  expect(cachedUrls.length).toBeGreaterThan(0);
  expect(
    cachedUrls.some(
      (url) =>
        url.includes("synthetic-private-code") ||
        new URL(url).searchParams.has("code"),
    ),
  ).toBe(false);
});

test("la PWA conserva el retorno cuando el alojamiento redirige html a su ruta canónica", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.route("**/gmail-callback.html?**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: 308,
      headers: { Location: `/gmail-callback${url.search}` },
    });
  });
  await page.goto(
    "/gmail-callback.html?state=invalid&code=synthetic-canonical-test",
  );
  await expect(
    page.getByRole("heading", { name: "Conectando tu correo" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido conectar Gmail",
  );
  expect(new URL(page.url()).pathname).toBe("/gmail-callback");
  expect(new URL(page.url()).search).toBe("");
});
