import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailGateway } from "../supabase/functions/company-mail/gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMailHandler,
  MailActionError,
} from "../supabase/functions/company-mail/handler";
import type {
  MailAccess,
  MailGateway,
} from "../supabase/functions/company-mail/handler";
import {
  connectedMailRequest,
  connectedScope,
  encodeConnectedCursor,
  selectConnectedMailboxCursorKey,
} from "../supabase/functions/company-mail/connected-contract";
import type { ConnectedScanContext } from "../supabase/functions/company-mail/connected-contract";
import { scanConnectedGmail } from "../supabase/functions/company-mail/connected-gmail";
import { scanConnectedImap } from "../supabase/functions/company-mail/connected-imap-core";
import type { ImapInvoiceConnection } from "../supabase/functions/company-mail/connected-imap-core";
import { base64, hash } from "../supabase/functions/_shared/invoice";
import { presetReceivedPeriod } from "../supabase/functions/_shared/mail-period";

const origin = "https://truckcontrolai.com",
  org = "ed000000-0000-4000-8000-000000000001",
  user = "ed000000-0000-4000-8000-000000000002",
  now = Date.parse("2026-11-16T12:00:00.000Z"),
  key = "fictitious-connected-mail-signing-key-for-tests-only",
  mailbox = "billing@example.com",
  token = "fictitious-google-access-token-for-tests-only";
const pdf = (n = 0) =>
  new TextEncoder().encode(
    `%PDF-1.4\n% FICTITIOUS ${n} no fiscal validity\n%%EOF\n`,
  );
function body(extra: Record<string, unknown> = {}) {
  const period = presetReceivedPeriod("30d", now);
  return {
    action: "import_connected_mailbox",
    organization_id: org,
    provider: "gmail",
    email: mailbox,
    period,
    analyze: true,
    gmail_access_token: token,
    consent: {
      version: "2026-11-16",
      accepted: true,
      mailbox,
      provider: "gmail",
      period,
    },
    ...extra,
  };
}
function request(payload: unknown) {
  return new Request("https://local.test/company-mail", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Authorization: "Bearer fictitious-company-session",
    },
    body: JSON.stringify(payload),
  });
}
function fixture(partCount = 1) {
  let actor: { id: string } | null = { id: user };
  const access: MailAccess = {
    active: true,
    can_write: true,
    can_manage: false,
    features: { gmail: true, invoice_ai: true },
  };
  const records = new Set<string>();
  const gateway: MailGateway = {
    authenticate: vi.fn(async () => actor),
    access: vi.fn(async () => access),
    server: vi.fn(async <T>(action: string, data: Record<string, unknown>) => {
      if (action === "exists")
        return records.has(String(data.content_hash)) as T;
      if (action === "record_invoice") {
        if (records.has(String(data.content_hash)))
          return { duplicate: true } as T;
        records.add(String(data.content_hash));
        return { id: crypto.randomUUID(), duplicate: false } as T;
      }
      if (action === "get_inbox") return null as T;
      throw Error("Unexpected fictitious RPC action");
    }),
    upload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    aiStatus: vi.fn(async () => true),
    analyze: vi.fn(async () => true),
  };
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://gmail.googleapis.com");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer " + token,
      );
      expect(init?.redirect).toBe("error");
      if (url.pathname.endsWith("/profile"))
        return Response.json({ emailAddress: mailbox });
      if (url.pathname.endsWith("/messages"))
        return Response.json({ messages: [{ id: "m1" }] });
      if (url.searchParams.get("format") === "metadata")
        return Response.json({
          internalDate: String(now - 1000),
          labelIds: ["INBOX", "UNREAD"],
        });
      if (url.searchParams.get("format") === "full")
        return Response.json({
          internalDate: String(now - 1000),
          labelIds: ["INBOX", "UNREAD"],
          payload: {
            parts: Array.from({ length: partCount }, (_, n) => ({
              filename: `Factura-ficticia-${n}.pdf`,
              body: { size: pdf(n).length, attachmentId: "a" + n },
            })),
          },
        });
      const match = url.pathname.match(/\/attachments\/a(\d+)$/);
      if (match) return Response.json({ data: base64(pdf(Number(match[1]))) });
      throw Error("Unexpected fictitious provider path");
    },
  );
  const config = {
    origins: [origin],
    connectedMailboxCursorKey: key,
    now: () => now,
    connectedMailbox: (
      input: Parameters<typeof scanConnectedGmail>[0],
      context: ConnectedScanContext,
    ) => scanConnectedGmail(input, context, key, fetcher),
  };
  return {
    gateway,
    access,
    records,
    fetcher,
    config,
    setActor(value: { id: string } | null) {
      actor = value;
    },
    handler: createMailHandler(gateway, config),
  };
}

