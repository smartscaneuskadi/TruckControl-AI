import { describe, expect, it, vi } from "vitest";
import { createMailHandler } from "../../../supabase/functions/company-mail/handler";
import type { MailGateway } from "../../../supabase/functions/company-mail/handler";
import { hash } from "../../../supabase/functions/_shared/invoice";
const org = "e1000000-0000-4000-8000-000000000001",
  user = "e1000000-0000-4000-8000-000000000002",
  inv = "e2000000-0000-4000-8000-000000000001",
  doc = "e3000000-0000-4000-8000-000000000001";
const origin = "https://truckcontrolai.com";
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nFactura ficticia sin datos personales.\n%%EOF",
);
async function fixture() {
  const prepared = {
    state: "available",
    invoice_id: inv,
    content_hash: await hash(bytes),
    document: {
      id: doc,
      object_path: `${org}/${doc}/document.pdf`,
      name: "Ficticia.pdf",
      content_type: "application/pdf",
      size_bytes: bytes.length,
    },
  };
  let attempted = false;
  const gateway: MailGateway = {
    authenticate: vi.fn(async (token) =>
      token === "valid" ? { id: user } : null,
    ),
    access: vi.fn(async (o) => ({
      active: o === org,
      can_write: true,
      can_manage: false,
      features: { gmail: true, invoice_ai: true },
    })),
    server: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
    aiStatus: vi.fn(async () => true),
    invoiceAI: vi.fn(async (action) =>
      action === "status"
        ? [
            {
              invoice_id: inv,
              state: attempted ? "attempted" : "available",
              can_analyze: !attempted,
            },
          ]
        : attempted
          ? { state: "attempted" }
          : structuredClone(prepared),
    ),
    download: vi.fn(async () => bytes),
    analyze: vi.fn(async () => {
      attempted = true;
      return true;
    }),
  };
  return {
    gateway,
    prepared,
    handle: createMailHandler(gateway, { origins: [origin] }),
    attempted: () => {
      attempted = true;
    },
  };
}
function request(
  body: Record<string, unknown> = {},
  token = "valid",
  requestOrigin = origin,
) {
  return new Request("https://edge.invalid/company-mail", {
    method: "POST",
    headers: {
      Origin: requestOrigin,
      authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "analyze_invoice",
      organization_id: org,
      invoice_id: inv,
      confirmed: true,
      ...body,
    }),
  });
}
const statusRequest = (ids = [inv]) =>
  request({
    action: "invoice_ai_status",
    invoice_id: undefined,
    confirmed: undefined,
    invoice_ids: ids,
  });
