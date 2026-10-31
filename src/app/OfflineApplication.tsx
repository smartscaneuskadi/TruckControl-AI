import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { LockKeyhole, RefreshCw, WifiOff } from "lucide-react";
import { App } from "./App";
import { CompanyOfflineContext } from "./CompanyAccess";
import { FleetProvider, errorMessage } from "./FleetProvider";
import { OperationsProvider } from "./OperationsProvider";
import { SubscriptionProvider } from "./SubscriptionContext";
import { OfflineContext } from "./OfflineContext";
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
  const [session, setSession] = useState<VaultSession | null>(null),
    [payload, setPayload] = useState<VaultPayload | null>(null),
    [entry, setEntry] = useState(false);
  const [scopes, setScopes] = useState<string[]>([]),
    [selected, setSelected] = useState(""),
    [passphrase, setPassphrase] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const shell = useRef<HTMLDivElement>(null),
    banner = useRef<HTMLDivElement>(null);
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
    session?.lock();
    setSession(null);
    setPayload(null);
    setPassphrase("");
    setError("");
  }
  function openEntry() {
    setEntry(true);
    setError("");
    setPassphrase("");
  }
  useEffect(() => {
    if (!entry) return;
    let active = true;
    void listVaultScopes()
      .then((rows) => {
        if (active) {
          setScopes(rows);
          setSelected(rows[0] ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [entry]);
  useEffect(() => {
    if (!payload) return;
    const timer = setInterval(() => {
      if (Date.parse(payload.expiresAt) <= Date.now()) lock();
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
          session.lock();
          setSession(null);
          setPayload(null);
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
    setBusy(true);
    setError("");
    try {
      const next = await VaultSession.unlock(selected, passphrase);
      const value = await next.read();
      session?.lock();
      setSession(next);
      setPayload(value);
      setEntry(false);
      setPassphrase("");
      setRevision((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    const client = getSupabaseClient();
    if (!client || !session) return;
    setBusy(true);
    setError("");
    try {
      const result = await synchronizeVault(session, client);
      setPayload(result.payload);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
      try {
        setPayload(await session.read());
      } catch {
        lock();
        setEntry(true);
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
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
          if (session !== next) session?.lock();
          setSession(next);
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
                  <App />
                </OperationsProvider>
              </FleetProvider>
            </SubscriptionProvider>
          </CompanyOfflineContext>
        </div>
      ) : (
        children
      )}
      {!offline && !navigator.onLine && (
        <Button
          className="offline-entry-button"
          variant="secondary"
          icon={LockKeyhole}
          onClick={openEntry}
        >
          Abrir copia sin conexión
        </Button>
      )}
      {entry && (
        <Modal
          title="Acceso sin conexión"
          subtitle="Solo copias cifradas activadas previamente desde tu empresa"
          onClose={() => !busy && setEntry(false)}
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