describe("importación desde una cuenta ya conectada", () => {
  it("una variable opcional malformada no oculta la clave válida existente y sin ninguna clave desactiva la capacidad", () => {
    expect(selectConnectedMailboxCursorKey("pending", key)).toBe(key);
    expect(
      selectConnectedMailboxCursorKey("bad key with whitespace", key),
    ).toBe(key);
    expect(
      selectConnectedMailboxCursorKey(
        "fictitious-valid-environment-signing-key-only",
        key,
      ),
    ).toBe("fictitious-valid-environment-signing-key-only");
    expect(selectConnectedMailboxCursorKey(undefined, "pending", "")).toBe("");
  });
  it("continúa después del décimo adjunto del mismo correo sin perder el sexto ni los siguientes", async () => {
    const f = fixture(12);
    const first = await f.handler(request(body()));
    expect(first.status).toBe(200);
    const firstData = await first.json();
    expect(firstData).toMatchObject({
      imported: 10,
      skipped: 0,
      failures: 0,
      ai_used: 10,
      examined: 1,
      has_more: true,
      authorization_scope: "selected_mailbox_period",
      consent_version: "2026-11-16",
      received_period: {
        ...presetReceivedPeriod("30d", now),
        time_zone: "Europe/Madrid",
      },
    });
    expect(firstData.next_cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const second = await f.handler(
      request(body({ cursor: firstData.next_cursor })),
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      imported: 2,
      skipped: 0,
      failures: 0,
      ai_used: 2,
      has_more: false,
      next_cursor: null,
    });
    expect(f.records.size).toBe(12);
    expect(f.gateway.analyze).toHaveBeenCalledTimes(12);
    expect(f.gateway.upload).toHaveBeenCalledTimes(12);
    const again = await f.handler(request(body()));
    expect(await again.json()).toMatchObject({
      imported: 0,
      skipped: 10,
      ai_used: 0,
      has_more: true,
    });
    expect(f.gateway.analyze).toHaveBeenCalledTimes(12);
    expect(f.gateway.upload).toHaveBeenCalledTimes(12);
  });
  it.each(["active", "can_write", "gmail", "invoice_ai"])(
    "niega %s antes de contactar el proveedor",
    async (flag) => {
      const f = fixture();
      if (flag === "active" || flag === "can_write") f.access[flag] = false;
      else f.access.features[flag] = false;
      const response = await f.handler(request(body()));
      expect(response.status).toBe(403);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(f.gateway.upload).not.toHaveBeenCalled();
      expect(f.gateway.analyze).not.toHaveBeenCalled();
    },
  );
  it("IA apagada impide descargar originales por esta opción", async () => {
    const f = fixture();
    vi.mocked(f.gateway.aiStatus!).mockResolvedValue(false);
    const response = await f.handler(request(body()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "invoice_ai_unavailable" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("una sesión revocada durante el perfil bloquea listado y efectos posteriores", async () => {
    const f = fixture();
    f.fetcher.mockImplementationOnce(async () => {
      f.setActor(null);
      return Response.json({ emailAddress: mailbox });
    });
    const response = await f.handler(request(body()));
    expect(response.status).toBe(401);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.gateway.upload).not.toHaveBeenCalled();
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });
  it("no cambia al actor que aparece después de autenticar la petición", async () => {
    const f = fixture();
    f.fetcher.mockImplementationOnce(async () => {
      f.setActor({ id: "ed000000-0000-4000-8000-000000000099" });
      return Response.json({ emailAddress: mailbox });
    });
    expect((await f.handler(request(body()))).status).toBe(401);
    expect(f.gateway.server).not.toHaveBeenCalled();
  });
  it("limpia solo el objeto nuevo cuando la sesión desaparece antes de iniciar record_invoice", async () => {
    const f = fixture();
    vi.mocked(f.gateway.upload).mockImplementationOnce(async () => {
      f.setActor(null);
    });
    expect((await f.handler(request(body()))).status).toBe(401);
    expect(f.gateway.upload).toHaveBeenCalledTimes(1);
    expect(f.gateway.remove).toHaveBeenCalledTimes(1);
    expect(
      vi
        .mocked(f.gateway.server)
        .mock.calls.filter(([action]) => action === "record_invoice"),
    ).toHaveLength(0);
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });
  it("conserva el original privado si la respuesta de record_invoice es incierta", async () => {
    const f = fixture();
    const original = vi.mocked(f.gateway.server).getMockImplementation()!;
    vi.mocked(f.gateway.server).mockImplementation(
      async <T>(action: string, data: Record<string, unknown>) => {
        if (action === "record_invoice")
          throw new Error("fictitious lost RPC response");
        return original<T>(action, data);
      },
    );
    const response = await f.handler(request(body()));
    expect(await response.json()).toMatchObject({
      imported: 0,
      failures: 1,
      ai_used: 0,
    });
    expect(f.gateway.remove).not.toHaveBeenCalled();
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });
  it("no borra un original registrado si se revoca el acceso antes de IA", async () => {
    const f = fixture();
    const original = vi.mocked(f.gateway.server).getMockImplementation()!;
    vi.mocked(f.gateway.server).mockImplementation(
      async <T>(action: string, data: Record<string, unknown>) => {
        const result = await original<T>(action, data);
        if (action === "record_invoice") f.setActor(null);
        return result;
      },
    );
    expect((await f.handler(request(body()))).status).toBe(401);
    expect(f.records.size).toBe(1);
    expect(f.gateway.remove).not.toHaveBeenCalled();
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });
  it("no envía tokens, direcciones ni contraseñas a los RPC de persistencia", async () => {
    const f = fixture();
    const response = await f.handler(request(body()));
    const result = await response.text();
    const stored = JSON.stringify(vi.mocked(f.gateway.server).mock.calls);
    expect(response.status).toBe(200);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(mailbox);
    expect(stored).not.toContain("gmail_access_token");
    expect(result).not.toContain(token);
    expect(result).not.toContain(mailbox);
    const recorded = vi
      .mocked(f.gateway.server)
      .mock.calls.find(([action]) => action === "record_invoice")![1];
    expect(recorded).toMatchObject({
      organization_id: org,
      user_id: user,
      import_source: "email_upload",
    });
    expect(recorded.message_id).toMatch(/^connected:v1:/);
  });
  it("cuenta análisis aplicados y conserva los originales cuando el análisis no se completa", async () => {
    const f = fixture(2);
    vi.mocked(f.gateway.analyze!)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("fictitious uncertain model timeout"));
    const response = await f.handler(request(body()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 2,
      failures: 2,
      ai_used: 0,
    });
    expect(f.records.size).toBe(2);
    expect(f.gateway.analyze).toHaveBeenCalledTimes(2);
    expect(f.gateway.remove).not.toHaveBeenCalled();
  });
  it("anuncia la capacidad solo con scanner y clave presentes y mantiene la respuesta antigua de uploads", async () => {
    const f = fixture();
    const missing = createMailHandler(f.gateway, {
      ...f.config,
      connectedMailboxCursorKey: undefined,
    });
    const status = await missing(
      request({ action: "status", organization_id: org }),
    );
    expect(await status.json()).toMatchObject({
      upload_ready: true,
      connected_mailbox_import: null,
    });
    expect((await missing(request(body()))).status).toBe(503);
    expect(f.fetcher).not.toHaveBeenCalled();
    const ready = await f.handler(
      request({ action: "status", organization_id: org }),
    );
    expect(await ready.json()).toMatchObject({
      connected_mailbox_import: {
        version: 1,
        consent_version: "2026-11-16",
        providers: ["gmail", "imap"],
        max_messages: 50,
        max_attachments: 10,
      },
    });
    const form = new FormData();
    form.set("organization_id", org);
    form.set(
      "file",
      new File([pdf()], "Factura-ficticia.pdf", { type: "application/pdf" }),
    );
    const legacy = await missing(
      new Request("https://local.test/company-mail", {
        method: "POST",
        headers: {
          Origin: origin,
          Authorization: "Bearer fictitious-company-session",
        },
        body: form,
      }),
    );
    expect(legacy.status).toBe(200);
    expect(await legacy.json()).toMatchObject({ imported: 1, ai_used: true });
    expect(vi.mocked(f.gateway.analyze!).mock.calls.at(-1)).toHaveLength(5);
  });
});

function eml(count = 1) {
  const boundary = "fictitious-connected-mail-test-boundary";
  return new TextEncoder().encode(
    [
      "From: fictitious@example.com",
      "To: billing@example.com",
      "Subject: Factura ficticia",
      "Date: Sat, 01 Jan 2000 12:00:00 +0000",
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      ...Array.from({ length: count }, (_, n) =>
        [
          `--${boundary}`,
          "Content-Type: application/pdf",
          `Content-Disposition: attachment; filename="Factura-ficticia-${n}.pdf"`,
          "Content-Transfer-Encoding: base64",
          "",
          base64(pdf(n)),
        ].join("\r\n"),
      ),
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
}
function imapInput(cursor: string | null = null) {
  const period = presetReceivedPeriod("30d", now);
  return connectedMailRequest(
    body({
      provider: "imap",
      gmail_access_token: undefined,
      cursor,
      connection: {
        email: mailbox,
        username: mailbox,
        password: "fictitious-application-password-only-for-tests",
        imapHost: "imap.example.com",
        smtpHost: "smtp.example.com",
      },
      connector_consent: { version: "2026-11-13", accepted: true },
      consent: {
        version: "2026-11-16",
        accepted: true,
        mailbox,
        provider: "imap",
        period,
      },
    }),
    now,
  );
}
function imapFixture(raw = eml(), total = 1) {
  const imported: string[] = [];
  const context: ConnectedScanContext = {
    userId: user,
    signal: new AbortController().signal,
    now: () => now,
    assertCurrent: vi.fn(async () => {}),
    importParsed: vi.fn(async (parsed) => {
      imported.push(parsed.attachments[0].contentHash);
      return { imported: 1, skipped: 0, failures: 0, ai_used: 1 };
    }),
  };
  const meta = (uid: number) => ({
    uid,
    size: raw.length,
    internalDate: new Date(now - 1000),
    flags: new Set<string>(),
  });
  const client: ImapInvoiceConnection = {
    openInbox: vi.fn(async () => ({ uidValidity: "42" })),
    search: vi.fn(async () => Array.from({ length: total }, (_, n) => n + 1)),
    metadata: vi.fn(async (uid) => meta(uid)),
    source: vi.fn(async (uid) => ({ ...meta(uid), source: raw })),
  };
  return { imported, context, client };
}
describe("IMAP: recepción real y continuación por adjuntos", () => {
  it("no usa la cabecera Date antigua para rechazar un mensaje recibido dentro del periodo", async () => {
    const f = imapFixture();
    const result = await scanConnectedImap(
      imapInput(),
      f.context,
      key,
      f.client,
    );
    expect(result).toMatchObject({
      imported: 1,
      ai_used: 1,
      examined: 1,
      has_more: false,
    });
    expect(f.client.source).toHaveBeenCalledTimes(1);
    expect(f.imported).toEqual([await hash(pdf())]);
  });
  it("retoma adjuntos once y doce del mismo UID sin el límite antiguo de cinco", async () => {
    const f = imapFixture(eml(12));
    const first = await scanConnectedImap(
      imapInput(),
      f.context,
      key,
      f.client,
    );
    expect(first).toMatchObject({ imported: 10, has_more: true });
    const second = await scanConnectedImap(
      imapInput(first.next_cursor),
      f.context,
      key,
      f.client,
    );
    expect(second).toMatchObject({
      imported: 2,
      has_more: false,
      next_cursor: null,
    });
    expect(new Set(f.imported).size).toBe(12);
  });
  it("examina como máximo50 metadata, sin descargar contenidos fuera de periodo", async () => {
    const f = imapFixture(eml(), 51);
    vi.mocked(f.client.metadata).mockImplementation(async (uid) => ({
      uid,
      size: 500,
      internalDate: new Date("2020-01-01T00:00:00.000Z"),
      flags: new Set(),
    }));
    const result = await scanConnectedImap(
      imapInput(),
      f.context,
      key,
      f.client,
    );
    expect(result).toMatchObject({
      examined: 50,
      skipped: 50,
      imported: 0,
      has_more: true,
    });
    expect(f.client.metadata).toHaveBeenCalledTimes(50);
    expect(f.client.source).not.toHaveBeenCalled();
    expect(f.context.importParsed).not.toHaveBeenCalled();
  });
  it("vuelve a comprobar INTERNALDATE después de BODY.PEEK antes de importar", async () => {
    const raw = eml(),
      f = imapFixture(raw);
    vi.mocked(f.client.source).mockResolvedValue({
      uid: 1,
      size: raw.length,
      source: raw,
      internalDate: new Date("2020-01-01T00:00:00.000Z"),
      flags: new Set(),
    });
    expect(
      await scanConnectedImap(imapInput(), f.context, key, f.client),
    ).toMatchObject({ imported: 0, skipped: 1 });
    expect(f.context.importParsed).not.toHaveBeenCalled();
  });
  it("acepta el original de correo de10MB y rechaza uno mayor antes de pedirlo", async () => {
    const raw = new Uint8Array(10 * 1024 * 1024).fill(32);
    raw.set(eml());
    const f = imapFixture(raw);
    expect(
      await scanConnectedImap(imapInput(), f.context, key, f.client),
    ).toMatchObject({ imported: 1, failures: 0 });
    const tooLarge = imapFixture();
    vi.mocked(tooLarge.client.metadata).mockResolvedValue({
      uid: 1,
      size: raw.length + 1,
      internalDate: new Date(now - 1000),
      flags: new Set(),
    });
    expect(
      await scanConnectedImap(
        imapInput(),
        tooLarge.context,
        key,
        tooLarge.client,
      ),
    ).toMatchObject({ imported: 0, skipped: 1 });
    expect(tooLarge.client.source).not.toHaveBeenCalled();
  });
  it("rechaza el cambio UIDVALIDITY antes de buscar o descargar mensajes", async () => {
    const input = imapInput(),
      f = imapFixture();
    input.cursor = await encodeConnectedCursor(
      key,
      await connectedScope(input, user),
      { validity: "41", nextUid: 1, attachment: 0 },
      now,
    );
    await expect(
      scanConnectedImap(input, f.context, key, f.client),
    ).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
    expect(f.client.search).not.toHaveBeenCalled();
    expect(f.client.source).not.toHaveBeenCalled();
  });
  it("revocación antes de contenido no se convierte en una importación vacía exitosa", async () => {
    const f = imapFixture();
    let checks = 0;
    vi.mocked(f.context.assertCurrent).mockImplementation(async () => {
      if (++checks === 4)
        throw new MailActionError("authentication_required", 401);
    });
    await expect(
      scanConnectedImap(imapInput(), f.context, key, f.client),
    ).rejects.toMatchObject({ code: "authentication_required", status: 401 });
    expect(f.client.source).not.toHaveBeenCalled();
    expect(f.context.importParsed).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
function aiGatewayFixture() {
  const rpc = vi.fn(async (name: string, data: Record<string, unknown>) => {
    if (name === "company_provider_runtime_config")
      return {
        error: null,
        data: {
          enabled: true,
          api_key: "sk-" + "fictitious-test-only-".repeat(4),
          model: "gpt-6-luna",
          monthly_budget_cents: 1000,
        },
      };
    if (name === "company_ai_budget_server")
      return {
        error: null,
        data:
          data.p_action === "reserve"
            ? { id: "ed000000-0000-4000-8000-000000000010" }
            : true,
      };
    if (name === "company_invoice_ai_apply") return { error: null, data: true };
    throw Error("Unexpected fictitious RPC");
  });
  const provider = vi.fn(async () =>
    Response.json({
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 30 },
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                supplier: "Proveedor ficticio",
                invoice_number: "FICTITIOUS-1",
                invoice_date: "2026-11-15",
                net_cents: 10000,
                tax_cents: 2100,
                total_cents: 12100,
                currency: "EUR",
              }),
            },
          ],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", provider);
  const client = { rpc } as unknown as SupabaseClient;
  return { rpc, provider, gateway: createMailGateway(client) };
}
describe("sesión vigente dentro de la lectura IA ya presupuestada", () => {
  it("revalida después de resolver configuración y antes de la llamada facturable, tras reservar", async () => {
    const f = aiGatewayFixture();
    let checks = 0;
    const guard = vi.fn(async () => {
      if (++checks === 2)
        throw new MailActionError("authentication_required", 401);
    });
    await expect(
      f.gateway.analyze!(
        org,
        user,
        "ed000000-0000-4000-8000-000000000011",
        pdf(),
        "application/pdf",
        guard,
      ),
    ).rejects.toMatchObject({ code: "authentication_required", status: 401 });
    expect(
      f.rpc.mock.calls.some(
        ([name, data]) =>
          name === "company_ai_budget_server" && data.p_action === "reserve",
      ),
    ).toBe(true);
    expect(f.provider).not.toHaveBeenCalled();
    expect(
      f.rpc.mock.calls.some(([name]) => name === "company_invoice_ai_apply"),
    ).toBe(false);
    expect(
      f.rpc.mock.calls.some(
        ([name, data]) =>
          name === "company_ai_budget_server" && data.p_action === "settle",
      ),
    ).toBe(false);
  });
  it("una revocación durante el proveedor conserva presupuesto usado y evita aplicar campos", async () => {
    const f = aiGatewayFixture();
    let allowed = true;
    const original = f.provider.getMockImplementation()!;
    f.provider.mockImplementation(async () => {
      const value = await original();
      allowed = false;
      return value;
    });
    const guard = vi.fn(async () => {
      if (!allowed) throw new MailActionError("authentication_required", 401);
    });
    await expect(
      f.gateway.analyze!(
        org,
        user,
        "ed000000-0000-4000-8000-000000000011",
        pdf(),
        "application/pdf",
        guard,
      ),
    ).rejects.toMatchObject({ code: "authentication_required" });
    expect(f.provider).toHaveBeenCalledTimes(1);
    expect(
      f.rpc.mock.calls.some(
        ([name, data]) =>
          name === "company_ai_budget_server" && data.p_action === "settle",
      ),
    ).toBe(true);
    expect(
      f.rpc.mock.calls.some(([name]) => name === "company_invoice_ai_apply"),
    ).toBe(false);
  });
  it("el camino antiguo sin callback conserva el mismo análisis y contrato", async () => {
    const f = aiGatewayFixture();
    expect(
      await f.gateway.analyze!(
        org,
        user,
        "ed000000-0000-4000-8000-000000000011",
        pdf(),
        "application/pdf",
      ),
    ).toBe(true);
    expect(f.provider).toHaveBeenCalledTimes(1);
    expect(
      f.rpc.mock.calls.some(([name]) => name === "company_invoice_ai_apply"),
    ).toBe(true);
  });
});
