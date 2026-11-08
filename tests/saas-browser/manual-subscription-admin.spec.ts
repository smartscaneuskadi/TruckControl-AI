import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
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
  let resumeDownload: (() => void) | null = null;
  let objectWrites = 0;
  const workerCalls: { action: string; operation: string; task: string; version: number }[] = [];
  const objects = new Map<string, { bytes: Buffer; document: { document_id: string; task_id: string; object_key: string; sha256: string; size_bytes: number } }>();
  const uploads = new Map<string, string>();
  const completed = new Map<string, { fingerprint: string; task: ManualSubscriptionTask }>();
  const controls = { workerReady: false, workerDenied: false, badAck: false, uncertainUploads: 0, uncertainRegistrations: 0, delayDownload: false,
    releaseDownload: () => resumeDownload?.(), delayValidation: false, releaseValidation: () => resumeValidation?.(), failure: "" as "" | "unavailable" | "denied" | "conflict" };
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
    const body = req.headers()["content-type"]?.includes("application/json") ? req.postDataJSON() as Record<string, unknown> | null : null;
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
    else if (url.pathname.endsWith("/company-manual-invoices/capabilities")) {
      if (!actor || controls.workerDenied) { status = 403; data = { error: "operator_required" }; }
      else data = { available: true, document_upload_ready: controls.workerReady, downloads_ready: controls.workerReady };
    } else if (url.pathname.endsWith("/company-manual-invoices")) {
      if (!actor || controls.workerDenied) { status = 403; data = { error: "operator_required" }; }
      else if (!controls.workerReady) { status = 503; data = { error: "document_upload_unavailable" }; }
      else if (req.headers()["content-type"]?.startsWith("multipart/form-data;")) {
        const raw = req.postDataBuffer();
        if (!raw) throw Error("Missing synthetic multipart body");
        const form = await new Request(req.url(), { method: "POST", headers: { "Content-Type": req.headers()["content-type"] }, body: new Uint8Array(raw) }).formData();
        const selected = form.get("file"), operation = String(form.get("operation_id"));
        workerCalls.push({ action: "upload", operation, task: String(form.get("task_id")), version: Number(form.get("expected_version")) });
        if (!(selected instanceof File)) throw Error("Missing synthetic PDF");
        const bytes = Buffer.from(await selected.arrayBuffer()), digest = createHash("sha256").update(bytes).digest("hex");
        if (form.get("task_id") !== taskId || Number(form.get("expected_version")) !== task.row_version) { status = 409; data = { error: "version_conflict" }; }
        else {
          let key = uploads.get(operation);
          if (!key) {
            const id = "fc650000-0000-4000-8000-" + String(objectWrites + 6).padStart(12, "0");
            key = "subscription-invoices/" + org + "/" + taskId + "/" + id + ".pdf";
            objects.set(key, { bytes, document: { document_id: id, task_id: taskId, object_key: key, sha256: digest, size_bytes: bytes.byteLength } });
            uploads.set(operation, key); objectWrites++;
          }
          const saved = objects.get(key)!;
          if (saved.document.sha256 !== digest) { status = 409; data = { error: "reservation_mismatch" }; }
          else {
            if (controls.uncertainUploads > 0) { controls.uncertainUploads--; await route.abort("failed"); return; }
            data = { document: controls.badAck ? { ...saved.document, task_id: userId } : saved.document, fiscal_validity_verified: false };
          }
        }
      } else if (body?.action === "download") {
        workerCalls.push({ action: "download", operation: String(body.operation_id), task: String(body.task_id), version: Number(body.expected_version) });
        const saved = task.invoice ? objects.get(task.invoice.pdf_object_key) : null;
        if (!saved || body.task_id !== taskId || body.document_id !== saved.document.document_id || body.expected_version !== task.row_version) { status = 403; data = { error: "document_denied" }; }
        else {
          if (controls.delayDownload) await new Promise<void>((resolve) => { resumeDownload = resolve; });
          await route.fulfill({ status: 200, headers: { ...headers, "Content-Type": "application/pdf",
            "Cache-Control": "no-store, private", "Content-Disposition": 'attachment; filename="factura-fiscal.pdf"' }, body: saved.bytes }).catch(() => {});
          return;
        }
      } else { status = 400; data = { error: "invalid_action" }; }
    }
    else if (url.pathname.endsWith("/tc_admin_manual_subscription_invoices")) {
      const action = String(body?.p_action ?? "");
      calls.push({ action, body: body ?? {} });
      if (!actor || controls.failure === "denied") { status = 403; data = { code: "42501", message: "private synthetic diagnostic" }; }
      else if (controls.failure === "unavailable") { status = 404; data = { code: "PGRST202" }; }
      else if (action === "capabilities") data = { available: true, document_upload_ready: false };
      else if (action === "list" || action === "detail") data = { items: [task], next_cursor: null };
      else if (completed.has(String(body?.p_request_id))) {
        const previous = completed.get(String(body?.p_request_id))!;
        const fingerprint = JSON.stringify({ action, task_id: body?.p_task_id, expected: body?.p_expected, input: body?.p_data });
        if (previous.fingerprint !== fingerprint) { status = 409; data = { code: "23514" }; }
        else data = { task, replayed: true };
      }
      else if (controls.failure === "conflict") { status = 409; data = { code: "40001", message: "private synthetic diagnostic" }; }
      else if (body?.p_task_id !== taskId || body?.p_expected !== task.row_version) { status = 409; data = { code: "40001" }; }
      else {
        const input = body?.p_data as Record<string, string>;
        if (action === "validate_buyer" && controls.delayValidation) await new Promise<void>((resolve) => { resumeValidation = resolve; });
        if (action === "validate_buyer") task = { ...task, buyer_validated: true, buyer_snapshot_origin: "operator_validated",
          buyer_company_name: input.company_name, buyer_tax_id: input.tax_id, buyer_address: input.address, buyer_email: input.email, row_version: task.row_version + 1 };
        else if (action === "register_invoice") {
          const saved = objects.get(input.pdf_object_key);
          if (!task.buyer_validated || !saved || saved.document.sha256 !== input.pdf_sha256) { status = 409; data = { code: "23514" }; }
          else task = { ...task, status: "awaiting_send", row_version: task.row_version + 1,
            invoice: { invoice_number: input.invoice_number, ticketbai_reference: input.ticketbai_reference,
              issued_at: input.issued_at, pdf_object_key: input.pdf_object_key, pdf_sha256: input.pdf_sha256 } };
        } else if (action === "report_sent") task = { ...task, status: "sent_reported", row_version: task.row_version + 1,
          dispatch: { sent_at: input.sent_at, recipient: input.recipient, reference: input.reference } };
        else if (action === "needs_review") task = { ...task, status: "needs_review",
          review_reason: input.reason as ManualSubscriptionTask["review_reason"], row_version: task.row_version + 1 };
        else { status = 400; data = { code: "23514" }; }
        if (status === 200) {
          completed.set(String(body?.p_request_id), { fingerprint: JSON.stringify({ action, task_id: body?.p_task_id, expected: body?.p_expected, input: body?.p_data }), task: structuredClone(task) });
          if (action === "register_invoice" && controls.uncertainRegistrations > 0) {
            controls.uncertainRegistrations--; await route.abort("failed"); return;
          }
          data = { task, replayed: false };
        }
      }
    } else { status = 400; data = { message: "Unexpected synthetic request: " + url.pathname }; }
    await route.fulfill({ status, headers, body: JSON.stringify(data) });
  });
  return { controls, calls, workerCalls, objectWrites: () => objectWrites };
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


