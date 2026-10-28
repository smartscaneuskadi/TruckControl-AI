import { describe, expect, it, vi } from "vitest";
import { createGmailHandler } from "../../../supabase/functions/company-gmail/handler.ts";
import type {
  GmailConfig,
  GmailGateway,
} from "../../../supabase/functions/company-gmail/handler.ts";
import {
  base64,
  detectDocumentType,
  extractInvoice,
  hash,
  seal,
  unseal,
  validateExtraction,
} from "../../../supabase/functions/_shared/invoice.ts";

const orgA = "20000000-0000-4000-8000-000000000021",
  orgB = "20000000-0000-4000-8000-000000000022";
const userA = "10000000-0000-4000-8000-000000000021",
  userB = "10000000-0000-4000-8000-000000000022";
const encryptionKey = base64(new Uint8Array(32).fill(9)); // Synthetic test bytes only.
const config: GmailConfig = {
  appOrigin: "https://truckcontrol.example",
  callbackUrl: "https://project.example/functions/v1/company-gmail",
  oauth: {
    clientId: "test-client",
    clientSecret: "test-client-secret",
    encryptionKey,
  },
};
const post = (
  action: string,
  org = orgA,
  extra: Record<string, unknown> = {},
  token = "test-a",
  origin = config.appOrigin,
) =>
  new Request(config.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
      origin,
    },
    body: JSON.stringify({ action, organization_id: org, ...extra }),
  });
function fake() {
  const states = new Map<string, Record<string, unknown>>();
  const pending = new Map<string, Record<string, unknown>>();
  const records: Record<string, unknown>[] = [];
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  let credentials: Record<string, unknown> | null = null;
  const upload = vi.fn(async () => {}),
    remove = vi.fn(async () => {});
  const gateway: GmailGateway = {
    authenticate: async (token) =>
      token === "test-a"
        ? { id: userA }
        : token === "test-b"
          ? { id: userB }
          : null,
    owns: async (org, user) =>
      (org === orgA && user === userA) || (org === orgB && user === userB),
    upload,
    remove,
    async server<T>(action: string, data: Record<string, unknown>): Promise<T> {
      calls.push({ action, data });
      let result: unknown = {};
      if (action === "state_create") states.set(String(data.state_hash), data);
      if (action === "state_consume") {
        result = states.get(String(data.state_hash)) ?? null;
        states.delete(String(data.state_hash));
      }
      if (action === "pending_create")
        pending.set(String(data.ticket_hash), data);
      if (action === "pending_consume") {
        const stored = pending.get(String(data.ticket_hash));
        result =
          stored?.user_id === data.user_id &&
          stored?.organization_id === data.organization_id
            ? stored
            : null;
        if (result) pending.delete(String(data.ticket_hash));
      }
      if (action === "connect") credentials = data;
      if (action === "credentials") result = credentials;
      if (action === "lock_sync" || action === "reserve_ai") result = true;
      if (action === "exists")
        result = records.some(
          (r) =>
            r.organization_id === data.organization_id &&
            (r.content_hash === data.content_hash ||
              (r.message_id === data.message_id &&
                r.attachment_id === data.attachment_id)),
        );
      if (action === "record_invoice") records.push(data);
      return result as T;
    },
  };
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "test-google-access",
        refresh_token: "test-google-refresh",
        scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
      });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo")
      return Response.json({
        sub: "test-google-sub",
        email: "gmail-demo@example.com",
        email_verified: true,
      });
    if (url.endsWith("/profile"))
      return Response.json({ emailAddress: "gmail-demo@example.com" });
    if (url.includes("/attachments/"))
      return Response.json({
        data: base64(new TextEncoder().encode("%PDF-1.7\nsynthetic invoice")),
      });
    if (url.includes("/messages/test-message?"))
      return Response.json({
        payload: {
          parts: [
            {
              filename: "Factura ficticia.pdf",
              mimeType: "application/pdf",
              body: { size: 25, attachmentId: "test-attachment" },
            },
          ],
        },
      });
    if (url.includes("/messages?"))
      return Response.json({ messages: [{ id: "test-message" }] });
    throw new Error("Unexpected network call in test");
  });
  return {
    gateway,
    calls,
    records,
    upload,
    fetcher,
    setCredentials: (value: Record<string, unknown>) => {
      credentials = value;
    },
  };
}

