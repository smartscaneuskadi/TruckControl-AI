import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/database.types";
import type { SubscriptionAccess } from "../domain/subscriptions";
import { SupabaseFleetRepository } from "../integrations/supabase/repository";
import { CloudOperationRepository } from "./operations";
import { offlinePayload } from "./offline-vault";
import type { VaultSession } from "./offline-vault";

/** Every replay uses the current server identity, company role and module flags.
 * UUIDs and expected versions remain unchanged, including after interrupted sync. */
export async function synchronizeVault(
  session: VaultSession,
  client: SupabaseClient<Database>,
) {
  const [, userId, orgId] = session.scope.split("|");
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || identity.user?.id !== userId)
    throw Error(
      "Inicia sesión con la cuenta que creó esta copia antes de sincronizar.",
    );
  const authorize = async () => {
    const { data, error } = await client.rpc("tc_organization_access", {
      p_org: orgId,
    });
    const access = data as unknown as SubscriptionAccess;
    if (error)
      throw Error(
        "No se han podido comprobar los permisos actuales. Los cambios siguen cifrados y pendientes.",
      );
    if (!access?.active) {
      await session.update((v) => ({
        ...v,
        expiresAt: new Date().toISOString(),
      }));
      throw Error(
        "Esta empresa ya no permite el acceso. La copia queda bloqueada hasta verificar los permisos de nuevo.",
      );
    }
    return access;
  };
  let access = await authorize();
  const fleet = new SupabaseFleetRepository(client, {
      id: orgId,
      name: access.profile?.company_name ?? "Empresa",
    }),
    cloud = new CloudOperationRepository(client, orgId);
  const snapshot = await fleet.load();
  let pending = await session.read(true),
    sent = 0;
  for (const item of pending.outbox) {
    access = await authorize();
    const kind =
      item.command.type === "save"
        ? item.command.value.kind
        : item.command.kind;
    if (access.can_write === false || !access.features[kind]) {
      await session.update((v) => ({ ...v, access }));
      throw Error(
        "Tus permisos actuales no permiten publicar uno de los cambios. Se conserva pendiente para su revisión.",
      );
    }
    await cloud.execute(item.command, snapshot);
    pending = await session.update((value) => ({
      ...value,
      outbox: value.outbox.filter((row) => row.id !== item.id),
    }));
    sent++;
  }
  access = await authorize();
  const operations = await cloud.load(snapshot);
  await session.update((value) =>
    value.outbox.length ? value : offlinePayload(snapshot, operations, access),
  );
  return { sent, payload: await session.read() };
}
