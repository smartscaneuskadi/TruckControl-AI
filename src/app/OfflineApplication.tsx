import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { LockKeyhole, RefreshCw, WifiOff } from "lucide-react";
import { App } from "./App";
import { CompanyOfflineContext } from "./CompanyAccess";
import { FleetProvider, errorMessage } from "./FleetProvider";
import { OperationsProvider } from "./OperationsProvider";
import { TyresProvider } from "./TyresProvider";
import { PersonalMailProvider } from "./PersonalMailProvider";
import { SubscriptionProvider } from "./SubscriptionContext";
import { OfflineContext } from "./OfflineContext";
import { endPrivateSessions, sessionExitEvent } from "./session-events";
import { listVaultScopes, VaultSession } from "../data/offline-vault";
import type { VaultPayload } from "../data/offline-vault";
import { synchronizeVault } from "../data/offline-sync";
import { getSupabaseClient } from "../integrations/supabase/client";
import { Button, Field, Modal } from "../components/ui";
import type { FleetRepository } from "../data/repository";

class OfflineFleetRepository implements FleetRepository {
  constructor(private session: VaultSession) {}
  async load() {
    return (await this.session.read()).snapshot;
  }
  async save(): Promise<void> {
    throw Error(
      "La edición de camiones, conductores y contabilidad requiere conexión. Los módulos de operaciones admiten cambios pendientes sin conexión.",
    );
  }
  async reset(): Promise<never> {
    throw Error("Esta copia pertenece a una empresa y se conserva cifrada.");
  }
}
export function OfflineApplication({ children }: { children: ReactNode }) {
  const [sdkClient] = useState(getSupabaseClient);
  const [session, setSession] = useState<VaultSession | null>(null),
    [payload, setPayload] = useState<VaultPayload | null>(null),
    [entry, setEntry] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [notice, setNotice] = useState("");
  const [scopes, setScopes] = useState<string[]>([]),
    [selected, setSelected] = useState(""),
    [passphrase, setPassphrase] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const shell = useRef<HTMLDivElement>(null),
    banner = useRef<HTMLDivElement>(null);
  const currentSession = useRef<VaultSession | null>(null);
  const generation = useRef(0), mounted = useRef(true), running = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const active = (version: number, controller: AbortController) =>
    mounted.current && generation.current === version &&
    operation.current === controller && !controller.signal.aborted;
  // The wrapper outlives CompanyAccessProvider. Close its RAM capabilities
  // synchronously, including work still deriving a key or awaiting a response.
  useLayoutEffect(() => {
    mounted.current = true;
    const stop = () => lock();
    window.addEventListener(sessionExitEvent, stop);
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      generation.current++;
      operation.current?.abort();
      operation.current = null;
      running.current = false;
      currentSession.current?.lock();
      currentSession.current = null;
      window.removeEventListener(sessionExitEvent, stop);
      window.removeEventListener("pagehide", stop);
    };
  }, []);
  useEffect(() => {
    if (!sdkClient) return;
    let alive = true;
    const { data: { subscription } } = sdkClient.auth.onAuthStateChange((event, identity) => {
      if (!alive || !mounted.current || event === "INITIAL_SESSION") return;
      // CompanyAccessProvider is unmounted while an offline copy is open.
      // Observe the real shared SDK here too, including logout in another tab.
      if (event === "SIGNED_OUT") { endPrivateSessions(); return; }
      const owner = currentSession.current?.scope.split("|")[1];
      if (owner && identity?.user.id && identity.user.id !== owner) endPrivateSessions();
      // A null initial session is not logout; same-user token refresh does not
      // revoke a deliberately unlocked, passphrase-protected offline copy.
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [sdkClient]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!payload || !session || !shell.current || !banner.current) return;
    const resize = () =>
      shell.current?.style.setProperty(
        "--offline-bar-height",
        `${banner.current?.offsetHeight ?? 0}px`,
      );
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(banner.current);
    return () => observer.disconnect();
  }, [Boolean(payload && session)]);
  function lock() {
    generation.current++;
    operation.current?.abort();
    operation.current = null;
    running.current = false;
    currentSession.current?.lock();
    currentSession.current = null;
    setSession(null);
    setPayload(null);
    setEntry(false);
    setScopes([]);
    setSelected("");
    setPassphrase("");
    setError("");
    setBusy(false);
  }
  function openEntry() {
    if (running.current) return;
    setNotice("");
    setEntry(true);
    setError("");
    setPassphrase("");
  }
  useEffect(() => {
    if (!entry) return;
    let alive = true;
    const version = generation.current;
    void listVaultScopes()
      .then((rows) => {
        if (alive && generation.current === version) {
          setScopes(rows);
          setSelected(rows[0] ?? "");
        }
      })
      .catch((e) => {
        if (alive && generation.current === version) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [entry]);
  useEffect(() => {
    if (!payload) return;
    const timer = setInterval(() => {
      if (currentSession.current === session && Date.parse(payload.expiresAt) <= Date.now()) lock();
    }, 30000);
    return () => clearInterval(timer);
  }, [payload, session]);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          if (currentSession.current === session) lock();
        },
        30 * 60 * 1000,
      );
    };
    resetTimer();
    document.addEventListener("pointerdown", resetTimer, { passive: true });
    document.addEventListener("keydown", resetTimer);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", resetTimer);
      document.removeEventListener("keydown", resetTimer);
    };
  }, [session]);
  async function unlock() {
    if (running.current) return;
    const controller = new AbortController(), version = generation.current;
    operation.current = controller;
    running.current = true;
    setBusy(true);
    setError("");
    let next: VaultSession | null = null;
    try {
      next = await VaultSession.unlock(selected, passphrase, false, controller.signal);
      if (!active(version, controller)) { next.lock(); return; }
      const value = await next.read(false, controller.signal);
      if (!active(version, controller)) { next.lock(); return; }
      if (currentSession.current !== next) currentSession.current?.lock();
      currentSession.current = next;
      setSession(next);
      setPayload(value);
      setNotice("");
      setEntry(false);
      setPassphrase("");
      setRevision((n) => n + 1);
    } catch (e) {
      next?.lock();
      if (active(version, controller)) setError(errorMessage(e));
    } finally {
      if (active(version, controller)) {
        operation.current = null;
        running.current = false;
        setBusy(false);
      }
    }
  }
  async function sync() {
    const client = getSupabaseClient(), current = currentSession.current;
    if (!client || !current || running.current) return;
    const controller = new AbortController(), version = generation.current;
    operation.current = controller;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await synchronizeVault(current, client, controller.signal);
      if (!active(version, controller) || currentSession.current !== current) return;
      setPayload(result.payload);
      setRevision((n) => n + 1);
    } catch (e) {
      if (!active(version, controller) || currentSession.current !== current) return;
      setError(errorMessage(e));
      try {
        const value = await current.read(false, controller.signal);
        if (active(version, controller) && currentSession.current === current) setPayload(value);
      } catch {
        if (active(version, controller) && currentSession.current === current) {
          const denied = errorMessage(e).includes("ya no permite el acceso");
          lock();
          // Public notice only: a remounted account may emit session-exit
          // again. It must not erase the denial or restore any private entry.
          setNotice(denied
            ? "Esta empresa ya no permite el acceso. La copia permanece cifrada y bloqueada hasta verificar de nuevo tus permisos."
            : "La copia está bloqueada. Conéctate y verifica tus permisos antes de volver a abrirla. Los datos cifrados se conservan.");
        }
      }
    } finally {
      if (active(version, controller)) {
        operation.current = null;
        running.current = false;
        setBusy(false);
      }
    }
  }
  const offline = Boolean(payload && session);
  return (
    <OfflineContext.Provider
      value={{
        session,
        offline,
        openEntry,
        attach: (next) => {
          if (!mounted.current) { next.lock(); return; }
          if (currentSession.current !== next) currentSession.current?.lock();
          currentSession.current = next;
          setSession(next);
          setPayload(null);
        },
        lock,
      }}
    >
      {offline && payload && session ? (
        <div className="offline-mode" ref={shell}>
          <div className="offline-workspace-banner" role="status" ref={banner}>
            <WifiOff size={18} />
            <div>
              <strong>Modo sin conexión · copia cifrada</strong>
              <span>
                Caduca el {payload.expiresAt.slice(0, 10)}. Solo se publican
                cambios con permisos verificados al conectar.
              </span>
            </div>
            <Button
              variant="secondary"
              icon={RefreshCw}
              disabled={busy}
              onClick={() => void sync()}
            >
              {busy ? "Sincronizando…" : "Sincronizar"}
            </Button>
            <Button
              variant="secondary"
              icon={LockKeyhole}
              disabled={busy}
              onClick={lock}
            >
              Bloquear
            </Button>
          </div>
          {error && (
            <p role="alert" className="offline-sync-error">
              {error}
            </p>
          )}
          <CompanyOfflineContext
            user={
              {
                id: session.scope.split("|")[1],
                email: payload.access.profile?.email,
              } as User
            }
            organization={payload.snapshot.organization}
            onExit={lock}
          >
            <SubscriptionProvider
              value={{
                enabled: true,
                features: {
                  ...payload.access.features,
                  documents: false,
                  gmail: false,
                  invoice_ai: false,
                  document_ai: false,
                  team: false,
                },
                access: payload.access,
                refresh: () => {},
                openPlans: lock,
              }}
            >
              <FleetProvider
                key={`offline:${session.scope}:${revision}`}
                repository={new OfflineFleetRepository(session)}
                mode="company"
                onDemo={lock}
              >
                <OperationsProvider>
                  <TyresProvider>
                    <PersonalMailProvider>
                      <App />
                    </PersonalMailProvider>
                  </TyresProvider>
                </OperationsProvider>
              </FleetProvider>
            </SubscriptionProvider>
          </CompanyOfflineContext>
        </div>
      ) : (
        children
      )}
      {!offline && !online && (
        <Button
          className="offline-entry-button"
          variant="secondary"
          icon={LockKeyhole}
          onClick={openEntry}
        >
          Abrir copia sin conexión
        </Button>
      )}
      {notice && <Modal
        title="Copia bloqueada"
        subtitle="Aviso de acceso sin datos de empresa"
        onClose={() => setNotice("")}
      >
        <p role="alert">{notice}</p>
        <div className="modal-actions"><Button onClick={() => setNotice("")}>Entendido</Button></div>
      </Modal>}
      {entry && (
        <Modal
          title="Acceso sin conexión"
          subtitle="Solo copias cifradas activadas previamente desde tu empresa"
          onClose={() => { if (!running.current) { setEntry(false); setPassphrase(""); } }}
        >
          {!scopes.length ? (
            <p>
              No hay copias cifradas en este navegador. Puedes seguir explorando
              la demostración sin conexión.
            </p>
          ) : (
            <form
              className="access-form"
              onSubmit={(e) => {
                e.preventDefault();
                void unlock();
              }}
            >
              <p>
                Usa tu frase de desbloqueo. La copia se bloquea al cerrar esta
                sesión o tras 30 minutos de inactividad.
              </p>
              <Field label="Copia guardada">
                <select
                  disabled={busy}
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {scopes.map((scope, i) => (
                    <option key={scope} value={scope}>
                      Copia {i + 1} · empresa {scope.split("|")[2]?.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Frase de desbloqueo">
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="off"
                  disabled={busy}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? "Desbloqueando…" : "Abrir copia cifrada"}
              </Button>
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </OfflineContext.Provider>
  );
}
