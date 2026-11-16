import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import {
  connectedInvoiceCapability,
  connectedInvoiceReadiness,
  connectedInvoiceResult,
  importFromConnectedMailbox,
  validateConnectedInvoiceRequest,
} from "../src/integrations/personal-mail/invoice-import";
import type { ConnectedInvoiceImportRequest } from "../src/integrations/personal-mail/invoice-import";
import { createGmailMailbox } from "../src/integrations/personal-mail/gmail";
import { createImapMailbox } from "../src/integrations/personal-mail/imap";
import { mailPeriodPolicy } from "../supabase/functions/_shared/mail-period";

const holder = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));
vi.mock("../src/integrations/supabase/client", () => ({ getSupabaseClient: () => holder.client }));
const organization = "22000000-0000-4000-8000-000000000161";
const actor = "12000000-0000-4000-8000-000000000161";
const other = "12000000-0000-4000-8000-000000000162";
const mailbox = "mailbox@example.invalid";
const period = { from: "2026-10-18", to: "2026-11-16" };
const capability = () => ({ ai_enabled: true, connected_mailbox_import: {
  version: 1, consent_version: "2026-11-16", providers: ["gmail", "imap"],
  max_messages: 50, max_attachments: 10, received_period_policy: { ...mailPeriodPolicy },
} });
const result = () => ({ authorization_scope: "selected_mailbox_period", consent_version: "2026-11-16",
  imported: 2, skipped: 1, failures: 0, ai_used: 1, examined: 3, has_more: false,
  next_cursor: null, received_period: { ...period, time_zone: "Europe/Madrid" } });
