import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleCatalog, featureLabels } from "../../src/domain/subscriptions";
import type { ManualSubscriptionTask } from "../../src/domain/manual-subscription-admin";
const userId = "fc610000-0000-4000-8000-000000000081";
const org = "fc610000-0000-4000-8000-000000000082";
const taskId = "fc610000-0000-4000-8000-000000000083";
const stamp = "2026-11-08T08:00:00Z";
const jwt = () => Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") + "." +
  Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url") + ".synthetic";
function sample(): ManualSubscriptionTask {
  return {
    id: taskId, buyer_company_id: org, buyer_company_name: "Cliente fiscal ficticio",
    buyer_tax_id: "DEMO-FISCAL-001", buyer_address: "Domicilio ficticio 50",
    buyer_email: "buyer-fiscal@example.invalid", buyer_validated: false,
    buyer_snapshot_origin: "profile_at_intake", provider_payment_id: "in_syntheticOperator",
    provider_invoice_id: "in_syntheticOperator", period_start: "2026-11-01T00:00:00Z",
    period_end: "2026-12-01T00:00:00Z", amount_cents: 36300, net_cents: 30000,
    vat_cents: 6300, vat_rate_bps: 2100, currency: "EUR", paid_at: stamp,
    status: "awaiting_issue", row_version: 1, invoice: null, dispatch: null, review_reason: null,
  };
}
async function fixtures(page: Page) {
  let actor = false, metadata: Record<string, unknown> = {};
  let task = sample();
  let resumeValidation: (() => void) | null = null;
  const controls = { delayValidation: false, releaseValidation: () => resumeValidation?.(), failure: "" as "" | "unavailable" | "denied" | "conflict" };
  const calls: { action: string; body: Record<string, unknown> }[] = [];
  const user = () => ({ id: userId, aud: "authenticated", role: "authenticated",
    email: "pedidos@smartscaneuskadi.com", email_confirmed_at: stamp, user_metadata: metadata });
  const catalog = structuredClone(exampleCatalog);
  const access = { is_admin: true, active: true, profile: null,
    features: catalog.plans.find((p) => p.id === "full")!.modules, plan: "full",
    max_trucks: 50, requires_phone_verification: false, can_manage: true, can_write: true,
    organization_id: org, company_role: "owner", sms_ready: false,
    prices_are_examples: true, payments_enabled: false };
  const snapshot = { settings: { prices_are_examples: true, payments_enabled: false, sms_ready: false, registration_open: true },
    plans: catalog.plans, modules: Object.entries(featureLabels).map(([id, label]) => ({ id, label, enabled: true })),
    customers: [], pending_registrations: [], payment_requests: [], audit: [] };
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const req = route.request(), url = new URL(req.url());
    const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:4194",
      "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,prefer",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS", "Content-Type": "application/json" };
    if (req.method() === "OPTIONS") { await route.fulfill({ status: 204, headers, body: "" }); return; }
    const body = req.postDataJSON() as Record<string, unknown> | null;
    let data: unknown = null, status = 200;
    if (url.pathname === "/auth/v1/token") {
      actor = true; data = { access_token: jwt(), refresh_token: "synthetic-refresh-only", token_type: "bearer", expires_in: 3600, user: user() };
    } else if (url.pathname === "/auth/v1/user") {
      if (req.method() === "PUT") metadata = (body?.data ?? {}) as Record<string, unknown>;
      data = user();
    } else if (url.pathname === "/auth/v1/logout") { actor = false; data = {}; }
    else if (url.pathname.endsWith("/tc_public_catalog")) data = catalog;
    else if (url.pathname.endsWith("/tc_finish_registration") || url.pathname.endsWith("/tc_my_access")) data = access;
    else if (url.pathname.endsWith("/tc_admin_control")) data = snapshot;
    else if (url.pathname.endsWith("/tc_admin_manual_subscription_invoices")) {
      const action = String(body?.p_action ?? "");
      calls.push({ action, body: body ?? {} });
      if (!actor || controls.failure === "denied") { status = 403; data = { code: "42501", message: "private synthetic diagnostic" }; }
      else if (controls.failure === "unavailable") { status = 404; data = { code: "PGRST202" }; }
      else if (action === "capabilities") data = { available: true, document_upload_ready: false };
      else if (action === "list") data = { items: [task], next_cursor: null };
      else if (controls.failure === "conflict") { status = 409; data = { code: "40001", message: "private synthetic diagnostic" }; }
      else if (body?.p_task_id !== taskId || body?.p_expected !== task.row_version) { status = 409; data = { code: "40001" }; }
      else {
        const input = body?.p_data as Record<string, string>;
        if (action === "validate_buyer" && controls.delayValidation) await new Promise<void>((resolve) => { resumeValidation = resolve; });
        if (action === "validate_buyer") task = { ...task, buyer_validated: true, buyer_snapshot_origin: "operator_validated",
          buyer_company_name: input.company_name, buyer_tax_id: input.tax_id, buyer_address: input.address, buyer_email: input.email, row_version: task.row_version + 1 };
        else if (action === "needs_review") task = { ...task, status: "needs_review",
          review_reason: input.reason as ManualSubscriptionTask["review_reason"], row_version: task.row_version + 1 };
        else { status = 400; data = { code: "23514" }; }
        if (status === 200) data = { task, replayed: false };
      }
    } else { status = 400; data = { message: "Unexpected synthetic request: " + url.pathname }; }
    await route.fulfill({ status, headers, body: JSON.stringify(data) });
  });
  return { controls, calls };
}
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("Correo electrónico", { exact: true }).fill("pedidos@smartscaneuskadi.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Facturas del servicio", exact: true }).click();
}
const panel = (page: Page) => page.getByRole("region", { name: "Facturas del servicio TruckControl" });