describe("primera lectura IA de originales ya guardados", () => {
  it("un operador autorizado solo envía el original verificado y no registra gastos", async () => {
    const f = await fixture(),
      r = await f.handle(request());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ analyzed: true });
    expect(f.gateway.download).toHaveBeenCalledWith(
      f.prepared.document.object_path,
    );
    expect(f.gateway.analyze).toHaveBeenCalledExactlyOnceWith(
      org,
      user,
      inv,
      bytes,
      "application/pdf",
    );
    expect(f.gateway.invoiceAI).toHaveBeenCalledTimes(2);
    expect(f.gateway.server).not.toHaveBeenCalled();
    expect(f.gateway.upload).not.toHaveBeenCalled();
    expect(f.gateway.remove).not.toHaveBeenCalled();
  });
  it("exige sesión y origen permitido antes de leer documentos", async () => {
    const f = await fixture();
    expect((await f.handle(request({}, ""))).status).toBe(401);
    expect(
      (await f.handle(request({}, "valid", "https://evil.invalid"))).status,
    ).toBe(403);
    expect(f.gateway.invoiceAI).not.toHaveBeenCalled();
    expect(f.gateway.download).not.toHaveBeenCalled();
  });
  it("deniega falta de consentimiento, rol de consulta, suspensión y otra empresa", async () => {
    for (const change of [
      { active: false },
      { can_write: false },
      { features: { gmail: true, invoice_ai: false } },
      { features: { gmail: false, invoice_ai: true } },
    ]) {
      const f = await fixture();
      f.gateway.access = vi.fn(async () => ({
        active: true,
        can_write: true,
        can_manage: true,
        features: { gmail: true, invoice_ai: true },
        ...change,
      }));
      expect((await f.handle(request())).status).toBe(403);
      expect(f.gateway.invoiceAI).not.toHaveBeenCalled();
      expect(f.gateway.analyze).not.toHaveBeenCalled();
    }
    const f = await fixture();
    expect((await f.handle(request({ organization_id: doc }))).status).toBe(
      403,
    );
  });
  it("no admite actor, rutas ni campos propuestos por el navegador y exige confirmación", async () => {
    for (const extra of [
      { confirmed: false },
      { confirmed: undefined },
      { user_id: user },
      { object_path: "https://evil.invalid/file" },
      { fields: { total_cents: 1 } },
      { invoice_id: "invalid" },
    ]) {
      const f = await fixture();
      expect((await f.handle(request(extra))).status).toBe(400);
      expect(f.gateway.download).not.toHaveBeenCalled();
      expect(f.gateway.analyze).not.toHaveBeenCalled();
    }
  });
  it("el estado de una página devuelve solo IDs, estados y disponibilidad sin consumo", async () => {
    const f = await fixture(),
      r = await f.handle(statusRequest());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      enabled: true,
      states: [{ invoice_id: inv, state: "available", can_analyze: true }],
    });
    expect(f.gateway.download).not.toHaveBeenCalled();
    expect(f.gateway.analyze).not.toHaveBeenCalled();
    expect(f.gateway.invoiceAI).toHaveBeenCalledExactlyOnceWith("status", {
      organization_id: org,
      user_id: user,
      invoice_ids: [inv],
    });
  });
  it("limita y valida IDs, duplicados y campos privados de las respuestas", async () => {
    const f = await fixture();
    expect((await f.handle(statusRequest([inv, inv]))).status).toBe(400);
    expect((await f.handle(statusRequest([]))).status).toBe(400);
    expect((await f.handle(statusRequest(Array(201).fill(inv)))).status).toBe(
      400,
    );
    for (const state of [
      { invoice_id: doc, state: "available", can_analyze: true },
      { invoice_id: inv, state: "attempted", can_analyze: true },
      {
        invoice_id: inv,
        state: "available",
        can_analyze: true,
        secret: "synthetic-private",
      },
    ]) {
      f.gateway.invoiceAI = vi.fn(async () => [state]);
      const r = await f.handle(statusRequest());
      expect(r.status).toBe(502);
      expect(await r.text()).not.toContain("synthetic-private");
    }
  });
  it("facturas registradas, intentos previos, archivos grandes y ausentes no llegan al proveedor", async () => {
    for (const [prepared, status] of [
      [{ state: "approved" }, 409],
      [{ state: "attempted" }, 409],
      [{ state: "too_large" }, 413],
      [null, 404],
    ] as const) {
      const f = await fixture();
      f.gateway.invoiceAI = vi.fn(async () => prepared);
      expect((await f.handle(request())).status).toBe(status);
      expect(f.gateway.download).not.toHaveBeenCalled();
      expect(f.gateway.analyze).not.toHaveBeenCalled();
    }
  });
  it("una ruta ajena se rechaza antes de descargar; tamaño, hash y firma se verifican antes de IA", async () => {
    const crossed = await fixture();
    crossed.prepared.document.object_path = `${doc}/${doc}/document.pdf`;
    expect((await crossed.handle(request())).status).toBe(409);
    expect(crossed.gateway.download).not.toHaveBeenCalled();
    for (const replacement of [
      new TextEncoder().encode("<html>no PDF</html>"),
      new TextEncoder().encode(
        "%PDF-1.7\nOtro contenido ficticio distinto del original.\n%%EOF",
      ),
    ]) {
      const f = await fixture();
      f.gateway.download = vi.fn(async () => replacement);
      expect((await f.handle(request())).status).toBe(409);
      expect(f.gateway.analyze).not.toHaveBeenCalled();
    }
  });
  it("revalida permisos y estado después de descargar", async () => {
    const f = await fixture();
    let calls = 0;
    f.gateway.access = vi.fn(async () => ({
      active: ++calls === 1,
      can_write: true,
      can_manage: true,
      features: { gmail: true, invoice_ai: true },
    }));
    expect((await f.handle(request())).status).toBe(403);
    expect(f.gateway.analyze).not.toHaveBeenCalled();
    const g = await fixture();
    let n = 0;
    g.gateway.invoiceAI = vi.fn(async () =>
      ++n === 1 ? structuredClone(g.prepared) : { state: "approved" },
    );
    expect((await g.handle(request())).status).toBe(409);
    expect(g.gateway.analyze).not.toHaveBeenCalled();
  });
  it("un corte de red conserva el intento y no se vuelve a llamar al proveedor", async () => {
    const f = await fixture();
    f.gateway.analyze = vi.fn(async () => {
      f.attempted();
      throw Error("synthetic-private-provider-error");
    });
    const first = await f.handle(request());
    expect(first.status).toBe(502);
    expect(await first.text()).not.toContain("synthetic-private");
    const second = await f.handle(request());
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      error: "invoice_ai_already_attempted",
    });
    expect(f.gateway.analyze).toHaveBeenCalledTimes(1);
  });
  it("desactivación, almacenamiento y resultado no aplicado no borran el original ni exponen errores", async () => {
    const off = await fixture();
    off.gateway.aiStatus = async () => false;
    expect((await off.handle(request())).status).toBe(503);
    expect(off.gateway.download).not.toHaveBeenCalled();
    const broken = await fixture();
    broken.gateway.download = async () => {
      throw Error("synthetic-private-storage");
    };
    const r = await broken.handle(request());
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("synthetic-private");
    expect(broken.gateway.analyze).not.toHaveBeenCalled();
    const unapplied = await fixture();
    unapplied.gateway.analyze = async () => false;
    expect((await unapplied.handle(request())).status).toBe(409);
    expect(unapplied.gateway.remove).not.toHaveBeenCalled();
  });
});