describe("OAuth y aislamiento del Gmail por empresa", () => {
  it("rechaza sesiones falsas y empresas ajenas antes de acceder a credenciales", async () => {
    const f = fake(),
      handler = createGmailHandler(f.gateway, config, f.fetcher);
    expect((await handler(post("start", orgA, {}, "invalid"))).status).toBe(
      401,
    );
    expect((await handler(post("sync", orgB))).status).toBe(403);
    expect(f.calls).toHaveLength(0);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("rechaza orígenes distintos y no habilita Gmail ni IA por defecto", async () => {
    const f = fake(),
      handler = createGmailHandler(
        f.gateway,
        { appOrigin: config.appOrigin, callbackUrl: config.callbackUrl },
        f.fetcher,
      );
    expect(
      (
        await handler(
          post("status", orgA, {}, "test-a", "https://other.example"),
        )
      ).status,
    ).toBe(403);
    expect(await (await handler(post("status"))).json()).toEqual({
      oauth_ready: false,
      ai_enabled: false,
    });
    expect((await handler(post("sync"))).status).toBe(503);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("solicita solo lectura, usa PKCE y no devuelve secretos al navegador", async () => {
    const f = fake(),
      handler = createGmailHandler(f.gateway, config, f.fetcher);
    const response = await handler(post("start"));
    const text = await response.text();
    const url = new URL(JSON.parse(text).url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe(
      "openid email https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(text).not.toContain("test-client-secret");
    expect(text).not.toContain(encryptionKey);
    expect(f.calls[0]).toMatchObject({
      action: "state_create",
      data: { organization_id: orgA, user_id: userA },
    });
    expect(f.calls[0].data.state_hash).toBe(
      await hash(url.searchParams.get("state")!),
    );
  });
  it("rechaza callbacks sin estado válido sin intercambiar códigos de Google", async () => {
    const f = fake(),
      handler = createGmailHandler(f.gateway, config, f.fetcher);
    const response = await handler(
      new Request(
        `${config.callbackUrl}?state=${"x".repeat(43)}&code=test-code`,
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("gmail_error=expired");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("finaliza una sola vez con la misma cuenta y empresa; el callback no conecta por sí solo", async () => {
    const f = fake(),
      handler = createGmailHandler(f.gateway, config, f.fetcher);
    const auth = await (await handler(post("start"))).json();
    const state = new URL(auth.url).searchParams.get("state")!;
    const callback = await handler(
      new Request(`${config.callbackUrl}?state=${state}&code=test-code`),
    );
    const location = new URL(callback.headers.get("location")!);
    const ticket = new URLSearchParams(location.hash.split("?")[1]).get(
      "gmail_ticket",
    )!;
    expect(ticket).toHaveLength(43);
    expect(f.calls.some((c) => c.action === "connect")).toBe(false);
    expect(
      (await handler(post("complete", orgA, { ticket }, "test-b"))).status,
    ).toBe(403);
    expect(
      (await handler(post("complete", orgB, { ticket }, "test-b"))).status,
    ).toBe(403);
    expect((await handler(post("complete", orgA, { ticket }))).status).toBe(
      200,
    );
    expect((await handler(post("complete", orgA, { ticket }))).status).toBe(
      403,
    );
    const connection = f.calls.find((c) => c.action === "connect")!.data;
    expect(connection.refresh_token_cipher).not.toContain(
      "test-google-refresh",
    );
    expect(
      await unseal(
        String(connection.refresh_token_cipher),
        encryptionKey,
        `${orgA}:${userA}:test-google-sub`,
      ),
    ).toBe("test-google-refresh");
  });
  it("no reutiliza un estado de autorización ya consumido", async () => {
    const f = fake(),
      handler = createGmailHandler(f.gateway, config, f.fetcher);
    const auth = await (await handler(post("start"))).json();
    const state = new URL(auth.url).searchParams.get("state")!;
    await handler(
      new Request(`${config.callbackUrl}?state=${state}&error=access_denied`),
    );
    const again = await handler(
      new Request(`${config.callbackUrl}?state=${state}&code=test-code`),
    );
    expect(again.headers.get("location")).toContain("gmail_error=expired");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("importa un adjunto una sola vez, conserva el original y no llama a IA desactivada", async () => {
    const f = fake();
    f.setCredentials({
      organization_id: orgA,
      user_id: userA,
      google_subject: "test-google-sub",
      email: "gmail-demo@example.com",
      refresh_token_cipher: await seal(
        "test-refresh",
        encryptionKey,
        `${orgA}:${userA}:test-google-sub`,
      ),
    });
    const handler = createGmailHandler(f.gateway, config, f.fetcher);
    expect(await (await handler(post("sync"))).json()).toMatchObject({
      imported: 1,
      failures: 0,
    });
    expect(await (await handler(post("sync"))).json()).toMatchObject({
      imported: 0,
      skipped: 1,
    });
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(f.records[0]).toMatchObject({
      organization_id: orgA,
      net_cents: null,
      tax_cents: null,
      total_cents: null,
    });
    expect(
      f.fetcher.mock.calls.some(([url]) => String(url).includes("openai.com")),
    ).toBe(false);
    expect(f.calls.filter((c) => c.action === "finish_sync")).toHaveLength(2);
  });
  it("no descifra un token trasladado a otra empresa o usuario", async () => {
    const cipher = await seal(
      "test-refresh",
      encryptionKey,
      `${orgA}:${userA}:test-google-sub`,
    );
    await expect(
      unseal(cipher, encryptionKey, `${orgB}:${userA}:test-google-sub`),
    ).rejects.toThrow();
    await expect(
      unseal(cipher, encryptionKey, `${orgA}:${userB}:test-google-sub`),
    ).rejects.toThrow();
  });
  it("continúa desde la página guardada y recupera un cursor caducado", async () => {
    const f = fake();
    f.setCredentials({
      organization_id: orgA,
      user_id: userA,
      google_subject: "test-google-sub",
      email: "gmail-demo@example.com",
      page_token: "expired-cursor",
      refresh_token_cipher: await seal(
        "test-refresh",
        encryptionKey,
        `${orgA}:${userA}:test-google-sub`,
      ),
    });
    const fetcher: typeof fetch = async (input, options) =>
      String(input).includes("pageToken=expired-cursor")
        ? Response.json({ error: "expired" }, { status: 400 })
        : f.fetcher(input, options);
    const handler = createGmailHandler(f.gateway, config, fetcher);
    expect(await (await handler(post("sync"))).json()).toMatchObject({
      imported: 1,
    });
    expect(f.calls.find((c) => c.action === "finish_sync")?.data).toMatchObject(
      { succeeded: true, page_token: "" },
    );
  });
});

describe("documentos y extracción de facturas", () => {
  const example = {
    supplier: "Proveedor ficticio",
    invoice_number: "DEMO-1",
    invoice_date: "2026-10-01",
    net_cents: 10000,
    tax_cents: 2100,
    total_cents: 12100,
    currency: "EUR",
  };
  it("valida el contenido del archivo sin fiarse de la extensión", () => {
    expect(
      detectDocumentType(new TextEncoder().encode("<script>alert(1)</script>")),
    ).toBeNull();
    expect(detectDocumentType(new TextEncoder().encode("%PDF-1.7"))).toBe(
      "application/pdf",
    );
    expect(
      detectDocumentType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe("image/png");
  });
  it("rechaza importes negativos, decimales en céntimos y fechas imposibles", () => {
    expect(() => validateExtraction({ ...example, net_cents: -1 })).toThrow();
    expect(() =>
      validateExtraction({ ...example, net_cents: 100.1 }),
    ).toThrow();
    expect(() =>
      validateExtraction({ ...example, invoice_date: "2026-02-30" }),
    ).toThrow();
    expect(
      validateExtraction({ ...example, total_cents: 12300 }).review_note,
    ).toContain("no cuadran");
    expect(
      validateExtraction({ ...example, currency: "USD" }).review_note,
    ).toContain("Moneda distinta");
  });
  it("usa salida estructurada y no ejecuta instrucciones del documento", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(example) }],
          },
        ],
      }),
    );
    const result = await extractInvoice(
      new TextEncoder().encode("%PDF-1.7"),
      "application/pdf",
      { key: "synthetic-key", model: "synthetic-model" },
      fetcher,
    );
    expect(result.net_cents).toBe(10000);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(body.instructions).toContain("untrusted data");
  });
  it("rechaza respuestas IA incompletas sin dar la factura por válida", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ status: "incomplete", output: [] }),
    );
    await expect(
      extractInvoice(
        new Uint8Array([1]),
        "image/jpeg",
        { key: "synthetic-key", model: "synthetic-model" },
        fetcher,
      ),
    ).rejects.toThrow("Incomplete");
  });
});
