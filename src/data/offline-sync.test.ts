import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/database.types";
import type { SubscriptionAccess } from "../domain/subscriptions";
import { demoFeatures } from "../domain/subscriptions";
import { createDemo } from "./demo";
import { demoOperations, CloudOperationRepository } from "./operations";
import { SupabaseFleetRepository } from "../integrations/supabase/repository";
import { offlinePayload, VaultSession, newVaultSalt } from "./offline-vault";
import type { VaultPayload } from "./offline-vault";
import type { OperationRecord } from "../domain/operations";
import { synchronizeVault } from "./offline-sync";

const user = "e6100000-0000-4000-8000-000000000001";
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
async function fixture() {
  const fleet = createDemo(), rows = demoOperations(fleet), at = new Date().toISOString();
  const access: SubscriptionAccess = {
    active: true, is_admin: false, features: demoFeatures, plan: "full", max_trucks: 50,
    sms_ready: false, prices_are_examples: true, payments_enabled: false,
    can_write: true, can_manage: true, company_role: "owner",
    profile: {
      user_id: user, email: "offline-sync@example.invalid", contact_name: "Persona ficticia",
      company_name: fleet.organization.name, tax_id: "DEMO-SYNC", address: "Direccion ficticia",
      phone: "+12025550171", requested_plan: "limited", paid_plan: null, status: "trial",
      trial_started_at: at, trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
      paid_until: null, ai_allowed: false, ai_opt_in: false, module_overrides: {},
      created_at: at, updated_at: at,
    },
  };
  const original = offlinePayload(fleet, rows, access);
  original.outbox = [{
    id: "e6100000-0000-4000-8000-000000000901", createdAt: at,
    command: { type: "save", value: rows.find((row) => row.kind === "customers")!, expected: 1 },
  }];
  let payload = structuredClone(original);
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const session = new VaultSession("https://kkkemaycedexymrpaqtp.supabase.co|" + user + "|" + fleet.organization.id, key, newVaultSalt());
  // Only browser storage and HTTP transports are replaced. Closing is the real
  // VaultSession capability and synchronizeVault performs its own checks.
  vi.spyOn(session, "read").mockImplementation(async () => structuredClone(payload));
  const update = vi.spyOn(session, "update").mockImplementation(async (change, signal) => {
    session.assertUnlocked(); signal?.throwIfAborted();
    payload = change(structuredClone(payload));
    return structuredClone(payload);
  });
  const getUser = vi.fn(async () => ({ data: { user: { id: user } }, error: null }));
  const rpc = vi.fn(async (_name: string, _args: unknown) => ({ data: structuredClone(access), error: null }));
  const client = { auth: { getUser }, rpc } as unknown as SupabaseClient<Database>;
  vi.spyOn(SupabaseFleetRepository.prototype, "load").mockResolvedValue(fleet);
  const execute = vi.spyOn(CloudOperationRepository.prototype, "execute").mockResolvedValue(rows);
  const load = vi.spyOn(CloudOperationRepository.prototype, "load").mockResolvedValue(rows);
  return { access, fleet, rows, original, session, client, rpc, update, execute, load,
    payload: () => payload, replace: (next: VaultPayload) => { payload = next; } };
}

describe("sincronización offline cerrada por cambio de sesión", () => {
  afterEach(() => vi.restoreAllMocks());
  it("no comienza escrituras si se bloquea mientras espera la autorización del cambio", async () => {
    const f = await fixture(), entered = deferred<void>(), resume = deferred<SubscriptionAccess>();
    let calls = 0;
    f.rpc.mockImplementation(async () => {
      if (++calls === 2) { entered.resolve(undefined); return { data: await resume.promise, error: null }; }
      return { data: structuredClone(f.access), error: null };
    });
    const result = synchronizeVault(f.session, f.client);
    await entered.promise; f.session.lock();
    const rejected = expect(result).rejects.toThrow("bloqueada");
    resume.resolve(f.access); await rejected;
    expect(f.execute).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled();
    expect(f.payload().outbox).toEqual(f.original.outbox);
  });
  it("una escritura ya iniciada queda incierta y conserva la identidad pendiente tras cerrar", async () => {
    const f = await fixture(), entered = deferred<void>(), resume = deferred<OperationRecord[]>();
    f.execute.mockImplementation(async () => { entered.resolve(undefined); return resume.promise; });
    const result = synchronizeVault(f.session, f.client);
    await entered.promise; f.session.lock();
    const rejected = expect(result).rejects.toThrow("puede haberse registrado");
    resume.resolve(f.rows); await rejected;
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute).toHaveBeenCalledWith(f.original.outbox[0].command, f.fleet);
    expect(f.update).not.toHaveBeenCalled();
    expect(f.payload().outbox).toEqual(f.original.outbox);
  });
  it("no devuelve una copia tardía ni la reemplaza si se cancela durante la lectura final", async () => {
    const f = await fixture(), entered = deferred<void>(), resume = deferred<OperationRecord[]>();
    f.replace({ ...f.original, outbox: [] });
    f.load.mockImplementation(async () => { entered.resolve(undefined); return resume.promise; });
    const controller = new AbortController();
    const result = synchronizeVault(f.session, f.client, controller.signal);
    await entered.promise; controller.abort();
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    resume.resolve(f.rows); await rejected;
    expect(f.update).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("no usa los permisos de otra identidad que aparezca después del primer getUser", async () => {
    const f = await fixture();
    let calls = 0;
    f.rpc.mockImplementation(async () => ({ error: null, data: ++calls === 2
      ? { ...f.access, profile: { ...f.access.profile!, user_id: "e6100000-0000-4000-8000-000000000002" } }
      : structuredClone(f.access) }));
    await expect(synchronizeVault(f.session, f.client)).rejects.toThrow("cuenta de la copia ha cambiado");
    expect(f.execute).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled();
    expect(f.payload().outbox).toEqual(f.original.outbox);
  });
  it("con acceso vigente publica una sola vez el comando original y sólo entonces retira su UUID", async () => {
    const f = await fixture();
    const result = await synchronizeVault(f.session, f.client);
    expect(result.sent).toBe(1); expect(result.payload.outbox).toEqual([]);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute).toHaveBeenCalledWith(f.original.outbox[0].command, f.fleet);
    expect(f.payload().outbox).toEqual([]);
    expect(f.rpc.mock.calls.every(([name]) => name === "tc_organization_access")).toBe(true);
  });
});
