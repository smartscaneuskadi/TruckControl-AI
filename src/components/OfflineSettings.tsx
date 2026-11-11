import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import { useSubscription } from "../app/SubscriptionContext";
import { useOffline } from "../app/OfflineContext";
import { sessionExitEvent } from "../app/session-events";
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
    const controller = new AbortController();
    void offline.session
      .update((value) =>
        value.outbox.length
          ? value
          : offlinePayload(
              fleet.snapshot,
              operations.rows,
              subscription.access!,
            ),
        controller.signal,
      )
      .catch(() => {
        /* Keep the previous encrypted copy; never replace it with plaintext. */
      });
    return () => controller.abort();
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
  const key = `${company.mode}:${company.user?.id ?? ""}:${company.organization?.id ?? ""}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const mounted = useRef(true), generation = useRef(0), running = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const active = (version: number, controller: AbortController, scope: string) =>
    mounted.current && generation.current === version && currentKey.current === scope &&
    operation.current === controller && !controller.signal.aborted;
  useLayoutEffect(() => {
    mounted.current = true;
    const stop = () => {
      generation.current++;
      operation.current?.abort();
      operation.current = null;
      running.current = false;
      setPassphrase(""); setPending(0); setMessage(""); setError(""); setBusy(false);
    };
    window.addEventListener(sessionExitEvent, stop);
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      generation.current++;
      operation.current?.abort();
      operation.current = null;
      running.current = false;
      window.removeEventListener(sessionExitEvent, stop);
      window.removeEventListener("pagehide", stop);
    };
  }, []);
  useLayoutEffect(() => {
    generation.current++;
    operation.current?.abort();
    operation.current = null;
    running.current = false;
    setPassphrase(""); setPending(0); setMessage(""); setError(""); setBusy(false);
  }, [key]);
  useEffect(() => {
    const session = offline.session, version = generation.current, scope = currentKey.current;
    let alive = true;
    if (!session || session.scope.split("|")[1] !== company.user?.id ||
        session.scope.split("|")[2] !== company.organization?.id) { setPending(0); return; }
    void session.read(true).then((value) => {
      if (alive && mounted.current && generation.current === version && currentKey.current === scope)
        setPending(value.outbox.length);
    }).catch(() => {
      if (alive && mounted.current && generation.current === version && currentKey.current === scope) setPending(0);
    });
    return () => { alive = false; };
  }, [offline.session, operations.rows, key]);
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!client || !company.user || !company.organization || running.current) return;
    const controller = new AbortController(), version = generation.current, scopeKey = key;
    const ownerId = company.user.id, organizationId = company.organization.id;
    operation.current = controller; running.current = true;
    setBusy(true); setError(""); setMessage("");
    let next: VaultSession | null = null;
    try {
      const identity = await client.auth.getUser();
      if (!active(version, controller, scopeKey)) return;
      if (identity.error || identity.data.user?.id !== ownerId)
        throw Error("Vuelve a iniciar sesión para verificar tu identidad.");
      const { data, error } = await client.rpc("tc_organization_access", { p_org: organizationId });
      if (!active(version, controller, scopeKey)) return;
      if (error) throw Error("No se pueden comprobar los permisos de esta empresa.");
      const access = data as unknown as SubscriptionAccess;
      if (!access?.active || access.profile?.user_id !== ownerId)
        throw Error("La empresa no permite activar el acceso sin conexión.");
      const scope = vaultScope(String(import.meta.env.VITE_SUPABASE_URL), ownerId, organizationId);
      next = existing
        ? await VaultSession.unlock(scope, passphrase, true, controller.signal)
        : await VaultSession.create(scope, passphrase,
            offlinePayload(fleet.snapshot, operations.rows, access), controller.signal);
      if (!active(version, controller, scopeKey)) { next.lock(); return; }
      next.assertUnlocked();
      offline.attach(next);
      setPassphrase("");
      setMessage("Copia cifrada habilitada para esta cuenta y empresa. Conserva la frase; no se guarda en el dispositivo.");
    } catch (e) {
      next?.lock();
      if (active(version, controller, scopeKey)) setError(errorMessage(e));
    } finally {
      if (active(version, controller, scopeKey)) {
        operation.current = null; running.current = false; setBusy(false);
      }
    }
  }
  async function sync() {
    const session = offline.session;
    if (!client || !session || running.current) return;
    const controller = new AbortController(), version = generation.current, scopeKey = key;
    operation.current = controller; running.current = true;
    setBusy(true); setError("");
    try {
      const result = await synchronizeVault(session, client, controller.signal);
      if (!active(version, controller, scopeKey)) return;
      setPending(result.payload.outbox.length);
      await fleet.refresh();
      if (!active(version, controller, scopeKey)) return;
      await operations.refresh();
      if (!active(version, controller, scopeKey)) return;
      setMessage(`${result.sent} cambios sincronizados con los permisos actuales.`);
    } catch (e) {
      if (active(version, controller, scopeKey)) setError(errorMessage(e));
    } finally {
      if (active(version, controller, scopeKey)) {
        operation.current = null; running.current = false; setBusy(false);
      }
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
          <Button variant="secondary" onClick={offline.openEntry}>
            Abrir mi copia sin conexión
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
              disabled={busy}
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </Field>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={existing}
              disabled={busy}
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