const input = (): ConnectedInvoiceImportRequest => ({ organizationId: organization, actorId: actor,
  provider: "gmail", email: mailbox, period: { ...period },
  consent: { version: "2026-11-16", accepted: true, mailbox, provider: "gmail", period: { ...period } },
});
const session = (user = actor, sid = "synthetic-mail-sid-a", aal = "aal1"): Session => ({
  user: { id: user }, access_token: "e30." + btoa(JSON.stringify({ sub: user, session_id: sid, aal })) + ".synthetic",
  refresh_token: "synthetic-refresh-never-used", token_type: "bearer", expires_in: 3600,
}) as Session;
function setup() {
  let current: Session | null = session();
  const listeners = new Set<(event: AuthChangeEvent, value: Session | null) => void>();
  const getSession = vi.fn(async () => ({ data: { session: current }, error: null }));
  holder.client = { auth: { getSession, onAuthStateChange(callback: (event: AuthChangeEvent, value: Session | null) => void) {
    listeners.add(callback); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
  } } } as unknown as SupabaseClient<Database>;
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  let respond: (call: typeof calls[number]) => Promise<Response> = async () => Response.json(result());
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (target !== "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-mail") throw Error("Unexpected network destination in synthetic test");
    const call = { url: target, init: init ?? {}, body: JSON.parse(String(init?.body)) };
    calls.push(call); return respond(call);
  }));
  return { getSession, calls, initial: current,
    setSession(value: Session | null) { current = value; for (const cb of listeners) cb(value ? "TOKEN_REFRESHED" : "SIGNED_OUT", value); },
    respond(next: typeof respond) { respond = next; },
    listenerCount: () => listeners.size,
  };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
  vi.stubEnv("VITE_SUPABASE_URL", "https://kkkemaycedexymrpaqtp.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic_connected_mail");
});
afterEach(() => { holder.client = null; vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("contrato y transporte de importación de la cuenta conectada", () => {
  it("conserva las fechas y solo acepta consentimiento de esta cuenta y empresa", () => {
    expect(validateConnectedInvoiceRequest(input())).toEqual(period);
    for (const mutation of [
      { consent: undefined }, { consent: { ...input().consent, accepted: false } },
      { consent: { ...input().consent, mailbox: "other@example.invalid" } },
      { consent: { ...input().consent, provider: "imap" } },
      { consent: { ...input().consent, version: "old" } },
      { consent: { ...input().consent, period: { from: "2026-10-01", to: period.to } } },
    ]) expect(() => validateConnectedInvoiceRequest({ ...input(), ...mutation } as ConnectedInvoiceImportRequest)).toThrow("consent_required");
  });
  it.each([
    { from: "2025-11-15", to: "2026-11-16" },
    { from: "2026-11-01", to: "2026-11-17" },
    { from: "2026-11-16", to: "2026-11-01" },
    { from: "", to: "2026-11-16" },
  ])("rechaza un período inválido antes de autenticar o enviar credenciales %j", async (bad) => {
    const f = setup(); const request = input(); request.period = bad; request.consent.period = bad;
    await expect(importFromConnectedMailbox(request, { gmail_access_token: "synthetic-google-access" }, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_period" });
    expect(f.getSession).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it.each([
    { connected_mailbox_import: null, ai_enabled: true },
    { ...capability(), connected_mailbox_import: { ...capability().connected_mailbox_import, version: 0 } },
    { ...capability(), connected_mailbox_import: { ...capability().connected_mailbox_import, consent_version: "old" } },
    { ...capability(), connected_mailbox_import: { ...capability().connected_mailbox_import, max_attachments: 100 } },
    { ...capability(), connected_mailbox_import: { ...capability().connected_mailbox_import, received_period_policy: { ...mailPeriodPolicy, max_months: 120 } } },
  ])("un backend sin el contrato exacto no habilita importación %j", (bad) => {
    expect(connectedInvoiceCapability(bad)).toBe(false);
    expect(connectedInvoiceCapability(capability())).toBe(true);
  });
  it.each([
    { ...result(), consent_version: "old" },
    { ...result(), imported: 11 }, { ...result(), ai_used: true },
    { ...result(), imported: 0, ai_used: 1 },
    { ...result(), examined: 51 }, { ...result(), next_cursor: "unexpected" },
    { ...result(), received_period: { ...period, to: "2026-11-17", time_zone: "Europe/Madrid" } },
  ])("una respuesta fuera del alcance nunca aparenta éxito %j", (bad) => {
    expect(() => connectedInvoiceResult(bad, period)).toThrow("uncertain");
  });
  it("una consulta de estado no envía ningún permiso del buzón", async () => {
    const f = setup(); f.respond(async () => Response.json(capability()));
    await expect(connectedInvoiceReadiness(organization, actor, new AbortController().signal)).resolves.toEqual({ ready: true, aiEnabled: true });
    expect(f.calls[0].body).toEqual({ action: "status", organization_id: organization });
    expect(f.listenerCount()).toBe(0);
  });
  it("usa el SDK real y un token TruckControl capturado, sin cookies ni redirecciones", async () => {
    const f = setup(); const stop = new AbortController();
    const gmail = createGmailMailbox("synthetic-google-access", fetch, stop.signal);
    await expect(gmail.importInvoices!(input())).resolves.toMatchObject({ imported: 2, ai_used: 1 });
    expect(f.calls).toHaveLength(1); const call = f.calls[0];
    expect(new Headers(call.init.headers).get("Authorization")).toBe("Bearer " + f.initial!.access_token);
    expect(call.init).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
    expect(call.body).toMatchObject({ action: "import_connected_mailbox", organization_id: organization, provider: "gmail", email: mailbox,
      gmail_access_token: "synthetic-google-access", period, consent: input().consent, analyze: true });
    expect(call.body).not.toHaveProperty("actorId"); expect(call.body).not.toHaveProperty("client_secret");
    expect(call.body).not.toHaveProperty("connection"); expect(f.listenerCount()).toBe(0);
  });
  it("una referencia Gmail cerrada no transmite credenciales", async () => {
    const f = setup(); const stop = new AbortController();
    const gmail = createGmailMailbox("synthetic-google-access", fetch, stop.signal); stop.abort();
    await expect(gmail.importInvoices!(input())).rejects.toMatchObject({ name: "AbortError" });
    expect(f.calls).toHaveLength(0);
  });
  it("otro actor en la misma empresa no hereda el permiso de una cuenta", async () => {
    const f = setup(); f.setSession(session(other));
    await expect(importFromConnectedMailbox(input(), { gmail_access_token: "synthetic-google-access" }, new AbortController().signal)).rejects.toMatchObject({ code: "expired" });
    expect(f.calls).toHaveLength(0);
  });
  it.each([null, session(other), session(actor, "synthetic-other-sid"), session(actor, "synthetic-mail-sid-a", "aal2")])(
    "la identidad que cambia durante una petición invalida su resultado %j", async (next) => {
      const f = setup(); f.respond(async () => { f.setSession(next); return Response.json(result()); });
      await expect(importFromConnectedMailbox(input(), { gmail_access_token: "synthetic-google-access" }, new AbortController().signal)).rejects.toBeDefined();
      expect(f.calls).toHaveLength(1); expect(f.calls[0].init.signal?.aborted).toBe(true); expect(f.listenerCount()).toBe(0);
    },
  );
  it("renovar el token con el mismo SID y AAL mantiene la identidad capturada", async () => {
    const f = setup(); f.respond(async () => { f.setSession({ ...session(), access_token: f.initial!.access_token + "refreshed" }); return Response.json(result()); });
    await expect(importFromConnectedMailbox(input(), { gmail_access_token: "synthetic-google-access" }, new AbortController().signal)).resolves.toMatchObject({ imported: 2 });
    expect(new Headers(f.calls[0].init.headers).get("Authorization")).toBe("Bearer " + f.initial!.access_token);
  });
  it("un error del proveedor no muestra contenido, tokens o texto remoto", async () => {
    const f = setup(); f.respond(async () => Response.json({ error: "unknown-provider-text-synthetic", detail: "synthetic-private-value" }, { status: 502 }));
    await expect(importFromConnectedMailbox(input(), { gmail_access_token: "synthetic-google-access" }, new AbortController().signal)).rejects.toMatchObject({ message: "unavailable", code: "unavailable" });
  });
  it("el destino no autorizado se rechaza sin enviar la credencial del buzón", async () => {
    const f = setup(); vi.stubEnv("VITE_SUPABASE_URL", "https://other-project.supabase.co");
    await expect(importFromConnectedMailbox(input(), { gmail_access_token: "synthetic-google-access" }, new AbortController().signal)).rejects.toMatchObject({ code: "unavailable" });
    expect(f.calls).toEqual([]);
  });
  it("IMAP conserva la conexión seleccionada y nunca permite cambiar su empresa o proveedor", async () => {
    const f = setup(); const connection = { email: mailbox, username: mailbox, password: "synthetic-imap-password", imapHost: "imap.example.com", smtpHost: "smtp.example.com" };
    const imap = createImapMailbox(connection, organization, { version: "2026-11-13", accepted: true });
    const request = { ...input(), provider: "imap" as const, consent: { ...input().consent, provider: "imap" as const } };
    await expect(imap.importInvoices!(request)).resolves.toMatchObject({ imported: 2 });
    expect(f.calls[0].body).toMatchObject({ provider: "imap", connection, connector_consent: { version: "2026-11-13", accepted: true } });
    await expect(imap.importInvoices!({ ...request, organizationId: "22000000-0000-4000-8000-000000000162" })).rejects.toMatchObject({ code: "consent_required" });
    expect(f.calls).toHaveLength(1); imap.dispose();
    await expect(imap.importInvoices!(request)).rejects.toMatchObject({ code: "expired" });
    expect(f.calls).toHaveLength(1);
  });
  it("IMAP comprueba la duración aunque el temporizador de la pestaña esté suspendido", async () => {
    const f = setup(); const calls = vi.fn(async () => ({ messages: [], next: null }));
    const imap = createImapMailbox({ email: mailbox, username: mailbox, password: "synthetic-imap-password", imapHost: "imap.example.com", smtpHost: "smtp.example.com" }, organization, { version: "2026-11-13", accepted: true }, calls);
    vi.setSystemTime(new Date("2026-11-16T13:00:01Z"));
    await expect(imap.list("inbox", "")).rejects.toMatchObject({ code: "expired" });
    const request = { ...input(), provider: "imap" as const, consent: { ...input().consent, provider: "imap" as const } };
    await expect(imap.importInvoices!(request)).rejects.toMatchObject({ code: "expired" });
    expect(calls).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
});
