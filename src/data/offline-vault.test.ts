import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemo } from "./demo";
import { demoOperations } from "./operations";
import {
  deriveVaultKey,
  newVaultSalt,
  offlinePayload,
  openVault,
  sealVault,
  validateVaultPayload,
  vaultScope,
  VaultSession,
} from "./offline-vault";
import { demoFeatures } from "../domain/subscriptions";
import type { VaultEnvelope } from "./offline-vault";
import type { SubscriptionAccess } from "../domain/subscriptions";
const fleet = createDemo(),
  user = "e0000000-0000-4000-8000-000000000001";
const now = new Date().toISOString(),
  ends = new Date(Date.now() + 30 * 86400000).toISOString();
const access: SubscriptionAccess = {
  active: true,
  is_admin: false,
  features: demoFeatures,
  plan: "full",
  max_trucks: 50,
  sms_ready: false,
  prices_are_examples: true,
  payments_enabled: false,
  can_write: true,
  can_manage: true,
  company_role: "owner",
  profile: {
    user_id: user,
    email: "demo@example.com",
    contact_name: "Persona ficticia",
    company_name: fleet.organization.name,
    tax_id: "DEMO-ID",
    address: "Direccion ficticia",
    phone: "+34600000000",
    requested_plan: "limited",
    paid_plan: null,
    status: "trial",
    trial_started_at: now,
    trial_ends_at: ends,
    paid_until: null,
    ai_allowed: false,
    ai_opt_in: false,
    module_overrides: {},
    created_at: now,
    updated_at: now,
  },
};
const scope = vaultScope(
    "https://kkkemaycedexymrpaqtp.supabase.co",
    user,
    fleet.organization.id,
  ),
  passphrase = "frase-sintetica-para-pruebas-123";