test("comprador fiscal validado con confirmación, versión y revisión; sin emisión ni cobro", async ({ page }) => {
  const f = await fixtures(page);
  await open(page);
  await expect(panel(page)).toContainText("Cliente fiscal ficticio");
  await expect(panel(page).getByRole("button", { name: "Registrar factura fiscal · pendiente", exact: true })).toBeDisabled();
  await panel(page).getByRole("button", { name: "Contrastar datos fiscales", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Contrastar comprador de la factura", exact: true });
  await dialog.getByLabel("Referencia del soporte comprobado").fill("Soporte de contratación ficticio");
  await dialog.getByLabel("He comprobado los datos y confirmo esta actuación administrativa.").check();
  await dialog.getByRole("button", { name: "Confirmar y registrar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(panel(page)).toContainText("Contrastados por administración");
  const validation = f.calls.filter((c) => c.action === "validate_buyer");
  expect(validation).toHaveLength(1);
  expect(validation[0].body.p_expected).toBe(1);
  expect(String(validation[0].body.p_request_id)).toMatch(/^[a-f0-9-]{36}$/);
  expect(validation[0].body.p_data).not.toHaveProperty("is_admin");
  await panel(page).getByRole("button", { name: "Registrar incidencia", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Registrar incidencia de facturación", exact: true });
  await review.getByLabel("Motivo de revisión").selectOption("customer_data_invalid");
  await review.getByLabel("He comprobado los datos y confirmo esta actuación administrativa.").check();
  await review.getByRole("button", { name: "Confirmar y registrar", exact: true }).click();
  await expect(review).not.toBeVisible();
  await expect(panel(page)).toContainText("Requiere revisión");
  expect(f.calls.filter((c) => c.action === "needs_review")[0].body.p_expected).toBe(2);
  expect(f.calls.some((c) => c.action === "register_invoice")).toBe(false);
});

test("conflicto CAS y permisos se muestran de forma segura sin repetir escrituras", async ({ page }) => {
  const f = await fixtures(page);
  await open(page);
  await panel(page).getByRole("button", { name: "Registrar incidencia", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar incidencia de facturación", exact: true });
  await dialog.getByLabel("He comprobado los datos y confirmo esta actuación administrativa.").check();
  f.controls.failure = "conflict";
  await dialog.getByRole("button", { name: "Confirmar y registrar", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toContainText("otro dispositivo");
  await expect(panel(page)).not.toContainText("Cliente fiscal ficticio");
  expect(f.calls.filter((c) => c.action === "needs_review")).toHaveLength(1);
  f.controls.failure = "denied";
  await panel(page).getByRole("button", { name: "Actualizar facturas", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toContainText("administración global");
  await expect(page.locator("body")).not.toContainText("private synthetic diagnostic");
});

test("una API ausente no presenta facturas ficticias ni pagos habilitados", async ({ page }) => {
  const f = await fixtures(page); f.controls.failure = "unavailable";
  await open(page);
  await expect(panel(page).getByRole("alert")).toContainText("preparación");
  await expect(panel(page)).not.toContainText("Cliente fiscal ficticio");
  expect(f.calls.map((c) => c.action)).toEqual(["capabilities"]);
});

test("datos fiscales solo en memoria, ambos temas accesibles y desconexión limpia el panel", async ({ page, context }, info) => {
  await fixtures(page);
  await open(page);
  await expect(panel(page)).toContainText("Cliente fiscal ficticio");
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
    await dialog.getByRole("radio", { name: theme, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    expect((await new AxeBuilder({ page }).include('[aria-label="Facturas del servicio TruckControl"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("manual-invoices-" + theme.replaceAll(" ", "-") + ".png") });
  }
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain("DEMO-FISCAL-001");
  expect(stored).not.toContain("buyer-fiscal@example.invalid");
  await context.setOffline(true);
  await expect(panel(page)).toContainText("Conéctate para consultar");
  await expect(panel(page)).not.toContainText("Cliente fiscal ficticio");
  await expect(panel(page).getByRole("button", { name: "Actualizar facturas", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(panel(page)).toContainText("Cliente fiscal ficticio");
});


test("una respuesta de escritura anterior a la reconexión no reemplaza la consulta nueva", async ({ page }) => {
  const f = await fixtures(page);
  await open(page);
  f.controls.delayValidation = true;
  await panel(page).getByRole("button", { name: "Contrastar datos fiscales", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Contrastar comprador de la factura", exact: true });
  await dialog.getByLabel("Referencia del soporte comprobado").fill("Soporte de contratación ficticio");
  await dialog.getByLabel("He comprobado los datos y confirmo esta actuación administrativa.").check();
  await dialog.getByRole("button", { name: "Confirmar y registrar", exact: true }).click();
  await expect.poll(() => f.calls.filter((c) => c.action === "validate_buyer").length).toBe(1);
  // Only the browser connectivity signal is controlled; the held HTTP response
  // remains live so this exercises stale-result suppression rather than abort.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(panel(page)).toContainText("Conéctate para consultar");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.dispatchEvent(new Event("online"));
  });
  await expect(panel(page)).toContainText("Pendientes de contrastar");
  const response = page.waitForResponse((r) => r.url().endsWith("/tc_admin_manual_subscription_invoices") && r.request().postDataJSON()?.p_action === "validate_buyer");
  f.controls.releaseValidation();
  await (await response).finished();
  // The saving finally block enables Refresh; no arbitrary sleep is needed.
  await expect(panel(page).getByRole("button", { name: "Actualizar facturas", exact: true })).toBeEnabled();
  await expect(panel(page)).not.toContainText("Contrastados por administración");
  await panel(page).getByRole("button", { name: "Actualizar facturas", exact: true }).click();
  await expect(panel(page)).toContainText("Contrastados por administración");
  expect(f.calls.filter((c) => c.action === "validate_buyer")).toHaveLength(1);
});
