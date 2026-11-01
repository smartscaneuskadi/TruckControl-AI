import { describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import {
  createResendHandler,
  safeResendRawUrl,
} from "../../../supabase/functions/company-mail-resend/handler.ts";
import {
  fictitiousEmail,
  MAX_MAIL_BYTES,
} from "../../../supabase/functions/_shared/mail.ts";
import type { MailGateway } from "../../../supabase/functions/company-mail/handler.ts";
import { MailActionError } from "../../../supabase/functions/company-mail/handler.ts";
import {
  validResendWebhookSecret,
  resendReady,
} from "../../../supabase/functions/_shared/resend-runtime.ts";
const emailId = "c3000000-0000-4000-8000-000000000001",
  org = "c3000000-0000-4000-8000-000000000002",
  user = "c3000000-0000-4000-8000-000000000003",
  lease = "c3000000-0000-4000-8000-000000000004";
const to = "A".repeat(43) + "@invoice-test.resend.app";
const config = {
  enabled: true,
  apiKey: "re_" + "test".repeat(10),
  webhookSecret: "whsec_" + btoa("s".repeat(32)),
  domain: "invoice-test.resend.app",
  signingKey: "fictitious-hmac-" + "x".repeat(40),
};
function signed(
  data: object = {
    type: "email.received",
    data: { email_id: emailId, to: [to] },
  },
  options: { date?: Date; bodySuffix?: string; origin?: string } = {},
) {
  const body = JSON.stringify(data),
    date = options.date ?? new Date(),
    id = "msg_fictitious_receiving";
  return new Request("https://app.example/company-mail-resend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
      "svix-signature": new Webhook(config.webhookSecret).sign(id, date, body),
      ...(options.origin ? { Origin: options.origin } : {}),
    },
    body: body + (options.bodySuffix ?? ""),
  });
}
function setup(
  options: {
    unknown?: boolean;
    databaseUnavailable?: boolean;
    url?: string;
    responseTo?: string[];
    responseId?: string;
    large?: boolean;
    duplicate?: boolean;
  } = {},
) {
  const calls: Record<string, unknown>[] = [];
  const gateway: MailGateway = {
    authenticate: async () => null,
    access: async () => ({
      active: true,
      can_write: true,
      can_manage: true,
      features: { gmail: true },
    }),
    server: async <T>(
      action: string,
      data: Record<string, unknown>,
    ): Promise<T> => {
      calls.push({ action, ...data });
      if (action === "delivery_check") {
        if (options.unknown)
          throw new MailActionError("company_access_denied", 403, true);
        if (options.databaseUnavailable) throw Error("Database unavailable");
        return true as T;
      }
      if (action === "delivery_begin")
        return (
          options.duplicate
            ? { state: "complete", imported: 1 }
            : {
                state: "ready",
                organization_id: org,
                user_id: user,
                lease_token: lease,
              }
        ) as T;
      if (action === "exists") return false as T;
      if (action === "record_invoice") return { id: crypto.randomUUID() } as T;
      return {} as T;
    },
    upload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const transport = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).startsWith("https://api.resend.com/"))
        return Response.json({
          id: options.responseId ?? emailId,
          to: options.responseTo ?? [to],
          raw: {
            download_url:
              options.url ??
              "https://sample.cloudfront.net/receiving/raw/" + emailId,
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        });
      return new Response(
        (options.large
          ? new Uint8Array(MAX_MAIL_BYTES + 1)
          : fictitiousEmail()) as BodyInit,
      );
    },
  );
  return {
    handler: createResendHandler(gateway, config, transport as typeof fetch),
    gateway,
    transport,
    calls,
  };
}
describe("receptor nativo Resend: firma, destinatario y original privado", () => {
  it("admite el CDN exacto observado en la API autenticada de Resend", async () => {
    const s = setup({
      url: "https://cdn.resend.app/receiving/raw/opaque-id?token=fictitious",
    });
    expect((await s.handler(signed())).status).toBe(200);
    const download = s.transport.mock.calls.find(([url]) =>
      String(url).startsWith("https://cdn.resend.app/"),
    );
    expect(download?.[1]?.redirect).toBe("error");
    expect(download?.[1]?.headers).toBeUndefined();
  });
  it("no confunde el CDN oficial con subdominios de clientes o dominios parecidos", () => {
    for (const url of [
      "https://tenant.resend.app/receiving/raw/file",
      "https://cdn.resend.app.evil.invalid/receiving/raw/file",
      "https://cdn.resend.app@evil.invalid/receiving/raw/file",
      "http://cdn.resend.app/receiving/raw/file",
      "https://cdn.resend.app/private/file",
    ])
      expect(safeResendRawUrl(url)).toBeNull();
  });
  it("admite la clave real de 24 bytes y verifica su firma con el SDK oficial", async () => {
    const key = "whsec_" + btoa("s".repeat(24));
    expect(validResendWebhookSecret(key)).toBe(true);
    expect(resendReady({ ...config, webhookSecret: key })).toBe(true);
    const body = JSON.stringify({ type: "unsupported" }),
      id = "msg_short_secret",
      date = new Date();
    const request = new Request("https://app.example/company-mail-resend", {
      method: "POST",
      body,
      headers: {
        "svix-id": id,
        "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
        "svix-signature": new Webhook(key).sign(id, date, body),
      },
    });
    const s = setup();
    const handler = createResendHandler(
      s.gateway,
      { ...config, webhookSecret: key },
      s.transport as typeof fetch,
    );
    expect((await handler(request)).status).toBe(200);
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("rechaza firmas demasiado cortas, mal codificadas o con exceso de tamaño", () => {
    for (const key of [
      "pending",
      "whsec_" + btoa("x".repeat(23)),
      "whsec_" + btoa("x".repeat(65)),
      "whsec_" + "A".repeat(32) + "!",
      "whsec_" + "A".repeat(33),
    ])
      expect(validResendWebhookSecret(key)).toBe(false);
    expect(validResendWebhookSecret(config.webhookSecret)).toBe(true);
  });
  it("el receptor sin configuración queda cerrado y no consulta al proveedor", async () => {
    const s = setup();
    const handler = createResendHandler(
      s.gateway,
      { ...config, enabled: false },
      s.transport as typeof fetch,
    );
    expect((await handler(signed())).status).toBe(503);
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("rechaza navegadores y métodos ajenos antes de leer el correo", async () => {
    const s = setup();
    expect(
      (
        await s.handler(
          signed(undefined, { origin: "https://truckcontrolai.com" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await s.handler(new Request("https://app.example/company-mail-resend")))
        .status,
    ).toBe(405);
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("una firma alterada o caducada no ejecuta ninguna consulta ni descarga", async () => {
    const s = setup();
    expect(
      (await s.handler(signed(undefined, { bodySuffix: " " }))).status,
    ).toBe(401);
    expect(
      (
        await s.handler(
          signed(undefined, { date: new Date(Date.now() - 600000) }),
        )
      ).status,
    ).toBe(401);
    expect(s.transport).not.toHaveBeenCalled();
    expect(s.calls).toHaveLength(0);
  });
  it("la firma oficial verificada importa el PDF en la empresa del destinatario sin registrar gastos", async () => {
    const s = setup();
    const response = await s.handler(signed());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 1,
      ai_used: false,
    });
    expect(s.gateway.upload).toHaveBeenCalledTimes(1);
    expect(s.gateway.upload).toHaveBeenCalledWith(
      expect.stringContaining(org + "/"),
      expect.any(Uint8Array),
      "application/pdf",
    );
    const record = s.calls.find((c) => c.action === "record_invoice")!;
    expect(record).toMatchObject({
      organization_id: org,
      user_id: user,
      import_source: "forwarded_email",
      total_cents: null,
    });
    expect(s.calls.some((c) => String(c.action).includes("approve"))).toBe(
      false,
    );
    const apiInit = s.transport.mock.calls[0][1] as RequestInit;
    expect(apiInit.headers).toMatchObject({
      Authorization: "Bearer " + config.apiKey,
    });
    const rawInit = s.transport.mock.calls[1][1] as RequestInit;
    expect(rawInit.headers).toBeUndefined();
    expect(rawInit.redirect).toBe("error");
  });
  it("un destinatario no emitido no provoca descargas", async () => {
    const s = setup({ unknown: true });
    expect(await (await s.handler(signed())).json()).toEqual({ ignored: true });
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("un fallo temporal de permisos se devuelve para reintento, sin perder el correo ni descargarlo", async () => {
    const s = setup({ databaseUnavailable: true });
    expect((await s.handler(signed())).status).toBe(503);
    expect(s.transport).not.toHaveBeenCalled();
    expect(s.gateway.upload).not.toHaveBeenCalled();
  });
  it("no mezcla dos destinatarios de empresas en un solo evento", async () => {
    const s = setup();
    const response = await s.handler(
      signed({
        type: "email.received",
        data: {
          email_id: emailId,
          to: [to, "b".repeat(43) + "@" + config.domain],
        },
      }),
    );
    expect(await response.json()).toEqual({ ignored: true });
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("comprueba que el original del proveedor corresponde al correo y destinatario firmados", async () => {
    for (const options of [
      { responseTo: ["b".repeat(43) + "@" + config.domain] },
      { responseId: crypto.randomUUID() },
    ]) {
      const s = setup(options);
      expect((await s.handler(signed())).status).toBe(502);
      expect(s.transport).toHaveBeenCalledTimes(1);
      expect(s.gateway.upload).not.toHaveBeenCalled();
    }
  });
  it("solo descarga originales HTTPS del CDN del proveedor y nunca sigue redirecciones", async () => {
    for (const url of [
      "http://sample.cloudfront.net/receiving/raw/a",
      "https://127.0.0.1/receiving/raw/a",
      "https://sample.cloudfront.net.evil.example/receiving/raw/a",
      "https://user:pass@sample.cloudfront.net/receiving/raw/a",
      "https://sample.cloudfront.net/unrelated/a",
    ]) {
      expect(safeResendRawUrl(url)).toBeNull();
      const s = setup({ url });
      expect((await s.handler(signed())).status).toBe(502);
      expect(s.transport).toHaveBeenCalledTimes(1);
    }
  });
  it("limita los bytes reales aunque el proveedor no declare Content-Length", async () => {
    const s = setup({ large: true });
    expect((await s.handler(signed())).status).toBe(413);
    expect(s.gateway.upload).not.toHaveBeenCalled();
  });
  it("una repetición completada no guarda ni analiza otra vez la factura", async () => {
    const s = setup({ duplicate: true });
    const response = await s.handler(signed());
    expect(await response.json()).toMatchObject({
      duplicate: true,
      imported: 1,
    });
    expect(s.gateway.upload).not.toHaveBeenCalled();
  });
});
