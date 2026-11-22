import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/database.types";
import type { SubscriptionAccess } from "../domain/subscriptions";
import { SupabaseFleetRepository } from "../integrations/supabase/repository";
import { CloudOperationRepository } from "./operations";
import { offlinePayload } from "./offline-vault";
import type { VaultSession } from "./offline-vault";
import { assertCompanyFullPlan } from "../domain/company-full";

/** Permission-only refresh: never replay queued operations or extend a live FULL lease.
 * After an online-confirmed FULL→Basic downgrade, an already expired offline
 * lease can be reissued as Basic without deleting the encrypted draft/outbox. */
export async function refreshVaultAuthorization(
  session: VaultSession,
  client: SupabaseClient<Database>,
  signal?: AbortSignal,
) {
  const active = () => {
    session.assertUnlocked();
    signal?.throwIfAborted();
  };
  const [, userId, orgId] = session.scope.split("|");
  active();
  const identity = await client.auth.getUser();
  active();
  if (identity.error || identity.data.user?.id !== userId)
    throw Error(
      "Inicia sesión con la cuenta que creó esta copia antes de sincronizar.",
    );
  const { data, error, status } = await client.rpc("tc_organization_access", {
    p_org: orgId,
  });
  session.assertUnlocked();
  const denied = async (): Promise<never> => {
    try {
      await session.update(
        (value) => ({ ...value, expiresAt: new Date().toISOString() }),
        signal,
      );
    } catch {
      /* Keep the ciphertext if storage or the request scope closed. */
    } finally {
      session.lock();
    }
    throw Error(
      "Esta empresa ya no permite el acceso. La copia queda bloqueada hasta verificar los permisos de nuevo.",
    );
  };
  if (error && (error.code === "42501" || status === 401 || status === 403))
    return denied();
  if (error)
    throw Error(
      "No se han podido comprobar los permisos actuales. Los cambios siguen cifrados y pendientes.",
    );
  const access = data as unknown as SubscriptionAccess;
  try {
    assertCompanyFullPlan(access, orgId);
  } catch {
    return denied();
  }
  if (!access?.active || access.profile?.user_id !== userId) return denied();
  active();
  const previous = await session.read(true, signal);
  active();
  const candidate = offlinePayload(
    previous.snapshot,
    previous.operations,
    access,
  );
  // A signed-in, company-scoped RPC has independently authorized a *new* Basic
  // entitlement. An old expired FULL lease must not keep Basic data unusable.
  // Never extend a still-valid lease or renew a FULL entitlement here.
  const renewExpiredAsBasic =
    previous.access.plan === "full" &&
    access.plan === "limited" &&
    access.manual_full?.configured === true &&
    access.manual_full.status !== "active" &&
    Date.parse(previous.expiresAt) <= Date.parse(access.observed_at ?? "");
  const expiresAt = renewExpiredAsBasic
    ? candidate.expiresAt
    : new Date(
        Math.min(Date.parse(previous.expiresAt), Date.parse(candidate.expiresAt)),
      ).toISOString();
  const permissions = (value: SubscriptionAccess) =>
    JSON.stringify({
      active: value.active,
      plan: value.plan,
      features: value.features,
      role: value.company_role,
      write: value.can_write,
      manage: value.can_manage,
      manual: value.manual_full,
    });
  if (
    expiresAt === previous.expiresAt &&
    permissions(previous.access) === permissions(access)
  )
    return { payload: previous, changed: false };
  const payload = await session.update(
    (value) => ({
      ...value,
      access,
      // Rebase the seven-day offline window only for a fresh, reduced Basic
      // lease; keeping the old authorizedAt would violate the vault's TTL.
      authorizedAt: renewExpiredAsBasic ? candidate.authorizedAt : value.authorizedAt,
      expiresAt: renewExpiredAsBasic
        ? candidate.expiresAt
        : new Date(
            Math.min(Date.parse(value.expiresAt), Date.parse(expiresAt)),
          ).toISOString(),
    }),
    signal,
  );
  active();
  return { payload, changed: true };
}

