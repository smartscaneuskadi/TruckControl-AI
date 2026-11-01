import { describe, expect, it, vi } from "vitest";
import { base64 } from "../../../supabase/functions/_shared/invoice.ts";
import { fictitiousEmail } from "../../../supabase/functions/_shared/mail.ts";
import {
  createMailHandler,
  MailActionError,
  readLimited,
  verifyMailSignature,
} from "../../../supabase/functions/company-mail/handler.ts";
import type {
  MailConfig,
  MailGateway,
} from "../../../supabase/functions/company-mail/handler.ts";
const org = "41000000-0000-4000-8000-000000000001",
  user = "41000000-0000-4000-8000-000000000002";
const token = "41000000-0000-4000-8000-000000000003";
const origin = "https://truckcontrolai.com",
  now = Date.parse("2026-11-01T12:00:00Z");
const key = "synthetic-only-mail-signing-key-000000001";
const config: MailConfig = {
  origins: [origin],
  now: () => now,
  ingress: { enabled: true, domain: "facturas.example.com", signingKey: key },
};
function setup() {
  const records: Record<string, unknown>[] = [],
    files = new Set<string>(),
    hashes = new Set<string>();
  const gateway: MailGateway = {
    authenticate: vi.fn(async (t) => (t === "valid" ? { id: user } : null)),
    access: vi.fn(async (id) =>
      id === org
        ? {
            active: true,
            can_write: true,
            can_manage: true,
            features: { gmail: true },
          }
        : null,
    ),
    server: vi.fn(
      async <T>(action: string, data: Record<string, unknown>): Promise<T> => {
        if (action === "exists")
          return hashes.has(String(data.content_hash)) as T;
        if (action === "record_invoice") {
          records.push(data);
          hashes.add(String(data.content_hash));
          return { id: crypto.randomUUID() } as T;
        }
        if (action === "delivery_begin")
          return {
            state: "ready",
            organization_id: org,
            user_id: user,
            lease_token: token,
          } as T;
        return null as T;
      },
    ) as MailGateway["server"],
    upload: vi.fn(async (path) => {
      files.add(path);
    }),
    remove: vi.fn(async (path) => {
      files.delete(path);
    }),
  };
  return {
    gateway,
    records,
    files,
    handle: createMailHandler(gateway, config),
  };
}
function upload(id = org, auth = "valid") {
  const body = new FormData();
  body.set("organization_id", id);
  body.set(
    "file",
    new File([fictitiousEmail() as BlobPart], "correo.eml", {
      type: "message/rfc822",
    }),
  );
  return new Request(origin + "/functions/v1/company-mail", {
    method: "POST",
    headers: { Authorization: "Bearer " + auth, Origin: origin },
    body,
  });
}
function event() {
  return {
    recipient: "a".repeat(43) + "@facturas.example.com",
    delivery_id: "synthetic-delivery-1",
    message_base64: base64(fictitiousEmail()),
  };
}
async function signed(value = event(), timestamp = String(now / 1000)) {
  const raw = JSON.stringify(value),
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  const result = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode("truckcontrol-mail-v1:" + timestamp + "." + raw),
    ),
  );
  const signature = Array.from(result, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    raw,
    timestamp,
    signature,
    request: () =>
      new Request(origin + "/functions/v1/company-mail/inbound", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-truckcontrol-timestamp": timestamp,
          "x-truckcontrol-signature": signature,
        },
        body: raw,
      }),
  };
}
describe("correo universal: permisos y recepción firmada", () => {
  it("la lectura IA autorizada propone datos después de guardar el original", async () => {
    const s = setup();
    s.gateway.analyze = vi.fn(async () => true);
    const response = await s.handle(upload());
    expect(await response.json()).toMatchObject({
      imported: 1,
      failures: 0,
      ai_used: true,
    });
    expect(s.records).toHaveLength(1);
    expect(s.files.size).toBe(1);
    expect(s.gateway.analyze).toHaveBeenCalledWith(
      org,
      user,
      expect.any(String),
      expect.any(Uint8Array),
      "application/pdf",
    );
  });
  it("una IA no disponible conserva el documento pendiente sin simular un gasto ni repetir la subida", async () => {
    const s = setup();
    s.gateway.analyze = vi.fn(async () => {
      throw Error("model unavailable");
    });
    expect(await (await s.handle(upload())).json()).toMatchObject({
      imported: 1,
      failures: 0,
      ai_used: false,
    });
    expect(s.records).toHaveLength(1);
    expect(s.files.size).toBe(1);
    expect(s.gateway.upload).toHaveBeenCalledTimes(1);
    expect(s.gateway.remove).not.toHaveBeenCalled();
  });
  it("la disponibilidad global de IA no habilita una cuenta sin su permiso y consentimiento", async () => {
    const s = setup();
    s.gateway.aiStatus = vi.fn(async () => true);
    const response = await s.handle(
      new Request(origin + "/company-mail", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid",
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "status", organization_id: org }),
      }),
    );
    expect(await response.json()).toMatchObject({ ai_enabled: false });
  });
  it("exige sesión y no acepta acceso a otra empresa", async () => {
    const { handle, gateway } = setup();
    expect((await handle(upload(org, "invalid"))).status).toBe(401);
    expect(
      (await handle(upload("41000000-0000-4000-8000-000000000099"))).status,
    ).toBe(403);
    expect(gateway.upload).not.toHaveBeenCalled();
  });
  it("importa un EML sin llamar a IA y detecta el PDF repetido", async () => {
    const { handle, records, files } = setup();
    expect(await (await handle(upload())).json()).toMatchObject({
      imported: 1,
      ai_used: false,
    });
    expect(await (await handle(upload())).json()).toMatchObject({
      imported: 0,
      skipped: 1,
    });
    expect(records[0]).toMatchObject({
      organization_id: org,
      user_id: user,
      import_source: "email_upload",
      total_cents: null,
    });
    expect(files.size).toBe(1);
  });
  it("revalida el permiso antes de guardar y deniega usuarios de consulta", async () => {
    const { handle, gateway } = setup();
    vi.mocked(gateway.access).mockResolvedValue({
      active: true,
      can_write: false,
      can_manage: false,
      features: { gmail: true },
    });
    expect((await handle(upload())).status).toBe(403);
    expect(gateway.upload).not.toHaveBeenCalled();
  });
  it("limpia el archivo nuevo cuando falla el registro", async () => {
    const { handle, gateway, files } = setup();
    vi.mocked(gateway.server).mockImplementation(async (action) => {
      if (action === "exists") return false;
      throw new MailActionError("database_rejected", 409, true);
    });
    expect(await (await handle(upload())).json()).toMatchObject({
      imported: 0,
      failures: 1,
    });
    expect(files.size).toBe(0);
  });
  it("mantiene el receptor cerrado sin proveedor aunque haya una firma", async () => {
    const { gateway } = setup(),
      handle = createMailHandler(gateway, { origins: [origin] });
    expect((await handle((await signed()).request())).status).toBe(503);
    expect(gateway.server).not.toHaveBeenCalled();
  });
  it("conserva el original si se pierde la respuesta de un registro que pudo quedar confirmado", async () => {
    const { handle, gateway, files, records } = setup();
    const original = vi.mocked(gateway.server).getMockImplementation()!;
    vi.mocked(gateway.server).mockImplementation(async (action, data) => {
      const result = await original(action, data);
      if (action === "record_invoice")
        throw Error("response lost after commit");
      return result;
    });
    expect(await (await handle(upload())).json()).toMatchObject({
      failures: 1,
    });
    expect(records).toHaveLength(1);
    expect(files.size).toBe(1);
    expect(gateway.remove).not.toHaveBeenCalled();
    expect(await (await handle(upload())).json()).toMatchObject({
      imported: 0,
      skipped: 1,
    });
    expect(files.size).toBe(1);
  });
  it("verifica la firma del cuerpo exacto, su caducidad y su propósito", async () => {
    const { raw, timestamp, signature } = await signed();
    expect(
      await verifyMailSignature(
        new TextEncoder().encode(raw),
        timestamp,
        signature,
        key,
        now,
      ),
    ).toBe(true);
    expect(
      await verifyMailSignature(
        new TextEncoder().encode(raw + " "),
        timestamp,
        signature,
        key,
        now,
      ),
    ).toBe(false);
    expect(
      await verifyMailSignature(
        new TextEncoder().encode(raw),
        timestamp,
        signature,
        key,
        now + 301000,
      ),
    ).toBe(false);
    const { handle, gateway } = setup();
    expect(
      (
        await handle(
          (await signed(event(), String(now / 1000 - 301))).request(),
        )
      ).status,
    ).toBe(401);
    expect(gateway.server).not.toHaveBeenCalled();
  });
  it("el destinatario se resuelve en servidor, nunca con una empresa aportada por el remitente", async () => {
    const { handle, records } = setup();
    expect((await handle((await signed()).request())).status).toBe(200);
    expect(records[0]).toMatchObject({
      organization_id: org,
      user_id: user,
      import_source: "forwarded_email",
      lease_token: token,
    });
    const manipulated = { ...event(), organization_id: org };
    expect((await handle((await signed(manipulated)).request())).status).toBe(
      400,
    );
  });
  it("una repetición completada no vuelve a leer ni guardar el documento", async () => {
    const { handle, gateway } = setup();
    vi.mocked(gateway.server).mockImplementation(async () => ({
      state: "complete",
      imported: 1,
    }));
    expect(
      await (await handle((await signed()).request())).json(),
    ).toMatchObject({ duplicate: true, imported: 1 });
    expect(gateway.upload).not.toHaveBeenCalled();
  });
  it("rechaza el origen ajeno y las entregas firmadas enviadas desde el navegador", async () => {
    const { handle } = setup();
    expect(
      (
        await handle(
          new Request(origin, {
            method: "OPTIONS",
            headers: { Origin: "https://evil.example" },
          }),
        )
      ).status,
    ).toBe(403);
    const delivery = (await signed()).request();
    delivery.headers.set("Origin", origin);
    expect((await handle(delivery)).status).toBe(403);
  });
  it("corta una entrada demasiado grande aunque omita Content-Length", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(11));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(origin, {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(readLimited(request, 10)).rejects.toMatchObject({
      status: 413,
    });
    expect(cancelled).toBe(true);
  });
});
