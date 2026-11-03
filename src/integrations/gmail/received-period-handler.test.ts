import { describe, expect, it, vi } from "vitest";
import { createGmailHandler } from "../../../supabase/functions/company-gmail/handler.ts";
import type {
  GmailConfig,
  GmailGateway,
} from "../../../supabase/functions/company-gmail/handler.ts";
import {
  mailPeriodPolicy,
  resolveMailPeriod,
  savePeriodCursor,
} from "../../../supabase/functions/_shared/mail-period.ts";
import { base64, seal } from "../../../supabase/functions/_shared/invoice.ts";

const orgA = "20000000-0000-4000-8000-000000000021",
  orgB = "20000000-0000-4000-8000-000000000022";
const userA = "10000000-0000-4000-8000-000000000021",
  userB = "10000000-0000-4000-8000-000000000022";
const encryptionKey = base64(new Uint8Array(32).fill(9)); // Synthetic test bytes only.
const receivedNow = Date.parse("2026-11-03T12:00:00Z");
const config: GmailConfig = {
  enforceReceivedPeriod: true,
  now: () => receivedNow,
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
        internalDate: String(receivedNow - 86400000),
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

describe("el período se aplica antes del contenido y de cualquier consumo IA", () => {
  it("anuncia el contrato solo cuando el filtro está activado", async () => {
    const f = fake();
    const response = await createGmailHandler(
      f.gateway,
      config,
      f.fetcher,
    )(post("status"));
    expect(await response.json()).toEqual({
      oauth_ready: true,
      ai_enabled: false,
      received_period_policy: mailPeriodPolicy,
    });
    const previous = createGmailHandler(
      f.gateway,
      { ...config, enforceReceivedPeriod: false },
      f.fetcher,
    );
    expect((await previous(post("sync_period"))).status).toBe(400);
    const unsupported = await previous(
      post("sync", orgA, {
        received_period: { from: "2026-10-01", to: "2026-10-31" },
      }),
    );
    expect(unsupported.status).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("los clientes antiguos también reciben el límite de producción y no pueden apagarlo", async () => {
    const f = fake();
    const handler = createGmailHandler(f.gateway, config, f.fetcher);
    const denied = await handler(
      post("sync", orgA, {
        enforceReceivedPeriod: false,
        received_period: { from: "2010-01-01", to: "2026-11-03" },
      }),
    );
    expect(denied.status).toBe(400);
    expect(f.calls).toHaveLength(0);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  async function connected() {
    const f = fake();
    f.setCredentials({
      organization_id: orgA,
      user_id: userA,
      google_subject: "test-google-sub",
      refresh_token_cipher: await seal(
        "synthetic-refresh",
        encryptionKey,
        `${orgA}:${userA}:test-google-sub`,
      ),
    });
    return f;
  }
  it.each([
    null,
    {},
    { from: "2025-11-03", to: "2026-11-03" },
    { from: "2026-11-04", to: "2026-11-04" },
    { from: "2026-11-03", to: "2026-10-01" },
  ])(
    "rechaza %j sin reservar, descifrar ni consultar Google",
    async (received_period) => {
      const f = fake(),
        handler = createGmailHandler(f.gateway, config, f.fetcher);
      expect(
        (await handler(post("sync_period", orgA, { received_period }))).status,
      ).toBe(400);
      expect(f.calls).toHaveLength(0);
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([
    undefined,
    "not-a-date",
    String(receivedNow + 1),
    String(Date.parse("2026-09-01T12:00:00Z")),
  ])(
    "descarta la recepción %s antes de descargar el mensaje o adjunto",
    async (stamp) => {
      const f = await connected(),
        resolveAI = vi.fn(async () => undefined);
      const fetcher = vi.fn<typeof fetch>(async (input, options) => {
        if (String(input).includes("format=metadata"))
          return Response.json({ internalDate: stamp });
        return f.fetcher(input, options);
      });
      const result = await createGmailHandler(
        f.gateway,
        { ...config, resolveAI },
        fetcher,
      )(post("sync_period"));
      expect(await result.json()).toMatchObject({ imported: 0, skipped: 1 });
      expect(
        fetcher.mock.calls.some(([u]) =>
          /format=full|\/attachments\//.test(String(u)),
        ),
      ).toBe(false);
      expect(f.upload).not.toHaveBeenCalled();
      expect(resolveAI).not.toHaveBeenCalled();
      expect(
        f.calls.some(
          (c) => c.action === "reserve_ai" || c.action === "record_invoice",
        ),
      ).toBe(false);
    },
  );
  it("un cursor de otro período se descarta antes de consultar Google", async () => {
    const f = await connected();
    f.setCredentials({
      organization_id: orgA,
      user_id: userA,
      google_subject: "test-google-sub",
      refresh_token_cipher: await seal(
        "synthetic-refresh",
        encryptionKey,
        `${orgA}:${userA}:test-google-sub`,
      ),
      page_token: savePeriodCursor(
        "previous-period",
        resolveMailPeriod(
          { from: "2025-11-04", to: "2026-11-03" },
          receivedNow,
        ),
      ),
    });
    expect(
      await (
        await createGmailHandler(
          f.gateway,
          config,
          f.fetcher,
        )(post("sync_period"))
      ).json(),
    ).toMatchObject({ imported: 1 });
    const lists = f.fetcher.mock.calls.filter(([url]) =>
      String(url).includes("/messages?"),
    );
    expect(lists.length).toBeGreaterThan(0);
    expect(
      lists.every(
        ([url]) => !new URL(String(url)).searchParams.has("pageToken"),
      ),
    ).toBe(true);
  });
  it("continúa el mismo período y recupera su cursor caducado sin cambiar el filtro", async () => {
    const f = await connected(),
      period = resolveMailPeriod(undefined, receivedNow);
    f.setCredentials({
      organization_id: orgA,
      user_id: userA,
      google_subject: "test-google-sub",
      refresh_token_cipher: await seal(
        "synthetic-refresh",
        encryptionKey,
        `${orgA}:${userA}:test-google-sub`,
      ),
      page_token: savePeriodCursor("expired-period-page", period),
    });
    const fetcher = vi.fn<typeof fetch>(async (input, options) =>
      String(input).includes("pageToken=expired-period-page")
        ? Response.json({ error: "expired" }, { status: 400 })
        : f.fetcher(input, options),
    );
    expect(
      await (
        await createGmailHandler(
          f.gateway,
          config,
          fetcher,
        )(post("sync_period"))
      ).json(),
    ).toMatchObject({ imported: 1 });
    const lists = fetcher.mock.calls.filter(([url]) =>
      String(url).includes("/messages?"),
    );
    expect(lists).toHaveLength(2);
    expect(new URL(String(lists[0][0])).searchParams.get("pageToken")).toBe(
      "expired-period-page",
    );
    expect(
      lists.every(
        ([url]) => new URL(String(url)).searchParams.get("q") === period.query,
      ),
    ).toBe(true);
    expect(new URL(String(lists[1][0])).searchParams.has("pageToken")).toBe(
      false,
    );
  });
  it("acepta una factura recibida hace meses solo al ampliar el período", async () => {
    const f = await connected();
    const fetcher = vi.fn<typeof fetch>(async (input, options) => {
      const response = await f.fetcher(input, options);
      if (String(input).includes("/messages/test-message?"))
        return Response.json({
          ...(await response.json()),
          internalDate: String(Date.parse("2026-02-15T12:00:00Z")),
        });
      return response;
    });
    const handler = createGmailHandler(f.gateway, config, fetcher);
    expect(await (await handler(post("sync_period"))).json()).toMatchObject({
      imported: 0,
    });
    const received_period = { from: "2026-02-01", to: "2026-02-28" };
    expect(
      await (
        await handler(post("sync_period", orgA, { received_period }))
      ).json(),
    ).toMatchObject({ imported: 1, received_period });
    const queries = fetcher.mock.calls
      .filter(([u]) => String(u).includes("/messages?"))
      .map(([u]) => new URL(String(u)).searchParams.get("q"));
    expect(queries[0]).not.toBe(queries[1]);
    expect(f.records).toHaveLength(1);
  });
  it("no usa la cabecera Date ni descarga enviados aunque Google los devuelva", async () => {
    const f = await connected();
    const fetcher = vi.fn<typeof fetch>(async (input, options) =>
      String(input).includes("format=metadata")
        ? Response.json({
            internalDate: String(receivedNow - 1000),
            labelIds: ["SENT"],
            payload: { headers: [{ name: "Date", value: "today" }] },
          })
        : f.fetcher(input, options),
    );
    expect(
      await (
        await createGmailHandler(
          f.gateway,
          config,
          fetcher,
        )(post("sync_period"))
      ).json(),
    ).toMatchObject({ imported: 0 });
    expect(
      fetcher.mock.calls.some(([u]) => String(u).includes("format=full")),
    ).toBe(false);
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("revalida la recepción del mensaje completo antes de leer adjuntos", async () => {
    const f = await connected();
    const fetcher = vi.fn<typeof fetch>(async (input, options) =>
      String(input).includes("format=full")
        ? Response.json({
            internalDate: "0",
            payload: {
              parts: [
                {
                  filename: "Factura.pdf",
                  body: { size: 20, attachmentId: "x" },
                },
              ],
            },
          })
        : f.fetcher(input, options),
    );
    expect(
      await (
        await createGmailHandler(
          f.gateway,
          config,
          fetcher,
        )(post("sync_period"))
      ).json(),
    ).toMatchObject({ imported: 0 });
    expect(
      fetcher.mock.calls.some(([u]) => String(u).includes("/attachments/")),
    ).toBe(false);
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("el alias nuevo mantiene los permisos anteriores y el aislamiento de empresa", async () => {
    const f = fake(),
      actionAllowed = vi.fn(async () => false);
    const handler = createGmailHandler(
      { ...f.gateway, actionAllowed },
      config,
      f.fetcher,
    );
    expect((await handler(post("sync_period", orgB))).status).toBe(403);
    expect((await handler(post("sync_period"))).status).toBe(403);
    expect(actionAllowed).toHaveBeenCalledWith(orgA, userA, "sync");
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
  });
});