describe("almacenamiento offline cifrado", () => {
  it("protege datos personales y no permite exportar la clave", async () => {
    const salt = newVaultSalt(),
      key = await deriveVaultKey(passphrase, salt),
      payload = offlinePayload(fleet, demoOperations(fleet), access);
    const envelope = await sealVault(payload, scope, key, salt, 1),
      stored = JSON.stringify(envelope);
    expect(stored).not.toContain("Persona ficticia");
    expect(stored).not.toContain(fleet.trucks[0].plate);
    expect(stored).not.toContain(passphrase);
    expect((await openVault(envelope, scope, key)).snapshot.drivers).toEqual(
      fleet.drivers,
    );
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });
  it("vincula el cifrado a proyecto, usuario, empresa y revisión", async () => {
    const salt = newVaultSalt(),
      key = await deriveVaultKey(passphrase, salt),
      envelope = await sealVault(
        offlinePayload(fleet, [], access),
        scope,
        key,
        salt,
        2,
      );
    await expect(
      openVault({ ...envelope, revision: 3 }, scope, key),
    ).rejects.toThrow("ha cambiado");
    const other = vaultScope(
      "https://other-project.supabase.co",
      user,
      fleet.organization.id,
    );
    await expect(
      openVault({ ...envelope, scope: other }, other, key),
    ).rejects.toThrow("ha cambiado");
    const otherUser = vaultScope(
      "https://kkkemaycedexymrpaqtp.supabase.co",
      "e0000000-0000-4000-8000-000000000002",
      fleet.organization.id,
    );
    await expect(
      openVault({ ...envelope, scope: otherUser }, otherUser, key),
    ).rejects.toThrow("ha cambiado");
  });
  it("rechaza una contraseña incorrecta y contenido alterado", async () => {
    const salt = newVaultSalt(),
      key = await deriveVaultKey(passphrase, salt),
      envelope = await sealVault(
        offlinePayload(fleet, [], access),
        scope,
        key,
        salt,
        1,
      );
    await expect(
      openVault(
        envelope,
        scope,
        await deriveVaultKey("otra-frase-sintetica-123", salt),
      ),
    ).rejects.toThrow("no es correcta");
    await expect(
      openVault(
        { ...envelope, cipher: `AAAA${envelope.cipher.slice(4)}` },
        scope,
        key,
      ),
    ).rejects.toThrow("ha cambiado");
  });
  it("no amplía la suscripción y bloquea una copia caducada o de otra empresa", () => {
    const payload = offlinePayload(fleet, [], access);
    expect(
      Date.parse(payload.expiresAt) - Date.parse(payload.authorizedAt),
    ).toBe(7 * 86400000);
    const soon = new Date(Date.now() + 3600000).toISOString();
    expect(
      offlinePayload(fleet, [], {
        ...access,
        profile: { ...access.profile!, trial_ends_at: soon },
      }).expiresAt,
    ).toBe(soon);
    expect(() =>
      validateVaultPayload(
        { ...payload, expiresAt: new Date(Date.now() - 1000).toISOString() },
        scope,
      ),
    ).toThrow("ha caducado");
    expect(() =>
      validateVaultPayload(
        {
          ...payload,
          snapshot: {
            ...fleet,
            organization: { id: crypto.randomUUID(), name: "Otra empresa" },
          },
        },
        scope,
      ),
    ).toThrow("no pertenece");
  });
  it("conserva versiones e identificadores de los cambios pendientes", async () => {
    const rows = demoOperations(fleet),
      record = rows.find((r) => r.kind === "customers")!,
      payload = offlinePayload(fleet, rows, access);
    payload.outbox = [
      {
        id: crypto.randomUUID(),
        createdAt: now,
        command: {
          type: "save",
          value: {
            ...record,
            data: { ...record.data, name: "Cambio pendiente" },
          },
          expected: 1,
        },
      },
    ];
    const salt = newVaultSalt(),
      key = await deriveVaultKey(passphrase, salt),
      restored = await openVault(
        await sealVault(payload, scope, key, salt, 1),
        scope,
        key,
      );
    expect(restored.outbox[0].id).toBe(payload.outbox[0].id);
    expect(restored.outbox[0].command.expected).toBe(1);
    expect(() =>
      validateVaultPayload(
        { ...payload, outbox: [...payload.outbox, ...payload.outbox] },
        scope,
      ),
    ).toThrow("duplicados");
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
/** Small asynchronous IndexedDB transport for lifecycle races, not a crypto
 * substitute. Every encrypt/decrypt below uses the real WebCrypto engine. */
function vaultStorage(
  values: Map<string, VaultEnvelope>,
  pause: { readAt?: number; entered?(): void; release?: Promise<void> } = {},
) {
  const metrics = { reads: 0, writes: 0 };
  vi.stubGlobal("indexedDB", {
    open() {
      const request: { result: unknown; onsuccess?: () => void } = {
        result: {
          close() {},
          createObjectStore() {},
          transaction() {
            const tx: { oncomplete?: () => void; objectStore(): unknown } = {
              objectStore() {
                return {
                  get(scope: string) {
                    const read: { result?: VaultEnvelope; onsuccess?: () => void } = {};
                    const ordinal = ++metrics.reads;
                    queueMicrotask(() => void (async () => {
                      if (pause.readAt === ordinal) { pause.entered?.(); await pause.release; }
                      read.result = structuredClone(values.get(scope));
                      read.onsuccess?.();
                      queueMicrotask(() => tx.oncomplete?.());
                    })());
                    return read;
                  },
                  put(value: VaultEnvelope) { metrics.writes++; values.set(value.scope, structuredClone(value)); },
                };
              },
            };
            return tx;
          },
        },
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return metrics;
}
async function lifecycleFixture() {
  const salt = newVaultSalt(), key = await deriveVaultKey(passphrase, salt);
  const payload = offlinePayload(fleet, demoOperations(fleet), access);
  const customer = demoOperations(fleet).find((row) => row.kind === "customers")!;
  payload.outbox = [{
    id: "e0000000-0000-4000-8000-000000000901", createdAt: now,
    command: { type: "save", value: customer, expected: 1 },
  }];
  const envelope = await sealVault(payload, scope, key, salt, 1);
  return { envelope, payload, session: new VaultSession(scope, key, salt) };
}
describe("cerrar la capacidad offline durante operaciones asíncronas", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("no entrega texto descifrado si se bloquea mientras WebCrypto termina", async () => {
    const f = await lifecycleFixture(), stored = new Map([[scope, f.envelope]]);
    vaultStorage(stored);
    const entered = deferred<void>(), resume = deferred<void>();
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
      const plain = await decrypt(...args);
      entered.resolve(undefined); await resume.promise; return plain;
    });
    const result = f.session.read(true);
    await entered.promise;
    f.session.lock();
    const rejected = expect(result).rejects.toThrow("bloqueada");
    resume.resolve(undefined); await rejected;
    expect(stored.get(scope)).toEqual(f.envelope);
    expect(() => f.session.assertUnlocked()).toThrow("bloqueada");
  });
  it("no inicia decrypt después de bloquearse durante la lectura IndexedDB", async () => {
    const f = await lifecycleFixture(), entered = deferred<void>(), resume = deferred<void>();
    const stored = new Map([[scope, f.envelope]]);
    vaultStorage(stored, { readAt: 1, entered: () => entered.resolve(undefined), release: resume.promise });
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    const result = f.session.read(true);
    await entered.promise; f.session.lock();
    const rejected = expect(result).rejects.toThrow("bloqueada");
    resume.resolve(undefined); await rejected;
    expect(decrypt).not.toHaveBeenCalled();
    expect(stored.get(scope)).toEqual(f.envelope);
  });
  it("preserva el ciphertext y la cola si se cierra durante el cifrado de una actualización", async () => {
    const f = await lifecycleFixture(), stored = new Map([[scope, f.envelope]]);
    const metrics = vaultStorage(stored), entered = deferred<void>(), resume = deferred<void>();
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
      const cipher = await encrypt(...args);
      entered.resolve(undefined); await resume.promise; return cipher;
    });
    const result = f.session.update((value) => ({ ...value, outbox: [] }));
    await entered.promise; f.session.lock();
    const rejected = expect(result).rejects.toThrow("bloqueada");
    resume.resolve(undefined); await rejected;
    expect(metrics.writes).toBe(0);
    expect(stored.get(scope)).toEqual(f.envelope);
  });
  it("no ejecuta put si el bloqueo ocurre esperando la lectura CAS del almacén", async () => {
    const f = await lifecycleFixture(), stored = new Map([[scope, f.envelope]]);
    const entered = deferred<void>(), resume = deferred<void>();
    const metrics = vaultStorage(stored, { readAt: 2, entered: () => entered.resolve(undefined), release: resume.promise });
    const result = f.session.update((value) => ({ ...value, outbox: [] }));
    await entered.promise; f.session.lock();
    const rejected = expect(result).rejects.toThrow("bloqueada");
    resume.resolve(undefined); await rejected;
    expect(metrics.writes).toBe(0);
    expect(stored.get(scope)).toEqual(f.envelope);
  });
  it("una creación cancelada durante PBKDF2 no publica una copia tardía", async () => {
    const stored = new Map<string, VaultEnvelope>(), metrics = vaultStorage(stored);
    const entered = deferred<void>(), resume = deferred<void>(), controller = new AbortController();
    const derive = crypto.subtle.deriveKey.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "deriveKey").mockImplementation(async (...args) => {
      const key = await derive(...args);
      entered.resolve(undefined); await resume.promise; return key;
    });
    const result = VaultSession.create(scope, passphrase, offlinePayload(fleet, [], access), controller.signal);
    await entered.promise; controller.abort();
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    resume.resolve(undefined); await rejected;
    expect(metrics.writes).toBe(0); expect(stored.size).toBe(0);
  });
  it("un desbloqueo cancelado durante decrypt no devuelve una capacidad utilizable", async () => {
    const f = await lifecycleFixture(), stored = new Map([[scope, f.envelope]]);
    vaultStorage(stored);
    const entered = deferred<void>(), resume = deferred<void>(), controller = new AbortController();
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
      const plain = await decrypt(...args);
      entered.resolve(undefined); await resume.promise; return plain;
    });
    const result = VaultSession.unlock(scope, passphrase, true, controller.signal);
    await entered.promise; controller.abort();
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    resume.resolve(undefined); await rejected;
    expect(stored.get(scope)).toEqual(f.envelope);
  });
});
