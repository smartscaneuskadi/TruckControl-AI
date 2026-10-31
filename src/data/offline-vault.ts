import { z } from "zod";
import { validateSnapshot } from "../domain/models";
import type { FleetSnapshot } from "../domain/models";
import {
  applyOperation,
  parseOperation,
  validateOperations,
} from "../domain/operations";
import type { OperationCommand, OperationRecord } from "../domain/operations";
import { noFeatures } from "../domain/subscriptions";
import type { SubscriptionAccess } from "../domain/subscriptions";

export const vaultIterations = 600_000;
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const base64 = (value: Uint8Array) => {
  let out = "";
  for (const b of value) out += String.fromCharCode(b);
  return btoa(out);
};
export interface VaultEnvelope {
  v: 1;
  scope: string;
  salt: string;
  iv: string;
  cipher: string;
  revision: number;
}
export interface OfflineChange {
  id: string;
  command: OperationCommand;
  createdAt: string;
}
export interface VaultPayload {
  v: 1;
  snapshot: FleetSnapshot;
  operations: OperationRecord[];
  access: SubscriptionAccess;
  authorizedAt: string;
  expiresAt: string;
  outbox: OfflineChange[];
}
export function vaultScope(
  projectUrl: string,
  userId: string,
  organizationId: string,
) {
  z.uuid().parse(userId);
  z.uuid().parse(organizationId);
  return `${new URL(projectUrl).origin}|${userId}|${organizationId}`;
}
export function validateVaultPayload(
  raw: unknown,
  scope: string,
  allowExpired = false,
): VaultPayload {
  const p = z
    .object({
      v: z.literal(1),
      snapshot: z.unknown(),
      operations: z.array(z.unknown()),
      access: z.record(z.string(), z.unknown()),
      authorizedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      outbox: z
        .array(
          z.object({
            id: z.uuid(),
            createdAt: z.iso.datetime(),
            command: z.unknown(),
          }),
        )
        .max(1000),
    })
    .parse(raw);
  const snapshot = validateSnapshot(p.snapshot),
    parts = scope.split("|");
  const access = p.access as unknown as SubscriptionAccess;
  if (
    parts.length !== 3 ||
    snapshot.organization.id !== parts[2] ||
    access.profile?.user_id !== parts[1] ||
    !access.active
  )
    throw Error("La copia no pertenece a esta cuenta y empresa.");
  if (
    !allowExpired &&
    (Date.parse(p.expiresAt) <= Date.now() ||
      Date.parse(p.authorizedAt) > Date.now() + 300_000)
  )
    throw Error(
      "La autorización de la copia ha caducado. Conéctate y verifica tus permisos para renovarla.",
    );
  if (
    Date.parse(p.expiresAt) - Date.parse(p.authorizedAt) >
    7 * 86400000 + 1000
  )
    throw Error("La copia supera el periodo de uso sin conexión.");
  const operations = validateOperations(p.operations, snapshot),
    features = { ...noFeatures };
  for (const key of Object.keys(features) as (keyof typeof features)[])
    features[key] = access.features?.[key] === true;
  const outbox: OfflineChange[] = p.outbox.map((item) => {
    const c = z
      .object({
        type: z.enum(["save", "delete"]),
        expected: z.number().int().positive().nullable(),
        value: z.unknown().optional(),
        id: z.uuid().optional(),
        kind: z
          .enum([
            "trailers",
            "customers",
            "trips",
            "maintenance",
            "fuel",
            "deadlines",
            "alerts",
          ])
          .optional(),
      })
      .parse(item.command);
    const command: OperationCommand =
      c.type === "save"
        ? { type: "save", value: parseOperation(c.value), expected: c.expected }
        : {
            type: "delete",
            id: z.uuid().parse(c.id),
            kind: c.kind!,
            expected: z.number().int().positive().parse(c.expected),
          };
    if (command.type === "delete" && !command.kind)
      throw Error("Cambio pendiente no válido.");
    return { ...item, command };
  });
  if (new Set(outbox.map((c) => c.id)).size !== outbox.length)
    throw Error("La cola contiene cambios duplicados.");
  return {
    ...p,
    snapshot,
    operations,
    access: { ...access, features },
    outbox,
  };
}
export async function deriveVaultKey(passphrase: string, salt: string) {
  if (passphrase.length < 12 || passphrase.length > 256)
    throw Error("Usa una frase de al menos 12 caracteres.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const decoded = bytes(salt);
  if (decoded.length !== 16) throw Error("Copia cifrada no válida.");
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: decoded,
      iterations: vaultIterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export function newVaultSalt() {
  return base64(crypto.getRandomValues(new Uint8Array(16)));
}
export async function sealVault(
  value: VaultPayload,
  scope: string,
  key: CryptoKey,
  salt: string,
  revision: number,
): Promise<VaultEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(
        `truckcontrol.offline.v1|${scope}|${revision}|${salt}`,
      ),
    },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return {
    v: 1,
    scope,
    salt,
    iv: base64(iv),
    cipher: base64(new Uint8Array(cipher)),
    revision,
  };
}
export async function openVault(
  envelope: VaultEnvelope,
  scope: string,
  key: CryptoKey,
  allowExpired = false,
): Promise<VaultPayload> {
  if (
    envelope.v !== 1 ||
    envelope.scope !== scope ||
    !Number.isSafeInteger(envelope.revision) ||
    envelope.revision < 1
  )
    throw Error("Copia cifrada no válida.");
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(envelope.iv),
        additionalData: new TextEncoder().encode(
          `truckcontrol.offline.v1|${scope}|${envelope.revision}|${envelope.salt}`,
        ),
      },
      key,
      bytes(envelope.cipher),
    );
  } catch {
    throw Error("La frase no es correcta o la copia cifrada ha cambiado.");
  }
  return validateVaultPayload(
    JSON.parse(new TextDecoder().decode(plain)),
    scope,
    allowExpired,
  );
}
const databaseName = "truckcontrol-encrypted-offline-v1";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("vaults", { keyPath: "scope" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        Error("No se puede abrir el almacenamiento cifrado de este navegador."),
      );
  });
}
async function readEnvelope(scope: string) {
  const db = await database();
  try {
    return await new Promise<VaultEnvelope | undefined>((resolve, reject) => {
      const tx = db.transaction("vaults", "readonly"),
        r = tx.objectStore("vaults").get(scope);
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function compareAndWrite(value: VaultEnvelope, expected: number | null) {
  const db = await database();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction("vaults", "readwrite"),
        store = tx.objectStore("vaults"),
        r = store.get(value.scope);
      let success = false;
      r.onsuccess = () => {
        if ((r.result?.revision ?? null) !== expected) return;
        store.put(value);
        success = true;
      };
      tx.oncomplete = () => resolve(success);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          tx.error ?? Error("No se ha podido conservar la copia cifrada."),
        );
    });
  } finally {
    db.close();
  }
}
export async function listVaultScopes() {
  const db = await database();
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction("vaults", "readonly"),
        r = tx.objectStore("vaults").getAllKeys();
      tx.oncomplete = () => resolve(r.result.map(String));
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export class VaultSession {
  private key: CryptoKey | null;
  constructor(
    readonly scope: string,
    key: CryptoKey,
    private salt: string,
  ) {
    this.key = key;
  }
  lock() {
    this.key = null;
  }
  async read(allowExpired = false) {
    if (!this.key) throw Error("La copia está bloqueada.");
    const envelope = await readEnvelope(this.scope);
    if (!envelope) throw Error("No hay una copia para esta cuenta.");
    return openVault(envelope, this.scope, this.key, allowExpired);
  }
  async update(change: (value: VaultPayload) => VaultPayload) {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!this.key) throw Error("La copia está bloqueada.");
      const old = await readEnvelope(this.scope);
      if (!old) throw Error("No hay una copia para esta cuenta.");
      const next = validateVaultPayload(
        change(await openVault(old, this.scope, this.key, true)),
        this.scope,
        true,
      );
      const envelope = await sealVault(
        next,
        this.scope,
        this.key,
        this.salt,
        old.revision + 1,
      );
      if (!this.key) throw Error("La copia está bloqueada.");
      if (await compareAndWrite(envelope, old.revision)) return next;
    }
    throw Error(
      "Otra ventana está actualizando la copia. Reintenta sin cerrar el formulario.",
    );
  }
  async enqueue(command: OperationCommand) {
    return this.update((value) => {
      validateVaultPayload(value, this.scope);
      const kind = command.type === "save" ? command.value.kind : command.kind;
      if (value.access.can_write === false || !value.access.features[kind])
        throw Error("La copia no permite editar este módulo.");
      if (value.outbox.length >= 1000)
        throw Error(
          "Sincroniza los cambios pendientes antes de añadir más registros.",
        );
      const operations = applyOperation(
        value.operations,
        command,
        value.snapshot,
      );
      return {
        ...value,
        operations,
        outbox: [
          ...value.outbox,
          {
            id: crypto.randomUUID(),
            command,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });
  }
  static async create(
    scope: string,
    passphrase: string,
    payload: VaultPayload,
  ) {
    if (await readEnvelope(scope))
      throw Error(
        "Ya existe una copia cifrada. Desbloquéala con su frase para conservar los cambios pendientes.",
      );
    const salt = newVaultSalt(),
      key = await deriveVaultKey(passphrase, salt),
      valid = validateVaultPayload(payload, scope);
    if (
      !(await compareAndWrite(
        await sealVault(valid, scope, key, salt, 1),
        null,
      ))
    )
      throw Error("Ya existe una copia para esta empresa.");
    return new VaultSession(scope, key, salt);
  }
  static async unlock(scope: string, passphrase: string, allowExpired = false) {
    const envelope = await readEnvelope(scope);
    if (!envelope) throw Error("No hay una copia guardada para esta cuenta.");
    const key = await deriveVaultKey(passphrase, envelope.salt);
    await openVault(envelope, scope, key, allowExpired);
    return new VaultSession(scope, key, envelope.salt);
  }
}
export function offlinePayload(
  snapshot: FleetSnapshot,
  operations: OperationRecord[],
  access: SubscriptionAccess,
): VaultPayload {
  if (!access.active || !access.profile)
    throw Error("Verifica primero los permisos de tu cuenta.");
  const now = Date.now(),
    entitlement = Date.parse(
      access.profile.status === "trial"
        ? access.profile.trial_ends_at
        : (access.profile.paid_until ?? ""),
    );
  if (!Number.isFinite(entitlement) || entitlement <= now)
    throw Error("Tu periodo de acceso ha caducado.");
  return {
    v: 1,
    snapshot,
    operations,
    access,
    authorizedAt: new Date(now).toISOString(),
    expiresAt: new Date(
      Math.min(now + 7 * 86400000, entitlement),
    ).toISOString(),
    outbox: [],
  };
}
