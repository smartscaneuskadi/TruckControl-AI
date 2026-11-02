import { describe, expect, it, vi } from "vitest";
import {
  createGmailMailbox,
  encodeMail,
  htmlMailAsText,
  MailError,
  mailAddress,
  readMail,
  validateMailDraft,
} from "./gmail";
import {
  base64url,
  fromBase64,
} from "../../../supabase/functions/_shared/invoice";
import { grantedMailToken, publicGoogleClientId } from "./google-auth";
const uuid = "a1200000-0000-4000-8000-000000000001";
const draft = {
  to: "customer@example.invalid",
  cc: "",
  subject: "Ruta 🚛 · revisión",
  text: "Hola:\nPrueba ficticia.",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const msg = (id = "abc001") => ({
  id,
  threadId: "thread001",
  labelIds: ["INBOX", "UNREAD"],
  snippet: "Texto",
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: "sender@example.invalid" },
      { name: "To", value: "customer@example.invalid" },
      { name: "Subject", value: "Prueba" },
      { name: "Date", value: "Mon, 02 Nov 2026 08:00:00 +0100" },
    ],
    body: { data: base64url(new TextEncoder().encode("Mensaje ficticio")) },
  },
});
describe("correo personal directo y aislado", () => {
  it("una sesión cerrada impide nuevas consultas aunque se conserve una referencia antigua", async () => {
    const controller = new AbortController(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ emailAddress: "owner@example.invalid" }));
    const mailbox = createGmailMailbox("synthetic", fetcher, controller.signal);
    expect(await mailbox.profile()).toBe("owner@example.invalid");
    controller.abort();
    await expect(mailbox.list("inbox", "")).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(mailbox.read("abc001")).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("solo acepta el identificador público del proyecto autorizado", () => {
    expect(
      publicGoogleClientId("468881730124-demo.apps.googleusercontent.com"),
    ).toBe(true);
    expect(publicGoogleClientId("123-other.apps.googleusercontent.com")).toBe(
      false,
    );
    expect(publicGoogleClientId("secret-private-value")).toBe(false);
  });
  it("exige el permiso de gestión, Bearer válido y caducidad finita", () => {
    const response = {
      access_token: "synthetic-browser-token",
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.modify",
      expires_in: 3600,
    };
    expect(grantedMailToken(response, 1000).expiresAt).toBe(3586000);
    for (const invalid of [
      { scope: "https://www.googleapis.com/auth/gmail.readonly" },
      { token_type: "Basic" },
      { expires_in: 0 },
      { expires_in: Infinity },
      { access_token: "unsafe\r\ntoken" },
      { error: "denied" },
    ])
      expect(() => grantedMailToken({ ...response, ...invalid })).toThrow();
  });
  it("codifica Unicode y cuerpo MIME sin interpolar cabeceras", () => {
    const raw = new TextDecoder().decode(
      fromBase64(encodeMail("user@example.invalid", draft, uuid)),
    );
    expect(raw).toContain("Message-ID: <" + uuid + "@truckcontrolai.com>");
    const encoded = raw.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)?.[1];
    expect(new TextDecoder().decode(fromBase64(encoded!))).toBe(draft.subject);
    expect(
      new TextDecoder().decode(
        fromBase64(raw.split("\r\n\r\n")[1].replace(/\r\n/g, "")),
      ),
    ).toContain("Prueba ficticia.");
  });
  it("rechaza inyección de cabeceras y listas de destinatarios excesivas", () => {
    for (const invalid of [
      { to: "victim@example.invalid\r\nBcc: other@example.invalid" },
      { cc: "bad" },
      { subject: "Asunto\nBcc: other@example.invalid" },
      { inReplyTo: "<ok>\r\nBcc: x@example.invalid" },
      { threadId: "../profile" },
      {
        to: Array.from(
          { length: 21 },
          (_, n) => `user${n}@example.invalid`,
        ).join(","),
      },
    ])
      expect(() => validateMailDraft({ ...draft, ...invalid })).toThrow(
        MailError,
      );
    expect(() =>
      encodeMail("bad\r\nFrom: other@example.invalid", draft, uuid),
    ).toThrow();
    expect(mailAddress("a@bad..invalid")).toBe(false);
  });
  it("convierte HTML a texto sin imágenes, scripts ni eventos ejecutables", () => {
    const html =
      '<head><style>hidden</style></head><script>bad()</script><p>Factura &amp; ruta</p><img src="https://tracker.invalid/pixel" onerror="bad()">';
    const value = htmlMailAsText(html);
    expect(value).toBe("Factura & ruta");
    expect(value).not.toMatch(/tracker|bad\(|<img|<script/);
  });
  it("prefiere texto MIME y admite identificadores largos de adjuntos", () => {
    const value = readMail({
      ...msg(),
      payload: {
        mimeType: "multipart/mixed",
        headers: msg().payload.headers,
        parts: [
          {
            mimeType: "text/plain",
            body: {
              data: base64url(new TextEncoder().encode("Texto original")),
            },
          },
          {
            mimeType: "text/html",
            body: {
              data: base64url(
                new TextEncoder().encode("<p>Otro contenido</p>"),
              ),
            },
          },
          {
            filename: "../factura.pdf",
            mimeType: "application/pdf",
            body: { attachmentId: "a".repeat(500), size: 300 },
          },
        ],
      },
    });
    expect(value.text).toBe("Texto original");
    expect(value.htmlConverted).toBe(false);
    expect(value.attachments[0].id).toHaveLength(500);
    expect(value.attachments[0].name).not.toContain("/");
    const inline = readMail({
      ...msg(),
      labelIds: undefined,
      payload: {
        mimeType: "multipart/mixed",
        headers: msg().payload.headers,
        parts: [
          {
            filename: "small.txt",
            mimeType: "text/plain",
            body: { size: 3, data: "YWJj" },
          },
        ],
      },
    });
    expect(inline.labels).toEqual([]);
    expect(inline.attachments[0].inlineData).toBe("YWJj");
  });
  it("rechaza árboles MIME excesivos y cuerpos demasiado grandes", () => {
    let payload: Record<string, unknown> = {
      mimeType: "text/plain",
      body: { data: "YQ" },
    };
    for (let n = 0; n < 14; n++) payload = { parts: [payload] };
    expect(() => readMail({ ...msg(), payload })).toThrow();
    expect(() =>
      readMail({
        ...msg(),
        payload: {
          mimeType: "text/plain",
          body: { data: "YQ".repeat(400000) },
        },
      }),
    ).toThrow();
  });
  it("usa solo users/me en Google, sin cookies, redirecciones ni caché", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ emailAddress: "owner@example.invalid" }));
    expect(await createGmailMailbox("synthetic-token", fetcher).profile()).toBe(
      "owner@example.invalid",
    );
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/profile");
    expect(options).toMatchObject({
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { Authorization: "Bearer synthetic-token" },
    });
    expect(JSON.stringify(options)).not.toContain("sb_publishable");
  });
  it("pagina en grupos acotados y valida los identificadores antes de leer", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/messages"))
        return json({
          messages: [{ id: "abc001" }, { id: "abc002" }],
          nextPageToken: "next-page",
        });
      return json(msg(parsed.pathname.split("/").at(-1)));
    });
    const mailbox = createGmailMailbox("synthetic", fetcher),
      result = await mailbox.list("inbox", "from:sender@example.invalid");
    expect(result.messages).toHaveLength(2);
    expect(result.next).toBe("next-page");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("maxResults")).toBe("20");
    expect(url.searchParams.get("labelIds")).toBe("INBOX");
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(mailbox.read("../profile")).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(
      mailbox.list("__proto__" as never, "", undefined),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("no presenta como completa una página de metadatos parcialmente fallida", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).includes("messages?")
          ? json({ messages: [{ id: "abc001" }, { id: "abc002" }] })
          : String(url).includes("abc001")
            ? json(msg())
            : json({ error: "denied" }, 403),
      );
    await expect(
      createGmailMailbox("synthetic", fetcher).list("inbox", ""),
    ).rejects.toMatchObject({ code: "denied" });
  });
  it("leer un mensaje no modifica sus etiquetas", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(msg()));
    const value = await createGmailMailbox("synthetic", fetcher).read("abc001");
    expect(value.text).toBe("Mensaje ficticio");
    expect(value.labels).toContain("UNREAD");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.method).toBeUndefined();
  });
  it("cambios explícitos reversibles sin endpoint de borrado definitivo", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({ id: "abc001" }));
    const mailbox = createGmailMailbox("synthetic", fetcher);
    await mailbox.change("abc001", "archive");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      removeLabelIds: ["INBOX"],
    });
    await mailbox.change("abc001", "trash");
    await mailbox.change("abc001", "restore");
    expect(fetcher.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining("/modify"),
      expect.stringContaining("/trash"),
      expect.stringContaining("/untrash"),
    ]);
    await expect(
      mailbox.change("abc001", "delete" as never),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("sesión retirada se distingue de permiso denegado sin devolver errores del proveedor", async () => {
    for (const [status, code] of [
      [401, "expired"],
      [403, "denied"],
    ] as const) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ error: "private-provider-detail" }, status));
      await expect(
        createGmailMailbox("synthetic", fetcher).profile(),
      ).rejects.toMatchObject({ code, message: code });
    }
  });
  it("respuesta HTTP grande se detiene antes de parsear datos", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        headers: { "content-length": String(16 * 1024 * 1024) },
      }),
    );
    await expect(
      createGmailMailbox("synthetic", fetcher).profile(),
    ).rejects.toMatchObject({ code: "too_large" });
  });
  it("descarga adjuntos acotados sin enviar datos al backend de TruckControl", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ data: base64url(new TextEncoder().encode("ficticio")) }),
      );
    const mailbox = createGmailMailbox("synthetic", fetcher);
    expect(
      new TextDecoder().decode(
        await mailbox.attachment("abc001", "a".repeat(500)),
      ),
    ).toBe("ficticio");
    await expect(
      mailbox.attachment("abc001", "../unsafe"),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("un envío incierto solo hace una llamada y nunca se reintenta automáticamente", async () => {
    for (const outcome of [
      () => Promise.reject(new Error("network private detail")),
      () => Promise.resolve(json({ error: "temporary" }, 503)),
      () => Promise.resolve(json({})),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(outcome);
      await expect(
        createGmailMailbox("synthetic", fetcher).send(
          "owner@example.invalid",
          draft,
          uuid,
        ),
      ).rejects.toMatchObject({ code: "send_uncertain" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("el envío confirmado usa el buzón del usuario y la referencia de respuesta", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: "sent001" }));
    await createGmailMailbox("synthetic", fetcher).send(
      "owner@example.invalid",
      {
        ...draft,
        threadId: "thread001",
        inReplyTo: "<original@example.invalid>",
      },
      uuid,
    );
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.threadId).toBe("thread001");
    const raw = new TextDecoder().decode(fromBase64(body.raw));
    expect(raw).toContain("From: owner@example.invalid");
    expect(raw).toContain("In-Reply-To: <original@example.invalid>");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
  });
});
