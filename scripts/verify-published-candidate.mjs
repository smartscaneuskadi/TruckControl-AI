/** Read-only QA of the published, fictitious-data candidate. No account or provider access. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";
const config = JSON.parse(
  readFileSync("docs/deployment/candidate-hosting.json", "utf8"),
);
if (
  config.audience !== "public" ||
  !config.current_live_url ||
  !config.published_commit
) {
  console.log(
    "Published candidate browser QA: pending publication; not counted as passed.",
  );
  process.exit(0);
}
const production = config.expected_channel === "production";
const registrationOpen =
  production && config.expected_registration_open === true;
const expected = new URL(config.expected_url);
const canonicalTarget = new URL(config.current_live_url);
if (
  canonicalTarget.origin !== expected.origin ||
  canonicalTarget.protocol !== "https:" ||
  canonicalTarget.username ||
  canonicalTarget.password ||
  !/^[0-9a-f]{40}$/.test(config.published_commit)
)
  throw new Error("Unrecognized candidate destination or source");
const targets = [canonicalTarget];
const offer = config.expected_offer || {
  trial_days: 30,
  plans: [{ name: "Inicial", monthly_cents: 1000 }],
};
for (const origin of config.verified_custom_origins || []) {
  const target = new URL(origin);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port ||
    target.pathname !== "/" ||
    target.search ||
    target.hash ||
    !["truckcontrolai.com", "www.truckcontrolai.com"].includes(target.hostname)
  )
    throw new Error("Unrecognized verified custom origin");
  if (!targets.some((item) => item.origin === target.origin))
    targets.push(target);
}
const artifactRoot =
  process.env.TRUCKCONTROL_PUBLIC_TEST_ARTIFACTS || "public-test-results";
mkdirSync(artifactRoot, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const target of targets) {
    const dir = `${artifactRoot}/${target.hostname}`;
    mkdirSync(dir, { recursive: true });
    for (const [name, settings] of [
      [
        "windows",
        {
          ...devices["Desktop Chrome"],
          viewport: { width: 1440, height: 1000 },
        },
      ],
      ["android", devices["Pixel 7"]],
    ]) {
      const context = await browser.newContext({
        ...settings,
        locale: "es-ES",
        serviceWorkers: "allow",
      });
      try {
        const page = await context.newPage();
        await page.goto(target.origin, { waitUntil: "networkidle" });
        if (!production)
          await page
            .getByRole("region", { name: "Estado de la versión candidata" })
            .waitFor();
        else
          await page
            .getByRole("heading", { level: 1 })
            .filter({ hasText: "Cada kilómetro" })
            .waitFor();
        const metadata = await page.evaluate(async () =>
          (await fetch("release.json", { cache: "no-store" })).json(),
        );
        if (
          metadata.sourceCommit !== config.published_commit ||
          metadata.sourceDirty !== false ||
          metadata.channel !== (production ? "production" : "candidate") ||
          metadata.companyConnectionBundled !== production ||
          metadata.registrationForcedClosed !== !production
        )
          throw new Error("Published provenance or isolation mismatch");
        if (
          (await page
            .getByRole("button", {
              name: `Probar Full gratis ${offer.trial_days} días`,
              exact: true,
            })
            .isDisabled()) === registrationOpen
        )
          throw new Error("Registration unexpectedly available");
        await page.screenshot({ path: `${dir}/${name}-published-portal.png` });
        await page
          .getByRole("heading", {
            name: "Empieza con todo. Elige tu plan después.",
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        if ((await page.locator(".plan-card").count()) !== offer.plans.length)
          throw new Error("Published plans do not match the saved offer");
        for (const plan of offer.plans) {
          const card = page.locator(".plan-card").filter({
            has: page.getByRole("heading", { name: plan.name, exact: true }),
          });
          if (
            (await card
              .getByRole("button", { name: `Elegir ${plan.name}`, exact: true })
              .isDisabled()) === registrationOpen
          )
            throw new Error("Plan registration unexpectedly available");
          const base = new Intl.NumberFormat("es-ES", {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: 0,
          }).format(plan.monthly_cents / 100);
          if (!(await card.locator(".plan-price").innerText()).includes(base))
            throw new Error("Published base price mismatch");
          if (offer.vat_rate_bps === 2100) {
            const totalCents =
              plan.monthly_cents +
              Math.floor((plan.monthly_cents * 2100 + 5000) / 10000);
            const total = new Intl.NumberFormat("es-ES", {
              style: "currency",
              currency: "EUR",
              minimumFractionDigits: 2,
            }).format(totalCents / 100);
            if (
              !(await card.locator(".plan-tax").innerText()).includes(
                "21 % IVA",
              ) ||
              !(await card.locator(".plan-total").innerText()).includes(total)
            )
              throw new Error("Published VAT or total mismatch");
          }
        }
        await page.screenshot({ path: `${dir}/${name}-published-plans.png` });
        await page
          .getByRole("button", { name: "Explorar la demo", exact: true })
          .click();
        await page
          .getByText(production ? "Modo demo" : "Candidata · datos ficticios", {
            exact: true,
          })
          .waitFor();
        if (await page.evaluate(() => document.body.scrollWidth > innerWidth))
          throw new Error("Layout exceeds viewport");
        await page.screenshot({ path: `${dir}/${name}-published.png` });
        const checkedThemes = [];
        for (const theme of config.expected_themes || []) {
          if (!["light", "cockpit"].includes(theme))
            throw new Error("Unrecognized published theme");
          await page
            .getByRole("button", { name: "Cambiar apariencia", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "Apariencia de TruckControl",
          });
          await dialog
            .getByRole("radio", {
              name: theme === "light" ? "Fleet Light" : "Fleet Cockpit",
              exact: true,
            })
            .check();
          await dialog
            .getByRole("button", { name: "Aplicar apariencia" })
            .click();
          await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
          if ((await page.locator("html").getAttribute("data-theme")) !== theme)
            throw new Error("Published theme did not apply");
          if (
            await page.evaluate(
              () => document.body.scrollWidth > innerWidth + 1,
            )
          )
            throw new Error("Published theme exceeds viewport");
          await page.screenshot({
            path: `${dir}/${name}-${theme}-published.png`,
          });
          checkedThemes.push(theme);
        }
        let universalMailChecked = false;
        if (config.expected_universal_mail === true) {
          await page.goto(`${target.origin}/#/invoices`, {
            waitUntil: "networkidle",
          });
          await page
            .getByRole("heading", {
              name: "Del correo a tus gastos",
              exact: true,
            })
            .waitFor();
          await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
          });
          await page.reload({ waitUntil: "networkidle" });
          await page.waitForFunction(() =>
            Boolean(navigator.serviceWorker.controller),
          );
          const before = await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("truckcontrol.demo.v1")).entries
                .length,
          );
          let providerRequests = 0;
          const providerRequest = (request) => {
            if (new URL(request.url()).hostname.endsWith(".supabase.co"))
              providerRequests++;
          };
          page.on("request", providerRequest);
          await context.setOffline(true);
          try {
            await page
              .getByRole("button", { name: "Explorar la demo", exact: true })
              .click();
            await page.goto(`${target.origin}/#/invoices`);
            await page
              .getByRole("heading", {
                name: "Del correo a tus gastos",
                exact: true,
              })
              .waitFor();
            await page
              .getByRole("button", {
                name: "Probar correo ficticio",
                exact: true,
              })
              .click();
            await page
              .getByRole("heading", {
                name: "Adjuntos listos para revisar",
                exact: true,
              })
              .waitFor();
            await page
              .getByRole("button", {
                name: "Importar adjuntos de prueba",
                exact: true,
              })
              .click();
            const imported = page.locator(".document-card").filter({
              has: page.getByText("Archivo de correo", { exact: true }),
            });
            await imported
              .getByRole("button", { name: "Revisar factura", exact: true })
              .waitFor();
            const after = await page.evaluate(
              () =>
                JSON.parse(localStorage.getItem("truckcontrol.demo.v1")).entries
                  .length,
            );
            if (
              after !== before ||
              providerRequests !== 0 ||
              (await page.evaluate(
                () => document.body.scrollWidth > innerWidth,
              ))
            )
              throw new Error(
                "Published universal email intake changed finances, contacted a provider or overflowed the viewport",
              );
            await page.screenshot({
              path: `${dir}/${name}-universal-mail-offline.png`,
            });
            universalMailChecked = true;
          } finally {
            await context.setOffline(false);
            page.off("request", providerRequest);
          }
        }
        let gmailCallbackChecked = false;
        if (config.expected_gmail_callback === true) {
          await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
          });
          await page.reload({ waitUntil: "networkidle" });
          await page.waitForFunction(() =>
            Boolean(navigator.serviceWorker.controller),
          );
          let providerRequests = 0;
          const providerRequest = (request) => {
            if (new URL(request.url()).hostname.endsWith(".supabase.co"))
              providerRequests++;
          };
          page.on("request", providerRequest);
          await page.goto(
            `${target.origin}/gmail-callback?state=invalid&code=synthetic-public-test`,
            { waitUntil: "networkidle" },
          );
          await page
            .getByRole("heading", { name: "Conectando tu correo" })
            .waitFor();
          if (
            !(await page.getByRole("status").innerText()).includes(
              "No se ha podido conectar Gmail",
            ) ||
            new URL(page.url()).search ||
            providerRequests !== 0
          )
            throw new Error(
              "Published Gmail callback did not reject invalid state without provider access",
            );
          page.off("request", providerRequest);
          const cachedUrls = await page.evaluate(async () => {
            const urls = [];
            for (const name of await caches.keys())
              for (const request of await (await caches.open(name)).keys())
                urls.push(request.url);
            return urls;
          });
          if (cachedUrls.some((url) => new URL(url).searchParams.has("code")))
            throw new Error("OAuth code unexpectedly persisted in PWA cache");
          await page.screenshot({ path: `${dir}/${name}-gmail-callback.png` });
          gmailCallbackChecked = true;
        }
        results.push({
          origin: target.origin,
          profile: name,
          sourceCommit: metadata.sourceCommit,
          themes: checkedThemes,
          gmailCallback: gmailCallbackChecked,
          universalMailOffline: universalMailChecked,
          passed: true,
        });
        console.log(
          `Published ${production ? "production" : "candidate"} ${target.hostname} ${name}: HTTPS, source, expected registration policy and demo passed`,
        );
      } finally {
        await context.close();
      }
    }
  }
  writeFileSync(
    `${artifactRoot}/verification.json`,
    JSON.stringify(
      {
        url: canonicalTarget.origin,
        origins: targets.map((target) => target.origin),
        results,
        physicalDevices: false,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