/** Every replay uses the current server identity, company role and module flags.
 * UUIDs and expected versions remain unchanged, including after interrupted sync. */
export async function synchronizeVault(
  session: VaultSession,
  client: SupabaseClient<Database>,
  signal?: AbortSignal,
) {
  const active = () => { session.assertUnlocked(); signal?.throwIfAborted(); };
  const uncertain = () => Error(
    "Se cerró la copia después de iniciar un guardado. El resultado puede haberse registrado; compruébalo al volver a entrar. Los datos cifrados se conservan.",
  );
  active();
  const [, userId, orgId] = session.scope.split("|");
  const { data: identity, error: identityError } = await client.auth.getUser();
  active();
  if (identityError || identity.user?.id !== userId)
    throw Error(
      "Inicia sesión con la cuenta que creó esta copia antes de sincronizar.",
    );
  const denyCopy = async (): Promise<never> => {
    try {
      await session.update((value) => ({
        ...value, expiresAt: new Date().toISOString(),
      }), signal);
    } catch {
      // Storage failure must not preserve a usable RAM capability after an
      // explicit server denial. Keep the existing ciphertext and queued IDs.
    } finally {
      session.lock();
    }
    throw Error(
      "Esta empresa ya no permite el acceso. La copia queda bloqueada hasta verificar los permisos de nuevo.",
    );
  };
  const authorize = async () => {
    active();
    const { data, error, status } = await client.rpc("tc_organization_access", {
      p_org: orgId,
    });
    active();
    const access = data as unknown as SubscriptionAccess;
    if (error && (error.code === "42501" || status === 401 || status === 403))
      return denyCopy();
    if (error)
      throw Error(
        "No se han podido comprobar los permisos actuales. Los cambios siguen cifrados y pendientes.",
      );
    try { assertCompanyFullPlan(access, orgId); } catch { return denyCopy(); }
    if (!access?.active) return denyCopy();
    if (access.profile?.user_id !== userId)
      throw Error("La cuenta de la copia ha cambiado. Verifica de nuevo el acceso antes de sincronizar.");
    return access;
  };
  let access = await authorize();
  const fleet = new SupabaseFleetRepository(client, {
      id: orgId,
      name: access.profile?.company_name ?? "Empresa",
    }),
    cloud = new CloudOperationRepository(client, orgId);
  active();
  const snapshot = await fleet.load();
  active();
  let pending = await session.read(true, signal),
    sent = 0;
  active();
  for (const item of pending.outbox) {
    active();
    access = await authorize();
    active();
    const kind =
      item.command.type === "save"
        ? item.command.value.kind
        : item.command.kind;
    if (access.can_write === false || !access.features[kind]) {
      await session.update((v) => ({ ...v, access }), signal);
      active();
      throw Error(
        "Tus permisos actuales no permiten publicar uno de los cambios. Se conserva pendiente para su revisión.",
      );
    }
    active();
    try {
      // A write already sent may commit. Do not abort it and then pretend that
      // nothing happened; keep its UUID/version until a verified acknowledgment.
      await cloud.execute(item.command, snapshot);
    } catch (error) {
      try { active(); } catch { throw uncertain(); }
      throw error;
    }
    try {
      active();
      pending = await session.update((value) => ({
        ...value,
        outbox: value.outbox.filter((row) => row.id !== item.id),
      }), signal);
      active();
    } catch (error) {
      try { active(); } catch { throw uncertain(); }
      throw error;
    }
    sent++;
  }
  access = await authorize();
  active();
  const operations = await cloud.load(snapshot);
  active();
  await session.update((value) =>
    value.outbox.length ? value : offlinePayload(snapshot, operations, access),
    signal,
  );
  active();
  const payload = await session.read(false, signal);
  active();
  return { sent, payload };
}
