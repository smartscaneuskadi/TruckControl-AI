/** Published UI and non-mutating auth validation. Never creates accounts or sends mail. */
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
        let publishableKey;
        page.on("request", (request) => {
          if (
            request.url() ===
            "https://kkkemaycedexymrpaqtp.supabase.co/rest/v1/rpc/tc_public_catalog"
          ) {
            const key = request.headers().apikey;
            if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || ""))
              publishableKey = key;
          }
        });
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
        let authMailCorsChecked = false;
        let mailServicesCorsChecked = false;
        let personalMailConfigChecked = false;
        let personalMailReady = false;
        let publicLegalPagesChecked = false;
        let billingIssuerChecked = false;
        if (production) {
          if (config.expected_billing_issuer) {
            const issuer = config.expected_billing_issuer;
            const details = page.getByRole("region", {
              name: "Datos de facturación del servicio",
            });
            await details.waitFor();
            const text = await details.innerText();
            if (
              ![issuer.name, issuer.tax_id, issuer.address, issuer.email].every(
                (value) => typeof value === "string" && text.includes(value),
              )
            )
              throw Error(
                "Public subscription issuer is incomplete or differs from the approved seller",
              );
            const contact = await details
              .getByRole("link", { name: issuer.email, exact: true })
              .getAttribute("href");
            if (contact !== `mailto:${issuer.email}`)
              throw Error(
                "Public billing contact differs from the approved seller",
              );
            billingIssuerChecked = true;
          }
          // Google review requires public legal pages before account creation.
          for (const [document, title] of [
            ["privacy", "Privacidad y tratamiento de datos"],
            ["terms", "Condiciones del servicio y encargo de tratamiento"],
          ]) {
            const label = document === "privacy" ? "Privacidad" : "Condiciones";
            const href = await page
              .getByRole("link", { name: label, exact: true })
              .first()
              .getAttribute("href");
            const link = href ? new URL(href, target.origin) : null;
            if (
              !link ||
              link.origin !== target.origin ||
              link.pathname !== "/" ||
              link.searchParams.get("legal") !== document
            )
              throw Error("Public legal link missing or leaves the app domain");
            const response = await page.goto(
              `${target.origin}/?legal=${document}`,
              {
                waitUntil: "networkidle",
              },
            );
            await page
              .getByRole("heading", { name: title, exact: true })
              .waitFor();
            const text = await page.locator("main").innerText();
            if (
              response?.status() !== 200 ||
              !text.includes("ELEVADANCOR S.L.") ||
              (config.expected_billing_issuer &&
                ![
                  config.expected_billing_issuer.tax_id,
                  config.expected_billing_issuer.address,
                ].every((value) => text.includes(value))) ||
              (document === "privacy" &&
                !["Google", "Limited Use", "OpenAI", "supresión"].every(
                  (word) => text.includes(word),
                )) ||
              (await page.evaluate(
                () => document.body.scrollWidth > innerWidth + 1,
              ))
            )
              throw Error(
                "Public legal page is unavailable or lacks Google disclosures",
              );
            await page.screenshot({
              path: `${dir}/${name}-public-${document}.png`,
              fullPage: true,
            });
          }
          await page.goto(target.origin, { waitUntil: "networkidle" });
          publicLegalPagesChecked = true;
        }
        if (production) {
          if (!publishableKey)
            throw new Error("Published app did not load its public catalog");
          // An empty email fails before reservation, Auth, consent or Resend.
          // Using the real browser catches preflight failures that route fixtures hide.
          const validation = await page.evaluate(async (key) => {
            const response = await fetch(
              "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-auth",
              {
                method: "POST",
                headers: {
                  apikey: key,
                  authorization: `Bearer ${key}`,
                  "content-type": "application/json",
                  "x-client-info": "truckcontrol-public-auth-validation",
                },
                body: JSON.stringify({ action: "signup", email: "" }),
              },
            );
            const body = await response.json();
            return { status: response.status, code: body.error };
          }, publishableKey);
          if (validation.status !== 400 || validation.code !== "invalid_email")
            throw new Error(
              "Published signup cannot reach server-side validation",
            );
          authMailCorsChecked = true;
          if (config.expected_mail_service_cors === true) {
            // No user token: fail before reading a tenant, provider or budget.
            // The real browser verifies each service's OPTIONS response too.
            const checks = await page.evaluate(async (key) => {
              const result = [];
              for (const [service, action] of [
                ["company-mail", "status"],
                ["company-assistant", "status"],
                ["company-mail", "invoice_ai_status"],
                ["company-mail", "analyze_invoice"],
              ]) {
                const response = await fetch(
                  `https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/${service}`,
                  {
                    method: "POST",
                    headers: {
                      apikey: key,
                      "content-type": "application/json",
                      "x-client-info": "truckcontrol-public-mail-validation",
                    },
                    body: JSON.stringify({ action }),
                  },
                );
                result.push({
                  service,
                  action,
                  status: response.status,
                  code: (await response.json()).error,
                });
              }
              return result;
            }, publishableKey);
            if (
              checks.some(
                (c) => c.status !== 401 || c.code !== "authentication_required",
              )
            )
              throw Error(
                "Published mail or assistant origin cannot reach protected validation",
              );
            mailServicesCorsChecked = true;
          }
        }
        if (
          (await page
            .getByRole("button", {
              name:
                offer.trial_plan === "limited"
                  ? "Pedir acceso Básico"
                  : `Probar Full gratis ${offer.trial_days} días`,
              exact: true,
            })
            .isDisabled()) === registrationOpen
        )
          throw new Error("Registration unexpectedly available");
        await page.screenshot({ path: `${dir}/${name}-published-portal.png` });
        await page
          .getByRole("heading", {
            name:
              offer.trial_plan === "limited"
                ? "Empieza con Básico. Amplía cuando lo necesites."
                : "Empieza con todo. Elige tu plan después.",
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
        if (production && config.expected_personal_mail === true) {
          const readiness = await page.evaluate(async () => {
            const response = await fetch(
              "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-gmail/browser-config",
              {
                credentials: "omit",
                cache: "no-store",
                referrerPolicy: "no-referrer",
              },
            );
            const data = await response.json();
            const validKeys =
              Object.keys(data).sort().join(",") ===
              "client_id,configured,mode,provider";
            const validId =
              data.client_id === null ||
              /^468881730124-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
                data.client_id,
              );
            return {
              status: response.status,
              valid:
                validKeys &&
                validId &&
                data.provider === "google" &&
                data.mode === "personal_browser" &&
                data.configured === Boolean(data.client_id),
              ready: data.configured === true,
            };
          });
          if (readiness.status !== 200 || !readiness.valid)
            throw Error(
              "Public personal-mail configuration failed CORS or disclosed unexpected fields",
            );
          personalMailConfigChecked = true;
          personalMailReady = readiness.ready;
        }
        let invoiceInboxChecked = false;
        let tyresOfflineChecked = false;
        let personalMailOfflineChecked = false;
        let companyFiscalChecked = false;
        let companyCopilotChecked = false;
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
            const hostname = new URL(request.url()).hostname;
            if (
              hostname.endsWith(".supabase.co") ||
              [
                "gmail.googleapis.com",
                "accounts.google.com",
                "api.openai.com",
                "api.resend.com",
              ].includes(hostname)
            )
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
            if (config.expected_invoice_inbox === true) {
              const register = page.getByRole("region", {
                name: "Bandeja de facturas",
                exact: true,
              });
              await register
                .getByLabel("Buscar factura", { exact: true })
                .fill("Proveedor pendiente");
              await register
                .getByLabel("Filtrar origen de factura")
                .selectOption("email_upload");
              await imported
                .getByRole("button", { name: "Revisar factura", exact: true })
                .waitFor();
              const pending = page.waitForEvent("download");
              await register
                .getByRole("button", { name: "Exportar facturas", exact: true })
                .click();
              if (
                (await pending).suggestedFilename() !==
                "truckcontrol-facturas.csv"
              )
                throw Error("Published invoice export unavailable");
              await register
                .getByRole("button", {
                  name: "Restablecer filtros de facturas",
                })
                .click();
              invoiceInboxChecked = true;
            }
            if (config.expected_tyres === true) {
              await page.evaluate(() => {
                location.hash = "/tyres";
              });
              await page
                .getByRole("button", { name: "Añadir neumático", exact: true })
                .click();
              const modal = page.getByRole("dialog", {
                name: "Añadir neumático",
                exact: true,
              });
              await modal
                .getByLabel("Código o número de serie")
                .fill("DEMO-PUBLIC-TYRE");
              await modal
                .getByRole("button", { name: "Guardar neumático", exact: true })
                .click();
              await page
                .getByRole("heading", { name: "DEMO-PUBLIC-TYRE", exact: true })
                .waitFor();
              const pending = page.waitForEvent("download");
              await page
                .getByRole("button", {
                  name: "Exportar neumáticos",
                  exact: true,
                })
                .click();
              if (
                (await pending).suggestedFilename() !==
                "truckcontrol-neumaticos.csv"
              )
                throw Error("Published tyre export unavailable");
              const archive = await page.evaluate(
                () =>
                  JSON.parse(localStorage.getItem("truckcontrol.demo.v1"))
                    .demoTyresV1,
              );
              if (
                archive.rows.length !== 1 ||
                archive.history.length !== 1 ||
                archive.rows[0].data.pressureKpa !== null ||
                archive.rows[0].data.treadTenthsMm !== null
              )
                throw Error(
                  "Published tyre history or unknown measurements incorrect",
                );
              await page.screenshot({
                path: `${dir}/${name}-tyres-offline.png`,
              });
              tyresOfflineChecked = true;
              await page.evaluate(() => {
                location.hash = "/invoices";
              });
              await page
                .getByRole("region", {
                  name: "Bandeja de facturas",
                  exact: true,
                })
                .waitFor();
            }
            if (config.expected_personal_mail === true) {
              const original = await page.evaluate(() =>
                localStorage.getItem("truckcontrol.demo.v1"),
              );
              await page.evaluate(() => {
                location.hash = "/mailbox";
              });
              await page
                .getByRole("heading", { name: "Mi correo", exact: true })
                .waitFor();
              await page
                .getByRole("button", {
                  name: "Abrir buzón ficticio",
                  exact: true,
                })
                .click();
              await page
                .getByRole("button", { name: "Redactar", exact: true })
                .click();
              const editor = page.getByRole("dialog", {
                name: "Redactar correo",
                exact: true,
              });
              await editor
                .getByLabel("Para", { exact: true })
                .fill("public-test@example.invalid");
              await editor
                .getByLabel("Asunto", { exact: true })
                .fill("Correo de demostración pública");
              await editor
                .getByLabel("Mensaje", { exact: true })
                .fill("Mensaje ficticio local sin envío real.");
              await editor
                .getByRole("button", { name: "Revisar envío", exact: true })
                .click();
              await page
                .getByRole("button", { name: "Simular envío", exact: true })
                .click();
              await page
                .getByLabel("Carpeta", { exact: true })
                .selectOption("sent");
              await page
                .locator(".personal-mail-list")
                .getByText("Correo de demostración pública", { exact: true })
                .waitFor();
              if (
                (await page.evaluate(() =>
                  localStorage.getItem("truckcontrol.demo.v1"),
                )) !== original
              )
                throw Error("Personal mail demo modified company data");
              if (
                await page.evaluate(() =>
                  JSON.stringify({
                    ...localStorage,
                    ...sessionStorage,
                  }).includes("Mensaje ficticio local sin envío real."),
                )
              )
                throw Error("Personal mail body was persisted");
              await page.screenshot({
                path: `${dir}/${name}-personal-mail-offline.png`,
              });
              personalMailOfflineChecked = true;
              await page.evaluate(() => {
                location.hash = "/invoices";
              });
              await page
                .getByRole("region", {
                  name: "Bandeja de facturas",
                  exact: true,
                })
                .waitFor();
            }
            if (config.expected_company_fiscal_preparation === true) {
              await page.evaluate(() => {
                location.hash = "/settings";
              });
              const fiscal = page.getByRole("region", {
                name: "Opciones de facturación de la empresa",
              });
              await fiscal.waitFor();
              const text = await fiscal.innerText();
              if (
                ![
                  "Demostración",
                  "TicketBAI",
                  "VERI*FACTU",
                  "SIF NO VERI*FACTU",
                  "Programa externo",
                  "Facturae",
                  "Todavía no se emiten facturas fiscales",
                ].every((value) => text.includes(value)) ||
                (await fiscal
                  .getByRole("button", {
                    name: "Guardar configuración fiscal",
                    exact: true,
                  })
                  .count())
              )
                throw Error(
                  "Published company fiscal preparation is incomplete or exposes an active invoice operation in demo",
                );
              if (
                await page.evaluate(
                  () => document.body.scrollWidth > innerWidth + 1,
                )
              )
                throw Error("Published fiscal preview exceeds viewport");
              await fiscal.screenshot({
                path: `${dir}/${name}-company-fiscal-preview.png`,
              });
              companyFiscalChecked = true;
              await page.evaluate(() => {
                location.hash = "/invoices";
              });
              await page
                .getByRole("region", {
                  name: "Bandeja de facturas",
                  exact: true,
                })
                .waitFor();
            }
            if (config.expected_company_copilot === true) {
              await page.evaluate(() => {
                location.hash = "/assistant";
              });
              const copilot = page.getByRole("region", {
                name: "Asistente de empresa",
                exact: true,
              });
              await copilot.waitFor();
              const description = await copilot.innerText();
              if (
                ![
                  "Tu asistente por voz y texto",
                  "Vista previa",
                  "camiones",
                  "conductores",
                  "clientes",
                  "gastos",
                  "Revisa cada propuesta",
                ].every((text) => description.includes(text)) ||
                (await copilot
                  .getByRole("button", {
                    name: "Enviar al asistente",
                    exact: true,
                  })
                  .count())
              )
                throw Error(
                  "Published copilot demo is incomplete or exposes an active AI operation",
                );
              if (
                await page.evaluate(
                  () => document.body.scrollWidth > innerWidth + 1,
                )
              )
                throw Error("Published copilot preview exceeds viewport");
              await copilot
                .getByRole("heading", {
                  name: "Tu asistente por voz y texto",
                  exact: true,
                })
                .scrollIntoViewIfNeeded();
              await page.screenshot({
                path: `${dir}/${name}-copilot-demo.png`,
              });
              companyCopilotChecked = true;
              await page.evaluate(() => {
                location.hash = "/invoices";
              });
              await page
                .getByRole("region", {
                  name: "Bandeja de facturas",
                  exact: true,
                })
                .waitFor();
            }
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
          authMailCors: authMailCorsChecked,
          mailServicesCors: mailServicesCorsChecked,
          personalMailConfig: personalMailConfigChecked,
          personalMailReady,
          publicLegalPages: publicLegalPagesChecked,
          billingIssuer: billingIssuerChecked,
          invoiceInbox: invoiceInboxChecked,
          tyresOffline: tyresOfflineChecked,
          personalMailOffline: personalMailOfflineChecked,
          companyFiscalPreparation: companyFiscalChecked,
          companyCopilot: companyCopilotChecked,
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
