import { describe, expect, it, vi } from "vitest";
import {
  connectionConfig,
  publicMailIp,
  mailHost,
  messageRef,
  parseMessageRef,
  validateDraft,
} from "../supabase/functions/personal-mail/contract";
import { createPersonalMailHandler } from "../supabase/functions/personal-mail/handler";
import { createImapMailbox } from "../src/integrations/personal-mail/imap";
const origin = "https://truckcontrolai.com",
  org = "00000000-0000-4000-8000-000000000001";
const config = {
  email: "user@example.com",
  username: "user@example.com",
  password: "fictitious-app-password",
  imapHost: "imap.porkbun.com",
  smtpHost: "smtp.porkbun.com",
};
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.supabase.co/functions/v1/personal-mail", {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer a.b.c",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
describe("conexión personal IMAP/SMTP", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "100.64.1.2",
    "172.16.3.4",
    "192.168.1.5",
    "0.0.0.0",
    "198.18.0.1",
    "224.1.2.3",
    "::1",
    "::ffff:127.0.0.1",
  ])("bloquea direcciones privadas/reservadas %s", (ip) =>
    expect(publicMailIp(ip)).toBe(false),
  );
  it("solo admite hostnames de correo y direcciones públicas", () => {
    expect(publicMailIp("8.8.8.8")).toBe(true);
    for (const host of [
      "https://imap.porkbun.com",
      "imap.porkbun.com:993",
      "user:pass@imap.porkbun.com",
      "localhost",
      "imap.local",
      "192.168.0.1",
    ])
      expect(mailHost(host)).toBe(false);
    expect(connectionConfig(config)).toEqual(config);
  });
  it("no interpreta una URL como servidor", () =>
    expect(() =>
      connectionConfig({ ...config, imapHost: "https://webmail.porkbun.com" }),
    ).toThrow());
  it("identifica mensajes por carpeta, UIDVALIDITY y UID", () => {
    const id = messageRef("INBOX/Enviados ñ", "987", 42);
    expect(parseMessageRef(id)).toEqual({
      path: "INBOX/Enviados ñ",
      validity: "987",
      uid: 42,
    });
    expect(() => parseMessageRef(messageRef("INBOX", "987", 0))).toThrow();
  });
  it("rechaza inyección de cabeceras y destinatarios extra", () => {
    expect(() =>
      validateDraft({
        to: "a@example.com",
        cc: "",
        subject: "Hola\r\nBcc: other@example.com",
        text: "x",
      }),
    ).toThrow();
    expect(() =>
      validateDraft({
        to: "a@example.com\r\nBcc:other@example.com",
        cc: "",
        subject: "Hola",
        text: "x",
      }),
    ).toThrow();
  });
  it("rechaza sesión/cuenta no autorizada antes de tocar el servidor de correo", async () => {
    const operate = vi.fn();
    const handler = createPersonalMailHandler(
      { authorize: async () => false, operate, probe: vi.fn() },
      [origin],
    );
    const response = await handler(
      request({ organization_id: org, action: "verify", connection: config }),
    );
    expect(response.status).toBe(401);
    expect(operate).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(config.password);
  });
  it("rechaza orígenes no permitidos y no refleja errores del proveedor", async () => {
    const operate = vi
      .fn()
      .mockRejectedValue(new Error("password=" + config.password));
    const handler = createPersonalMailHandler(
      { authorize: async () => true, operate, probe: vi.fn() },
      [origin],
    );
    expect(
      (await handler(request({}, { Origin: "https://other.example" }))).status,
    ).toBe(403);
    const response = await handler(
      request({ organization_id: org, action: "verify", connection: config }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("no declara conexión sin comprobar lectura y SMTP", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({
        email: config.email,
        reading: true,
        sending: false,
      });
    const mailbox = createImapMailbox(config, org, invoke);
    await expect(mailbox.profile()).rejects.toThrow();
    mailbox.dispose();
  });
  it("no conserva credenciales ni acepta respuestas tardías tras desconectar", async () => {
    let resolve!: (value: unknown) => void;
    const invoke = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const mailbox = createImapMailbox(config, org, invoke);
    const result = mailbox.profile();
    mailbox.dispose();
    resolve({ email: config.email, reading: true, sending: true });
    await expect(result).rejects.toMatchObject({ code: "expired" });
    await expect(mailbox.list("inbox", "")).rejects.toMatchObject({
      code: "expired",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(config.password).toBe("fictitious-app-password");
  });
  it("no reintenta un envío incierto ni el mismo identificador", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("response lost"));
    const mailbox = createImapMailbox(config, org, invoke);
    const draft = {
      to: "recipient@example.com",
      cc: "",
      subject: "Ficticio",
      text: "No real email",
    };
    await expect(
      mailbox.send(config.email, draft, "00000000-0000-4000-8000-000000000002"),
    ).rejects.toMatchObject({ code: "send_uncertain" });
    await expect(
      mailbox.send(config.email, draft, "00000000-0000-4000-8000-000000000002"),
    ).rejects.toMatchObject({ code: "send_uncertain" });
    expect(invoke).toHaveBeenCalledTimes(1);
    mailbox.dispose();
  });
  it("el diagnóstico TLS no acepta destinos arbitrarios ni autentica cuentas", async () => {
    const probe = vi.fn().mockResolvedValue({ authenticated: false });
    const handler = createPersonalMailHandler(
      { authorize: async () => false, operate: vi.fn(), probe },
      [origin],
    );
    const invalid = await handler(
      new Request(
        "https://example.supabase.co/transport-check?provider=arbitrary",
        { headers: { Origin: origin } },
      ),
    );
    expect(invalid.status).toBe(400);
    expect(probe).not.toHaveBeenCalled();
  });
});
