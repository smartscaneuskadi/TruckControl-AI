import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { analyzeStoredInvoice, loadInvoiceAiStates } from "./invoice-ai";
const org = "e1000000-0000-4000-8000-000000000001",
  id = "e2000000-0000-4000-8000-000000000001";
function client(data: unknown, error: unknown = null) {
  const invoke = vi.fn(async () => ({ data, error }));
  return {
    invoke,
    client: { functions: { invoke } } as unknown as SupabaseClient<Database>,
  };
}
describe("cliente de lectura IA sin secretos ni repetición automática", () => {
  it("envía solo identidad de empresa/factura y confirmación, una vez", async () => {
    const f = client({ analyzed: true });
    await analyzeStoredInvoice(f.client, org, id);
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("company-mail", {
      body: {
        action: "analyze_invoice",
        organization_id: org,
        invoice_id: id,
        confirmed: true,
      },
    });
  });
  it("valida el estado por página e impide respuestas ajenas o con datos privados", async () => {
    const states = [{ invoice_id: id, state: "available", can_analyze: true }];
    expect(
      await loadInvoiceAiStates(client({ enabled: true, states }).client, org, [
        id,
      ]),
    ).toEqual({ enabled: true, states });
    for (const bad of [
      { enabled: true, states: [{ ...states[0], invoice_id: org }] },
      {
        enabled: true,
        states: [{ ...states[0], private_key: "synthetic-private" }],
      },
      { enabled: true, states: [{ ...states[0], state: "attempted" }] },
      { enabled: true, states, private_key: "synthetic-private" },
    ])
      await expect(
        loadInvoiceAiStates(client(bad).client, org, [id]),
      ).rejects.toThrow(/estado/);
  });
  it("un intento incierto se explica sin repetir ni mostrar el error original", async () => {
    const f = client(null, {
      context: Response.json(
        { error: "invoice_ai_not_completed", private_key: "synthetic-private" },
        { status: 502 },
      ),
    });
    await expect(analyzeStoredInvoice(f.client, org, id)).rejects.toThrow(
      "No se ha podido confirmar el resultado",
    );
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });
  it("solo utiliza mensajes conocidos, sin exponer HTML ni propiedades heredadas", async () => {
    for (const error of [
      "unexpected_synthetic_private",
      "__proto__",
      "toString",
    ]) {
      const f = client({ error });
      await expect(analyzeStoredInvoice(f.client, org, id)).rejects.toThrow(
        "Actualiza la bandeja",
      );
      expect(f.invoke).toHaveBeenCalledTimes(1);
    }
  });
  it("un permiso retirado es explícito y la cancelación no conserva una respuesta", async () => {
    await expect(
      analyzeStoredInvoice(
        client(null, {
          context: Response.json(
            { error: "company_access_denied" },
            { status: 403 },
          ),
        }).client,
        org,
        id,
      ),
    ).rejects.toThrow("necesita permiso");
    const c = new AbortController();
    c.abort();
    await expect(
      loadInvoiceAiStates(
        client({ enabled: false, states: [] }).client,
        org,
        [id],
        c.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
