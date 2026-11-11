import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import {
  checkedIncidentMutation, incidentEntrySchema, incidentInput, incidentProviderSchema, subscriptionIncidentSchema,
} from "../src/domain/subscription-incidents";
import { createSubscriptionIncidentClient } from "../src/integrations/supabase/subscription-incidents";
import { actorId, caseId, companyId, incident, incidentCapabilities, mutation, operationId } from "./fixtures/subscription-incidents";
const envelope = (items = [incident()]) => ({ contract: "subscription-financial-incidents-v1", items, next_cursor: null });
function fixture(resolve: (args: Record<string, unknown>) => { data: unknown; error?: { code: string; message?: string } | null } | Promise<{ data: unknown; error?: { code: string; message?: string } | null }> = () => ({ data: envelope() })) {
  let token = "synthetic-jwt-A", currentUser = actorId;
  const getSession = vi.fn(async () => ({ data: { session: token ? { user: { id: currentUser }, access_token: token } : null }, error: null }));
  const getUser = vi.fn(async (_token: string) => ({ data: { user: { id: currentUser } }, error: null }));
  const headers: [string, string][] = [], signals: AbortSignal[] = [];
  const rpc = vi.fn((_name: string, args: Record<string, unknown>) => {
    const response = Promise.resolve(args.p_action === "capabilities" ? { data: incidentCapabilities, error: null } : resolve(args)).then((value) => ({ error: null, ...value }));
    const query = Object.assign(response, {
      setHeader(name: string, value: string) { headers.push([name, value]); return query; },
      abortSignal(signal: AbortSignal) { signals.push(signal); return query; },
    });
    return query;
  });
  return { client: { auth: { getSession, getUser }, rpc } as unknown as SupabaseClient<Database>, rpc, getSession, getUser, headers, signals,
    setToken(value: string) { token = value; }, setUser(value: string) { currentUser = value; } };
}
async function ready(f: ReturnType<typeof fixture>) {
  const scope = await createSubscriptionIncidentClient(f.client, actorId); await scope.capabilities(); return scope;
}
describe("incidencias financieras: contrato sin pagos, con CAS y auditoría", () => {
  it("no interpreta pending/failed como devolución realizada y acepta alcance mismatch del proveedor", () => {
    expect(incidentProviderSchema.parse(incident().latest_provider).extent).toBe("partial");
    expect(incidentProviderSchema.parse({ ...incident().latest_provider, current_status: "failed", extent: "mismatch" }).current_status).toBe("failed");
  });
  it("rechaza importes fuera de contrato, identidad de objeto cruzada y texto de estado con controles", () => {
    for (const delta of [{ event_amount_cents: null }, { current_amount_cents: 100000001 }, { charge_amount_refunded_cents: -1 },
      { object_id: "dp_wrongType" }, { current_status: "pending\nprivate" }, { payment_intent_id: null }]) {
      expect(incidentProviderSchema.safeParse({ ...incident().latest_provider, ...delta }).success).toBe(false);
    }
  });
  it("exige la identidad propia de renovación, ambas fechas y la evidencia declarada por estado", () => {
    for (const delta of [{ provider_payment_id: "pi_different" }, { period_end: null }, { review_state: "reviewed" },
      { rectification_state: "reported" }, { period_end: "2026-10-01T00:00:00Z" }]) {
      expect(subscriptionIncidentSchema.safeParse({ ...incident(), ...delta }).success).toBe(false);
    }
  });
  it("las notas y referencias son los únicos datos administrativos y no aceptan poderes ni importes", () => {
    expect(incidentInput("review", { note: " Revisado sin automatizar " })).toEqual({ note: "Revisado sin automatizar" });
    for (const extra of [{ refund: true }, { amount_cents: 1 }, { enable_license: true }]) {
      expect(() => incidentInput("review", { note: "Nota ficticia", ...extra })).toThrow();
    }
    expect(() => incidentInput("report_rectification", { note: "Nota", reference: "\n" })).toThrow();
  });
  it("distingue entradas de proveedor y operador sin inventar una actuación fiscal", () => {
    const entry = { id: operationId, row_version: 2, kind: "provider", actor_id: null, created_at: incident().created_at,
      provider: incident().latest_provider, note: null, reference: null };
    expect(incidentEntrySchema.parse(entry).kind).toBe("provider");
    expect(incidentEntrySchema.safeParse({ ...entry, actor_id: actorId }).success).toBe(false);
    expect(incidentEntrySchema.safeParse({ ...entry, kind: "rectification_report", provider: null, actor_id: actorId, note: "Declarado" }).success).toBe(false);
  });
  it("verifica identidad, nota, referencia, actor y CAS de la confirmación", () => {
    const before = incident(), input = { note: "Nota ficticia", reference: "GDT-TEST-R1" };
    const valid = mutation(before, "report_rectification", input);
    expect(checkedIncidentMutation(valid, before, "report_rectification", input, operationId, actorId)).toEqual(valid);
    for (const change of [
      { operation: { ...valid.operation, note: "Otra nota" } }, { operation: { ...valid.operation, reference: "Otra referencia" } },
      { operation: { ...valid.operation, actor_id: companyId } }, { operation: { ...valid.operation, expected_version: 3 } },
      { case: { ...valid.case, buyer_company_id: actorId } }, { case: { ...valid.case, task_id: actorId } },
      { case: { ...valid.case, amount_cents: 36301 } }, { case: { ...valid.case, row_version: 4 } },
    ]) expect(() => checkedIncidentMutation({ ...valid, ...change }, before, "report_rectification", input, operationId, actorId)).toThrow();
  });
  it("un replay confirma su operación original aun con observaciones y revisión posteriores", () => {
    const before = incident(), input = { note: "Revisión original" }, first = mutation(before, "review", input);
    const replay = { ...first, replayed: true, case: { ...first.case, row_version: 5, review_state: "pending",
      last_review: { ...first.case.last_review!, note: "Otra revisión", row_version: 4 } } };
    expect(checkedIncidentMutation(replay, before, "review", input, operationId, actorId).case.row_version).toBe(5);
    expect(() => checkedIncidentMutation(replay, before, "review", { note: "Texto cambiado" }, operationId, actorId)).toThrow();
  });
});
describe("cliente administrativo vinculado a una única sesión en RAM", () => {
  it("comprueba Auth y fija Authorization por RPC sin depender de metadata", async () => {
    const f = fixture(); const scope = await ready(f); await scope.list();
    expect(f.getUser).toHaveBeenCalledWith("synthetic-jwt-A");
    expect(f.rpc).toHaveBeenLastCalledWith("tc_admin_subscription_incidents", {
      p_action: "list", p_case_id: null, p_expected: null, p_operation_id: null, p_data: {}, p_after: null,
    });
    expect(f.headers.every(([name, value]) => name === "Authorization" && value === "Bearer synthetic-jwt-A")).toBe(true);
  });
  it("sin capacidades aceptadas ni backend disponible no permite actuaciones", async () => {
    const f = fixture(), scope = await createSubscriptionIncidentClient(f.client, actorId);
    await expect(scope.mutate(incident(), "review", { note: "Nota ficticia" }, operationId)).rejects.toMatchObject({ kind: "unavailable" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("ausencia/denegación del backend no filtra diagnósticos privados", async () => {
    for (const [code, kind] of [["PGRST202", "unavailable"], ["42883", "unavailable"], ["42501", "denied"], ["40001", "conflict"], ["23514", "invalid"]]) {
      const f = fixture(() => ({ data: null, error: { code, message: "PRIVATE-SYNTHETIC-DIAGNOSTIC" } }));
      const scope = await ready(f);
      await expect(scope.mutate(incident(), "review", { note: "Nota ficticia" }, operationId)).rejects.toMatchObject({ kind });
      await expect(scope.detail(caseId)).rejects.not.toThrow("PRIVATE-SYNTHETIC-DIAGNOSTIC");
    }
  });
  it("un error de transporte de escritura se mantiene incierto y no se reintenta solo", async () => {
    const f = fixture(async () => { throw Error("PRIVATE-NETWORK"); }), scope = await ready(f);
    await expect(scope.mutate(incident(), "review", { note: "Nota ficticia" }, operationId)).rejects.toMatchObject({ kind: "uncertain" });
    expect(f.rpc.mock.calls.filter(([, args]) => args.p_action === "review")).toHaveLength(1);
  });
  it("envía la versión esperada y UUID estables sin atributos de licencia o reembolso", async () => {
    const before = incident(), input = { note: "Nota ficticia" };
    const f = fixture(() => ({ data: mutation(before, "review", input) })), scope = await ready(f);
    expect((await scope.mutate(before, "review", input, operationId)).case.review_state).toBe("reviewed");
    expect(f.rpc).toHaveBeenLastCalledWith("tc_admin_subscription_incidents", {
      p_action: "review", p_case_id: caseId, p_expected: 2, p_operation_id: operationId, p_data: input, p_after: null,
    });
  });
  it("respuestas de detalle o historial de otro caso se rechazan", async () => {
    const wrong = fixture(() => ({ data: envelope([{ ...incident(), id: actorId }]) })), scope = await ready(wrong);
    await expect(scope.detail(caseId)).rejects.toMatchObject({ kind: "invalid" });
    const f = fixture(() => ({ data: { contract: "subscription-financial-incidents-v1", case_id: actorId, items: [], next_before_version: null } }));
    await expect((await ready(f)).history(caseId)).rejects.toMatchObject({ kind: "invalid" });
  });
  it("páginas repetidas o que no avanzan no se mezclan con el listado", async () => {
    for (const page of [envelope([incident(), incident()]), { ...envelope(), next_cursor: actorId }]) {
      const f = fixture(() => ({ data: page })); await expect((await ready(f)).list()).rejects.toMatchObject({ kind: "invalid" });
    }
    await expect((await ready(fixture())).list(caseId)).rejects.toMatchObject({ kind: "invalid" });
  });
  it("la historia avanza estrictamente por versión, no por un cursor de otra entrada", async () => {
    const entry = { id: operationId, row_version: 2, kind: "provider", actor_id: null, created_at: incident().created_at,
      provider: incident().latest_provider, note: null, reference: null };
    for (const value of [{ items: [entry, entry], next_before_version: null }, { items: [entry], next_before_version: 3 }]) {
      const f = fixture(() => ({ data: { contract: "subscription-financial-incidents-v1", case_id: caseId, ...value } }));
      await expect((await ready(f)).history(caseId)).rejects.toMatchObject({ kind: "invalid" });
    }
  });
  it("cambio de token del mismo usuario antes de enviar invalida el contexto sin RPC", async () => {
    const f = fixture(), scope = await ready(f); f.rpc.mockClear();
    f.setToken("synthetic-jwt-B");
    await expect(scope.list()).rejects.toMatchObject({ kind: "denied" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("un cambio de identidad durante getUser impide ejecutar la intención antigua", async () => {
    const f = fixture(), scope = await ready(f); f.rpc.mockClear();
    f.getUser.mockImplementationOnce(async () => { f.setUser(companyId); return { data: { user: { id: actorId } }, error: null }; });
    await expect(scope.mutate(incident(), "review", { note: "Nota ficticia" }, operationId)).rejects.toMatchObject({ kind: "denied" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("una respuesta tardía tras logout no devuelve información del caso anterior", async () => {
    let release!: () => void;
    const f = fixture(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { data: envelope() }; });
    const scope = await ready(f), pending = scope.list();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    f.setToken(""); release();
    await expect(pending).rejects.toMatchObject({ kind: "denied" });
  });
  it("cerrar el ámbito o abortar impide nuevas consultas y descarta lecturas en curso", async () => {
    const f = fixture(), scope = await ready(f); f.rpc.mockClear(); scope.close();
    await expect(scope.list()).rejects.toMatchObject({ kind: "cancelled" });
    expect(f.rpc).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort();
    await expect(createSubscriptionIncidentClient(f.client, actorId, controller.signal)).rejects.toMatchObject({ kind: "cancelled" });
  });
});
