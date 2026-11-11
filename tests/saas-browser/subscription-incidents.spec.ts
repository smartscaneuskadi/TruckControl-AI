import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleCatalog, featureLabels } from "../../src/domain/subscriptions";
import { actorId, caseId, companyId, incident, incidentCapabilities, mutation, taskId } from "../fixtures/subscription-incidents";
import type { IncidentAction, IncidentInput, IncidentMutation, SubscriptionIncident } from "../../src/domain/subscription-incidents";
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const jwt = (n = 1) => Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") + "." +
  Buffer.from(JSON.stringify({ sub: actorId, aud: "authenticated", role: "authenticated", session_id: "fc640000-0000-4000-8000-" + String(n).padStart(12, "0"),
    exp: expiresAt })).toString("base64url") + ".synthetic";
async function fixtures(page: Page) {
  let actor = false, metadata: Record<string, unknown> = {}, current: SubscriptionIncident = incident();
  let resumeList: (() => void) | null = null, resumeWrite: (() => void) | null = null, resumeFiscal: (() => void) | null = null;
  let entries: Record<string, unknown>[] = [{ id: "fc640000-0000-4000-8000-000000000091", row_version: 2, kind: "provider", actor_id: null,
    created_at: current.created_at, provider: current.latest_provider, note: null, reference: null }];
  const completed = new Map<string, { fingerprint: string; result: IncidentMutation }>(), references = new Set<string>();
  const calls: { action: string; body: Record<string, unknown>; authorization: string; kind: string }[] = [];
  const controls = { failure: "" as "" | "denied" | "missing", conflict: false, lostReplies: 0, providerAfterWrite: false, providerOnHistory: false,
    delayList: 0, delayWrite: false, delayFiscal: false,
    releaseList: () => resumeList?.(), releaseWrite: () => resumeWrite?.(), releaseFiscal: () => resumeFiscal?.(),
    rename(name: string) { current = { ...current, buyer_company_name: name }; }, logout() { actor = false; } };
  const catalog = structuredClone(exampleCatalog);
  const user = () => ({ id: actorId, aud: "authenticated", role: "authenticated", email: "pedidos@smartscaneuskadi.com",
    email_confirmed_at: "2026-11-08T08:00:00Z", user_metadata: metadata });
  const access = { is_admin: true, active: true, profile: null, features: catalog.plans.find((p) => p.id === "full")!.modules,
    plan: "full", max_trucks: 50, requires_phone_verification: false, can_manage: true, can_write: true, organization_id: companyId,
    company_role: "owner", sms_ready: false, prices_are_examples: true, payments_enabled: false };
  const snapshot = { settings: { prices_are_examples: true, payments_enabled: false, sms_ready: false, registration_open: true },
    plans: catalog.plans, modules: Object.entries(featureLabels).map(([id, label]) => ({ id, label, enabled: true })),
    customers: [], pending_registrations: [], payment_requests: [], audit: [] };
  const fiscal = { id: taskId, buyer_company_id: companyId, buyer_company_name: "Cliente de incidencias ficticio",
    buyer_tax_id: "DEMO-INCIDENTS-01", buyer_address: "Domicilio ficticio 50", buyer_email: "incident-buyer@example.invalid", buyer_validated: false,
    buyer_snapshot_origin: "profile_at_intake", provider_payment_id: current.provider_payment_id, provider_invoice_id: current.provider_invoice_id,
    period_start: current.period_start, period_end: current.period_end, amount_cents: current.amount_cents,
    net_cents: 30000, vat_cents: 6300, vat_rate_bps: 2100, currency: "EUR", paid_at: current.paid_at,
    status: "awaiting_issue", row_version: 1, invoice: null, dispatch: null, review_reason: null };
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const req = route.request(), url = new URL(req.url()), body = req.postData() ? req.postDataJSON() as Record<string, unknown> : {};
    const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:4194", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,prefer",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store, private" };
    if (req.method() === "OPTIONS") { await route.fulfill({ status: 204, headers, body: "" }); return; }
    let data: unknown = null, status = 200;
    if (url.pathname === "/auth/v1/token") { actor = true; data = { access_token: jwt(), refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, user: user() }; }
    else if (url.pathname === "/auth/v1/user") {
      if (!actor) { status = 401; data = { message: "synthetic signed out" }; }
      else { if (req.method() === "PUT") metadata = (body.data ?? {}) as Record<string, unknown>; data = user(); }
    } else if (url.pathname === "/auth/v1/logout") { actor = false; data = {}; }
    else if (url.pathname.endsWith("/tc_public_catalog")) data = catalog;
    else if (url.pathname.endsWith("/tc_finish_registration") || url.pathname.endsWith("/tc_my_access")) data = access;
    else if (url.pathname.endsWith("/tc_admin_control")) data = snapshot;
    else if (url.pathname.endsWith("/tc_admin_subscription_incidents")) {
      const action = String(body.p_action ?? "");
      calls.push({ action, body, authorization: req.headers().authorization ?? "", kind: "incident" });
      if (!actor || controls.failure === "denied") { status = 403; data = { code: "42501", message: "PRIVATE-DIAGNOSTIC" }; }
      else if (controls.failure === "missing") { status = 404; data = { code: "PGRST202", message: "PRIVATE-DIAGNOSTIC" }; }
      else if (action === "capabilities") data = incidentCapabilities;
      else if (action === "list" || action === "detail") {
        const saved = structuredClone(current);
        if (action === "list" && controls.delayList > 0) { controls.delayList--; await new Promise<void>((resolve) => { resumeList = resolve; }); }
        data = { contract: "subscription-financial-incidents-v1", items: [saved], next_cursor: null };
      } else if (action === "history") {
        if (controls.providerOnHistory) {
          controls.providerOnHistory = false;
          current = { ...current, row_version: current.row_version + 1, review_state: "pending", rectification_state: "pending",
            latest_provider: { ...current.latest_provider, event_id: "evt_incidentHistoryRace", event_type: "refund.updated",
              current_status: "succeeded", extent: "partial", charge_amount_refunded_cents: 12100, observed_at: "2026-11-08T10:00:30Z" } };
          entries.unshift({ id: "fc640000-0000-4000-8000-000000000093", row_version: current.row_version, kind: "provider", actor_id: null,
            created_at: current.latest_provider.observed_at, provider: current.latest_provider, note: null, reference: null });
        }
        data = { contract: "subscription-financial-incidents-v1", case_id: caseId,
          items: entries.filter((entry) => !(body.p_data as { before_version?: number })?.before_version ||
            Number(entry.row_version) < Number((body.p_data as { before_version: number }).before_version)).slice(0, 50), next_before_version: null };
      }
      else if (action === "review" || action === "report_rectification") {
        const id = String(body.p_operation_id), fingerprint = JSON.stringify(body), found = completed.get(id);
        if (found) {
          if (found.fingerprint !== fingerprint) { status = 409; data = { code: "23514" }; }
          else data = { ...found.result, case: current, replayed: true };
        } else if (controls.conflict || body.p_expected !== current.row_version || body.p_case_id !== caseId) { status = 409; data = { code: "40001", message: "PRIVATE-DIAGNOSTIC" }; }
        else {
          const input = body.p_data as IncidentInput;
          if ("reference" in input && references.has(input.reference.toUpperCase().trim())) { status = 400; data = { code: "23514" }; }
          else {
            const result = mutation(current, action as IncidentAction, input, id); current = result.case;
            completed.set(id, { fingerprint, result });
            if ("reference" in input) references.add(input.reference.toUpperCase().trim());
            entries.unshift({ id, row_version: result.operation.applied_version, kind: action === "review" ? "review" : "rectification_report",
              actor_id: actorId, created_at: result.operation.reported_at, provider: null, note: result.operation.note, reference: result.operation.reference });
            if (controls.providerAfterWrite) {
              controls.providerAfterWrite = false;
              current = { ...current, row_version: current.row_version + 1, review_state: "pending", rectification_state: "pending" };
              entries.unshift({ id: "fc640000-0000-4000-8000-000000000092", row_version: current.row_version, kind: "provider", actor_id: null,
                created_at: current.created_at, provider: current.latest_provider, note: null, reference: null });
            }
            if (controls.delayWrite) await new Promise<void>((resolve) => { resumeWrite = resolve; });
            if (controls.lostReplies > 0) { controls.lostReplies--; await route.abort("failed"); return; }
            data = { ...result, case: current };
          }
        }
      } else { status = 400; data = { code: "22023" }; }
    } else if (url.pathname.endsWith("/tc_admin_manual_subscription_invoices")) {
      const action = String(body.p_action ?? "");
      calls.push({ action, body, authorization: req.headers().authorization ?? "", kind: "fiscal" });
      if (!actor) { status = 403; data = { code: "42501" }; }
      else if (action === "capabilities") data = { available: true, document_upload_ready: false };
      else if (action === "detail") {
        if (controls.delayFiscal) await new Promise<void>((resolve) => { resumeFiscal = resolve; });
        data = { items: [fiscal], next_cursor: null };
      } else data = { items: [fiscal, { ...fiscal, id: "fc640000-0000-4000-8000-000000000099", buyer_company_name: "Otra solicitud ficticia" }], next_cursor: null };
    } else if (url.pathname.endsWith("/company-manual-invoices/capabilities")) data = { available: true, document_upload_ready: false, downloads_ready: false };
    else { status = 400; data = { message: "Unexpected synthetic request: " + url.pathname }; }
    await route.fulfill({ status, headers, body: JSON.stringify(data) }).catch(() => {});
  });
  return { controls, calls, writes: () => completed.size };
}
async function open(page: Page) {
  await page.goto("/"); await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("Correo electrónico", { exact: true }).fill("pedidos@smartscaneuskadi.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const target = page.getByRole("button", { name: "Incidencias de pagos", exact: true });
  await expect(target).toBeVisible().catch(async (failure) => { throw Error("La administración no abrió con el fixture sintético: " + (await page.locator("body").innerText()).slice(0, 6000) + "\n" + String(failure)); });
  await target.click();
}
const panel = (page: Page) => page.getByRole("region", { name: "Incidencias de pagos del servicio" });
async function detail(page: Page) { await panel(page).getByRole("button", { name: "Revisar incidencia", exact: true }).click(); await expect(panel(page).getByRole("region", { name: "Historial inmutable de la incidencia" })).toBeVisible(); }
async function review(page: Page, note = "Revisión administrativa ficticia") {
  await panel(page).getByRole("button", { name: "Declarar revisión", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Declarar revisión de la incidencia", exact: true });
  await dialog.getByLabel("Nota de la actuación").fill(note);
  await dialog.getByLabel("He comprobado los hechos y confirmo esta declaración administrativa.").check();
  await dialog.getByRole("button", { name: "Confirmar declaración", exact: true }).click();
  return dialog;
}
async function externalSignOut(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("truckcontrol-auth-v1");
    const channel = new BroadcastChannel("truckcontrol-auth-v1");
    channel.postMessage({ event: "SIGNED_OUT", session: null }); setTimeout(() => channel.close(), 50);
  });
}
test("revisión y referencia externa con CAS e historial, sin ejecutar pagos ni emitir PDFs", async ({ page }) => {
  const f = await fixtures(page); await open(page); await detail(page);
  await expect(panel(page)).toContainText("Un reembolso pendiente o fallido no acredita dinero entregado");
  const dialog = await review(page); await expect(dialog).not.toBeVisible();
  await expect(panel(page)).toContainText("Revisión registrada");
  await panel(page).getByRole("button", { name: "Declarar referencia rectificativa", exact: true }).click();
  const fiscal = page.getByRole("dialog", { name: "Declarar referencia rectificativa externa", exact: true });
  await fiscal.getByLabel("Referencia real emitida en GDTaller").fill("GDT-FICTICIA-R1");
  await fiscal.getByLabel("Nota de la actuación").fill("Referencia externa ficticia comprobada");
  await fiscal.getByLabel("He comprobado los hechos y confirmo esta declaración administrativa.").check();
  await fiscal.getByRole("button", { name: "Confirmar declaración", exact: true }).click();
  await expect(fiscal).not.toBeVisible(); await expect(panel(page)).toContainText("GDT-FICTICIA-R1");
  expect(f.writes()).toBe(2);
  const writes = f.calls.filter((c) => c.kind === "incident" && ["review", "report_rectification"].includes(c.action));
  expect(writes.map((c) => c.body.p_expected)).toEqual([2, 3]);
  expect(writes[1].body.p_data).toEqual({ note: "Referencia externa ficticia comprobada", reference: "GDT-FICTICIA-R1" });
  expect(await page.locator('input[type="file"]').count()).toBe(0);
  expect(f.calls.every((c) => c.authorization === "Bearer " + jwt())).toBe(true);
});
test("una respuesta incierta sólo se repite expresamente con el mismo UUID y operación original", async ({ page }) => {
  const f = await fixtures(page); f.controls.lostReplies = 1; f.controls.providerAfterWrite = true;
  await open(page); await detail(page);
  const dialog = await review(page, "Nota ficticia para intento incierto");
  await expect(dialog).toContainText("El resultado es incierto");
  await expect(dialog.getByLabel("Nota de la actuación")).toBeDisabled();
  expect(f.writes()).toBe(1);
  await dialog.getByRole("button", { name: "Reintentar la misma declaración", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(panel(page)).toContainText("Revisión registrada");
  const calls = f.calls.filter((c) => c.action === "review");
  expect(calls).toHaveLength(2); expect(calls[0].body).toEqual(calls[1].body); expect(f.writes()).toBe(1);
  await expect(panel(page)).toContainText("Pendiente de revisar");
});
test("CAS y revocación de permisos fallan cerrados sin repetir escrituras ni filtrar diagnósticos", async ({ page }) => {
  const f = await fixtures(page); await open(page); await detail(page); f.controls.conflict = true;
  await review(page); await expect(panel(page).getByRole("alert")).toContainText("otro dispositivo");
  await expect(panel(page)).not.toContainText("Cliente de incidencias ficticio");
  expect(f.calls.filter((c) => c.action === "review")).toHaveLength(1); expect(f.writes()).toBe(0);
  f.controls.failure = "denied"; await panel(page).getByRole("button", { name: "Actualizar incidencias", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toContainText("administración");
  expect(f.calls.filter((c) => c.action === "review")).toHaveLength(1);
  await expect(page.locator("body")).not.toContainText("PRIVATE-DIAGNOSTIC");
});
test("API64 ausente se presenta en preparación, sin simulaciones ni consultas privadas posteriores", async ({ page }) => {
  const f = await fixtures(page); f.controls.failure = "missing"; await open(page);
  await expect(panel(page).getByRole("alert")).toContainText("todavía no está disponible");
  await expect(panel(page)).not.toContainText("Cliente de incidencias ficticio");
  expect(f.calls.filter((c) => c.kind === "incident").map((c) => c.action)).toEqual(["capabilities"]);
});
test("enlace a la solicitud fiscal exacta y vuelta al listado completo", async ({ page }) => {
  const f = await fixtures(page); await open(page); await detail(page);
  await panel(page).getByRole("button", { name: "Ver solicitud fiscal", exact: true }).click();
  const fiscal = page.getByRole("region", { name: "Facturas del servicio TruckControl" });
  await expect(fiscal).toContainText("Solicitud fiscal seleccionada");
  await expect(fiscal).toContainText("DEMO-INCIDENTS-01"); await expect(fiscal).not.toContainText("Otra solicitud ficticia");
  expect(f.calls.find((c) => c.kind === "fiscal" && c.action === "detail")?.body.p_task_id).toBe(taskId);
  await fiscal.getByRole("button", { name: "Volver a todas las facturas", exact: true }).click();
  await expect(fiscal).toContainText("Otra solicitud ficticia");
  expect(f.calls.filter((c) => c.kind === "fiscal" && c.action === "list")).toHaveLength(1);
});
test("temas Light/Cockpit accesibles, sin copia de incidencias offline", async ({ page, context }, info) => {
  await fixtures(page); await open(page); await detail(page);
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    const appearance = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
    await appearance.getByRole("radio", { name: theme, exact: true }).check();
    await appearance.getByRole("button", { name: "Aplicar apariencia" }).click();
    await appearance.getByRole("button", { name: "Cerrar ventana" }).click();
    expect((await new AxeBuilder({ page }).include('[aria-label="Incidencias de pagos del servicio"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("incidents-" + theme.replaceAll(" ", "-") + ".png") });
  }
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain("Cliente de incidencias ficticio"); expect(stored).not.toContain("pi_incidentSynthetic");
  await context.setOffline(true); await expect(panel(page)).toContainText("Conéctate para consultar");
  await expect(panel(page)).not.toContainText("Cliente de incidencias ficticio");
  await expect(panel(page).getByRole("button", { name: "Actualizar incidencias", exact: true })).toBeDisabled();
  await context.setOffline(false); await expect(panel(page)).toContainText("Cliente de incidencias ficticio");
});
test("cambio de JWT del mismo usuario descarta una lista antigua y conserva la consulta nueva", async ({ page }) => {
  const f = await fixtures(page); await open(page); await expect(panel(page)).toContainText("Cliente de incidencias ficticio");
  f.controls.delayList = 1; await panel(page).getByRole("button", { name: "Actualizar incidencias", exact: true }).click();
  await expect.poll(() => f.calls.filter((c) => c.action === "list").length).toBe(2);
  f.controls.rename("Vista de sesión nueva ficticia");
  await page.evaluate((token) => {
    const session = JSON.parse(localStorage.getItem("truckcontrol-auth-v1")!); session.access_token = token;
    localStorage.setItem("truckcontrol-auth-v1", JSON.stringify(session));
    const channel = new BroadcastChannel("truckcontrol-auth-v1"); channel.postMessage({ event: "TOKEN_REFRESHED", session }); setTimeout(() => channel.close(), 50);
  }, jwt(2));
  await expect(panel(page)).toContainText("Vista de sesión nueva ficticia");
  f.controls.releaseList(); await expect(panel(page)).not.toContainText("Cliente de incidencias ficticio");
  expect(f.calls.filter((c) => c.action === "list").at(-1)?.authorization).toBe("Bearer " + jwt(2));
});
test("logout con respuesta fiscal tardía limpia la selección y no muestra datos anteriores", async ({ page }) => {
  const f = await fixtures(page); await open(page); await detail(page); f.controls.delayFiscal = true;
  await panel(page).getByRole("button", { name: "Ver solicitud fiscal", exact: true }).click();
  await expect.poll(() => f.calls.filter((c) => c.kind === "fiscal" && c.action === "detail").length).toBe(1);
  f.controls.logout(); await externalSignOut(page); f.controls.releaseFiscal();
  await expect(page.locator("body")).not.toContainText("DEMO-INCIDENTS-01");
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  expect(f.writes()).toBe(0);
});
test("una confirmación tardía tras logout no reaparece en la entrada", async ({ page }) => {
  const f = await fixtures(page); await open(page); await detail(page); f.controls.delayWrite = true;
  await review(page, "NOTA-PRIVADA-FICTICIA");
  await expect.poll(() => f.writes()).toBe(1);
  f.controls.logout(); await externalSignOut(page); f.controls.releaseWrite();
  await expect(page.locator("body")).not.toContainText("NOTA-PRIVADA-FICTICIA");
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  expect(f.calls.filter((c) => c.action === "review")).toHaveLength(1);
});

test("una observación posterior al ACK actualiza el estado antes de mostrar el historial", async ({ page }) => {
  const f = await fixtures(page); await open(page); await detail(page); f.controls.providerOnHistory = true;
  const dialog = await review(page, "Revisión ficticia anterior a nueva observación");
  await expect(dialog).not.toBeVisible();
  await expect(panel(page)).toContainText("Las nuevas observaciones del proveedor ya se muestran");
  await expect(panel(page)).toContainText("evt_incidentHistoryRace");
  await expect(panel(page)).toContainText("Pendiente de revisar");
  await expect(panel(page).getByText("Declarada por administración", { exact: true })).toHaveCount(0);
  expect(f.calls.filter((c) => c.action === "review")).toHaveLength(1);
  expect(f.calls.filter((c) => c.kind === "incident" && c.action === "detail")).toHaveLength(2);
  expect(f.writes()).toBe(1);
});
