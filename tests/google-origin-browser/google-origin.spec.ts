import type { BrowserContext } from "@playwright/test";
import en from "../../src/i18n/locales/en.json" with { type: "json" };
import ro from "../../src/i18n/locales/ro.json" with { type: "json" };
import fr from "../../src/i18n/locales/fr.json" with { type: "json" };
import {
  test,
  expect,
  connectGmail,
  firstMail,
  noMailStorage,
} from "./fixture";

const entry = "https://truckcontrolai.com/#/mailbox";
async function isolatedOrigin(
  context: BrowserContext,
  origin: string,
  baseURL: string,
) {
  // Serve the tested local bundle at an exact origin. No request reaches Sites,
  // Google, a customer mailbox or another managed service in these UI tests.
  await context.route(origin + "/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: new URL(url.pathname + url.search, baseURL).href,
    });
    await route.fulfill({ response });
  });
}

for (const origin of [
  "https://www.truckcontrolai.com",
  "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
  "https://truckcontrolai.com",
]) {
  test(`Google mail uses the registered entry from ${origin}`, async ({
    page,
    context,
    baseURL,
    mail,
  }) => {
    await isolatedOrigin(context, origin, baseURL!);
    await context.addInitScript((originalOrigin) => {
      if (location.origin === originalOrigin)
        sessionStorage.setItem("truckcontrol-company-mode", "yes");
    }, origin);
    await page.goto(origin + "/#/settings");
    await page
      .getByLabel("Correo electrónico", { exact: true })
      .fill("owner@example.com");
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("synthetic-password-only");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Configuración", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      location.hash = "/mailbox";
    });
    await expect(page.locator("#mail-title")).toBeVisible();
    if (origin === "https://truckcontrolai.com") {
      await connectGmail(page, mail);
      expect(mail.calls.some((call) => call.name.startsWith("gmail:"))).toBe(
        true,
      );
      await noMailStorage(page);
      return;
    }
    await page
      .getByLabel("Correo electrónico", { exact: true })
      .fill(firstMail);
    const link = page.getByRole("link", {
      name: "Abrir Correo en truckcontrolai.com",
      exact: true,
    });
    await expect(link).toHaveAttribute("href", entry);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(
      page.getByRole("button", {
        name: /Entrar con Google|Preparar conexión con Google/,
      }),
    ).toHaveCount(0);
    await page
      .locator("#mail-email")
      .evaluate((input) => (input as HTMLInputElement).form!.requestSubmit());
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __unifiedMailRequests?: number })
            .__unifiedMailRequests ?? 0,
      ),
    ).toBe(0);
    expect(mail.calls.filter((call) => call.name.startsWith("gmail:"))).toEqual(
      [],
    );
    expect(mail.imports()).toEqual([]);
    for (const [language, dictionary] of [
      ["en", en],
      ["ro", ro],
      ["fr", fr],
    ] as const) {
      await page.locator(".language-switcher select").selectOption(language);
      await expect(
        page.getByRole("link", {
          name: dictionary["Abrir Correo en truckcontrolai.com"],
          exact: true,
        }),
      ).toHaveAttribute("href", entry);
      await expect(
        page
          .getByText(
            dictionary[
              "Abre el correo en truckcontrolai.com para conectar tu cuenta de Google. Tu trabajo en esta ventana se mantiene abierto."
            ],
            { exact: true },
          )
          .first(),
      ).toBeVisible();
    }
    await page.locator(".language-switcher select").selectOption("es");
    await isolatedOrigin(context, "https://truckcontrolai.com", baseURL!);
    const popupReady = context.waitForEvent("page");
    await link.click();
    const popup = await popupReady;
    await expect(popup).toHaveURL(entry);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await expect(
      popup.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
    // A new origin does not inherit TruckControl or Google credentials. The
    // normal portal remains available and the owner explicitly signs in there.
    await expect(
      popup.getByLabel("Correo electrónico", { exact: true }),
    ).toHaveCount(0);
    await popup.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      popup.getByLabel("Correo electrónico", { exact: true }),
    ).toBeVisible();
    expect(page.url()).toBe(origin + "/#/mailbox");
    await expect(
      page.getByLabel("Correo electrónico", { exact: true }),
    ).toHaveValue(firstMail);
    await noMailStorage(page);
    await popup.close();
    await page.evaluate(() => {
      location.hash = "/mailbox/gmail?legacy=personal";
    });
    await expect(
      page.getByRole("link", {
        name: "Abrir Correo en truckcontrolai.com",
        exact: true,
      }),
    ).toHaveAttribute("href", entry);
    await expect(
      page.getByRole("button", {
        name: /Entrar con Google|Preparar conexión con Google/,
      }),
    ).toHaveCount(0);
  });
}