const fiscalPdfBytes = Buffer.from("%PDF-1.7\nPDF FISCAL FICTICIO PARA PRUEBAS, SIN VALIDEZ.\n%%EOF\n");
async function verifyBuyer(page: Page) {
  await panel(page).getByRole("button", { name: "Contrastar datos fiscales", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Contrastar comprador de la factura", exact: true });
  await dialog.getByLabel("Referencia del soporte comprobado").fill("Soporte fiscal ficticio de contratación");
  await dialog.getByLabel("He comprobado los datos y confirmo esta actuación administrativa.").check();
  await dialog.getByRole("button", { name: "Confirmar y registrar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function openPdf(page: Page) {
  await panel(page).getByRole("button", { name: "Adjuntar PDF y registrar factura", exact: true }).click();
  return page.getByRole("dialog", { name: "PDF y factura fiscal de GDTaller", exact: true });
}
async function chooseAndUpload(page: Page) {
  const dialog = await openPdf(page);
  await dialog.getByLabel("PDF fiscal emitido (máximo 10 MiB)").setInputFiles({ name: "factura-ficticia.pdf", mimeType: "application/pdf", buffer: fiscalPdfBytes });
  await dialog.getByRole("button", { name: "Guardar y comprobar PDF privado", exact: true }).click();
  return dialog;
}
async function invoiceFields(page: Page) {
  const dialog = page.getByRole("dialog", { name: "PDF y factura fiscal de GDTaller", exact: true });
  await dialog.getByLabel("Número y serie de la factura fiscal").fill("NOFISCAL-TEST-2026-001");
  await dialog.getByLabel("Referencia TicketBAI de la factura emitida").fill("NOFISCAL-TBAI-TEST-001");
  const local = await page.evaluate(() => {
    const value = new Date(Date.now() - 30 * 60000);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  await dialog.getByLabel("Fecha y hora de emisión (hora local)").fill(local);
  await dialog.getByLabel("He comprobado que el PDF y sus referencias corresponden a la factura fiscal emitida para este comprador.").check();
  return dialog;
}
async function registeredFixture(page: Page) {
  const f = await fixtures(page); f.controls.workerReady = true;
  await open(page); await verifyBuyer(page);
  const dialog = await chooseAndUpload(page);
  await expect(dialog.getByRole("status")).toContainText("PDF guardado y comprobado");
  await invoiceFields(page);
  await dialog.getByRole("button", { name: "Registrar factura emitida", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(panel(page)).toContainText("Pendiente de envío");
  return f;
}
test("PDF guardado, referencia manual y descarga por SDK; ambos temas y envío declarado honestos", async ({ page }, info) => {
  await page.addInitScript(() => {
    const state = window as unknown as { __fiscalCreated: string[]; __fiscalRevoked: string[] };
    state.__fiscalCreated = []; state.__fiscalRevoked = [];
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => { const url = create(value); if (value instanceof Blob && value.type === "application/pdf") state.__fiscalCreated.push(url); return url; };
    URL.revokeObjectURL = (url) => { if (state.__fiscalCreated.includes(url)) state.__fiscalRevoked.push(url); revoke(url); };
  });
  const f = await registeredFixture(page);
  expect(f.objectWrites()).toBe(1);
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(1);
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
    await dialog.getByRole("radio", { name: theme, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    expect((await new AxeBuilder({ page }).include('[aria-label="Facturas del servicio TruckControl"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("fiscal-pdf-" + theme.replaceAll(" ", "-") + ".png") });
  }
  const transferred = page.waitForEvent("download");
  await panel(page).getByRole("button", { name: "Descargar PDF fiscal", exact: true }).click();
  const downloaded = await transferred;
  expect(downloaded.suggestedFilename()).toBe("factura-fiscal.pdf");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fiscalRevoked: string[] }).__fiscalRevoked.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __fiscalCreated: string[] }).__fiscalCreated.length)).toBe(1);
  expect(f.workerCalls.filter((call) => call.action === "download")).toHaveLength(1);
  await panel(page).getByRole("button", { name: "Registrar envío realizado", exact: true }).click();
  const sent = page.getByRole("dialog", { name: "Registrar envío manual realizado", exact: true });
  const local = await page.evaluate(() => {
    const value = new Date(Date.now() - 60000);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  await sent.getByLabel("Fecha y hora reales del envío").fill(local);
  await sent.getByLabel("Referencia del envío realizado").fill("ENVIO-FICTICIO-001");
  await sent.getByLabel("He comprobado los datos y confirmo esta actuación administrativa.").check();
  await sent.getByRole("button", { name: "Confirmar y registrar", exact: true }).click();
  await expect(sent).not.toBeVisible();
  await expect(panel(page)).toContainText("Envío declarado");
  await expect(panel(page)).toContainText("no acredita la recepción");
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain("NOFISCAL-TBAI-TEST-001");
  expect(storage).not.toContain("PDF FISCAL FICTICIO");
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(1);
});

test("carga incierta conserva formulario y repite explícitamente la misma reserva sin sobrescribir", async ({ page }) => {
  const f = await fixtures(page); f.controls.workerReady = true; f.controls.uncertainUploads = 1;
  await open(page); await verifyBuyer(page);
  const dialog = await chooseAndUpload(page);
  await expect(dialog.getByRole("alert")).toContainText("resultado no está confirmado");
  expect(f.workerCalls.filter((call) => call.action === "upload")).toHaveLength(1);
  expect(f.objectWrites()).toBe(1);
  await expect(dialog).toContainText("factura-ficticia.pdf");
  await dialog.getByRole("button", { name: "Guardar y comprobar PDF privado", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("PDF guardado y comprobado");
  const uploads = f.workerCalls.filter((call) => call.action === "upload");
  expect(uploads).toHaveLength(2); expect(uploads[0].operation).toBe(uploads[1].operation);
  expect(f.objectWrites()).toBe(1);
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(0);
});

test("un registro incierto se resuelve consultando la tarea sin crear otra factura", async ({ page }) => {
  const f = await fixtures(page); f.controls.workerReady = true; f.controls.uncertainRegistrations = 1;
  await open(page); await verifyBuyer(page);
  const dialog = await chooseAndUpload(page);
  await expect(dialog.getByRole("status")).toContainText("PDF guardado y comprobado");
  await invoiceFields(page);
  await dialog.getByRole("button", { name: "Registrar factura emitida", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Conservamos los campos");
  await expect(dialog.getByLabel("Número y serie de la factura fiscal")).toHaveValue("NOFISCAL-TEST-2026-001");
  await dialog.getByRole("button", { name: "Comprobar estado de la solicitud", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(panel(page)).toContainText("Pendiente de envío");
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(1);
  expect(f.objectWrites()).toBe(1);
});

test("ACK ajeno y permiso retirado nunca permiten registrar y limpian el contexto privado", async ({ page }) => {
  const f = await fixtures(page); f.controls.workerReady = true; f.controls.badAck = true;
  await open(page); await verifyBuyer(page);
  const dialog = await chooseAndUpload(page);
  await expect(dialog.getByRole("alert")).toContainText("No se ha podido comprobar");
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(0);
  f.controls.workerDenied = true;
  await dialog.getByRole("button", { name: "Guardar y comprobar PDF privado", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(panel(page)).not.toContainText("Cliente fiscal ficticio");
  await expect(panel(page).getByRole("alert")).toContainText("sesión");
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(0);
});

test("flags apagados antes de registrar conservan los campos y bloquean la mutación", async ({ page }) => {
  const f = await fixtures(page); f.controls.workerReady = true;
  await open(page); await verifyBuyer(page);
  const dialog = await chooseAndUpload(page);
  await expect(dialog.getByRole("status")).toContainText("PDF guardado y comprobado");
  await invoiceFields(page); f.controls.workerReady = false;
  await dialog.getByRole("button", { name: "Registrar factura emitida", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("No se ha podido confirmar");
  await expect(dialog.getByLabel("Número y serie de la factura fiscal")).toHaveValue("NOFISCAL-TEST-2026-001");
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(0);
  f.controls.workerReady = true;
  await dialog.getByRole("button", { name: "Registrar factura emitida", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(f.calls.filter((call) => call.action === "register_invoice")).toHaveLength(1);
});

test("salir del panel aborta una descarga tardía y no crea una URL ni descarga en otro contexto", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { __fiscalPdfUrls: number };
    state.__fiscalPdfUrls = 0;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value) => { if (value instanceof Blob && value.type === "application/pdf") state.__fiscalPdfUrls++; return create(value); };
  });
  const f = await registeredFixture(page); f.controls.delayDownload = true;
  const downloaded: string[] = [];
  page.on("download", (download) => downloaded.push(download.suggestedFilename()));
  const aborted = page.waitForEvent("requestfailed", (request) =>
    request.url().endsWith("/company-manual-invoices") && request.postDataJSON()?.action === "download");
  await panel(page).getByRole("button", { name: "Descargar PDF fiscal", exact: true }).click();
  await expect.poll(() => f.workerCalls.filter((call) => call.action === "download").length).toBe(1);
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await aborted; f.controls.releaseDownload();
  await expect(page.getByRole("heading", { name: "Clientes y periodos de prueba", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __fiscalPdfUrls: number }).__fiscalPdfUrls)).toBe(0);
  expect(downloaded).toEqual([]);
});
