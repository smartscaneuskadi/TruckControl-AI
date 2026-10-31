import { describe, expect, it } from "vitest";
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
} from "./offline-vault";
import { demoFeatures } from "../domain/subscriptions";
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
