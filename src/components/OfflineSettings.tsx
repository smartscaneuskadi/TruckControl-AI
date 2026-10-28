import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import { useSubscription } from "../app/SubscriptionContext";
import { useOffline } from "../app/OfflineContext";
import { Button, Field } from "./ui";
import {
  VaultSession,
  offlinePayload,
  vaultScope,
} from "../data/offline-vault";
import type { SubscriptionAccess } from "../domain/subscriptions";
import { synchronizeVault } from "../data/offline-sync";
import { getSupabaseClient } from "../integrations/supabase/client";

export function OfflineCacheSync() {
  const offline = useOffline(),
    company = useCompany(),
    fleet = useFleet(),
    operations = useOperations(),
    subscription = useSubscription();
  useEffect(() => {
    if (offline.offline || !offline.session) return;
    const parts = offline.session.scope.split("|");
    if (
      company.mode !== "company" ||
      parts[1] !== company.user?.id ||
      parts[2] !== company.organization?.id
    ) {
      offline.lock();
      return;
    }
    if (!subscription.access?.active || operations.loading || operations.error)
      return;
    void offline.session
      .update((value) =>
        value.outbox.length
          ? value
          : offlinePayload(
              fleet.snapshot,
              operations.rows,
              subscription.access!,
            ),
      )
      .catch(() => {
        /* Keep the previous encrypted copy; never replace it with plaintext. */
      });
  }, [
    offline.session,
    offline.offline,
    company.mode,
    company.user?.id,
    company.organization?.id,
    fleet.snapshot,
    operations.rows,
    operations.loading,
    operations.error,
    subscription.access,
  ]);
  return null;
}
export function OfflineSettings() {
  const offline = useOffline(),
    company = useCompany(),
    fleet = useFleet(),
    operations = useOperations(),
    client = getSupabaseClient();
  const [passphrase, setPassphrase] = useState(""),
    [existing, setExisting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(0);
  useEffect(() => {
    if (offline.session)
      void offline.session
        .read(true)
        .then((value) => setPending(value.outbox.length));
  }, [offline.session, operations.rows]);
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!client || !company.user || !company.organization) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const identity = await client.auth.getUser();
      if (identity.error || identity.data.user?.id !== company.user.id)
        throw Error("Vuelve a iniciar sesión para verificar tu identidad.");
      const { data, error } = await client.rpc("tc_organization_access", {
        p_org: company.organization.id,
      });
      if (error)
        throw Error("No se pueden comprobar los permisos de esta empresa.");
      const access = data as unknown as SubscriptionAccess;
      const scope = vaultScope(
        String(import.meta.env.VITE_SUPABASE_URL),
        company.user.id,
        company.organization.id,
      );
      const session = existing
        ? await VaultSession.unlock(scope, passphrase, true)
        : await VaultSession.create(
            scope,
            passphrase,
            offlinePayload(fleet.snapshot, operations.rows, access),
          );
      if (!access.active) {
        session.lock();
        throw Error("La empresa no permite activar el acceso sin conexión.");
      }
      offline.attach(session);
      setPassphrase("");
      setMessage(
        "Copia cifrada habilitada para esta cuenta y empresa. Conserva la frase; no se guarda en el dispositivo.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (!client || !offline.session) return;
    setBusy(true);
    setError("");
    try {
      const result = await synchronizeVault(offline.session, client);
      setPending(result.payload.outbox.length);
      await fleet.refresh();
      await operations.refresh();
      setMessage(
        `${result.sent} cambios sincronizados con los permisos actuales.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card">
      <span className="settings-icon">
        <LockKeyhole size={25} />
      </span>
      <h2>Copia cifrada sin conexión</h2>
      <p>
        Guarda una copia privada para consultar tu flota y preparar operaciones
        durante un máximo de siete días. Camiones, conductores y apuntes
        contables se editan con conexión. Los cambios pendientes conservan su
        versión y se validan antes de sincronizar.
      </p>
      {offline.offline ? (
        <>
          <p>
            {pending} cambios pendientes. Si aparece un conflicto, se conserva
            el cambio y no se sobrescribe el registro del servidor.
          </p>
          <Button variant="secondary" onClick={offline.lock}>
            Bloquear copia
          </Button>
        </>
      ) : company.mode !== "company" ? (
        <Button variant="secondary" onClick={offline.openEntry}>
          Abrir una copia guardada
        </Button>
      ) : offline.session ? (
        <>
          <p>Copia desbloqueada · {pending} cambios pendientes.</p>
          <Button icon={RefreshCw} disabled={busy} onClick={() => void sync()}>
            Sincronizar cambios pendientes
          </Button>
          <Button variant="ghost" onClick={offline.lock}>
            Bloquear copia local
          </Button>
        </>
      ) : (
        <form className="access-form" onSubmit={prepare}>
          <Field label="Frase para proteger tu copia">
            <input
              type="password"
              minLength={12}
              maxLength={256}
              required
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </Field>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={existing}
              onChange={(e) => setExisting(e.target.checked)}
            />{" "}
            Ya tengo una copia cifrada en este navegador
          </label>
          <Button
            type="submit"
            disabled={busy || operations.loading || Boolean(operations.error)}
          >
            {busy
              ? "Preparando…"
              : existing
                ? "Desbloquear mi copia"
                : "Activar copia cifrada"}
          </Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
