import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FleetSnapshot } from "../domain/models";
import { applyCommand } from "../domain/commands";
import type { FleetCommand } from "../domain/commands";
import { LocalFleetRepository } from "../data/repository";
import type { FleetRepository } from "../data/repository";

interface FleetContextValue {
  snapshot: FleetSnapshot;
  busy: boolean;
  execute(command: FleetCommand): Promise<void>;
  reset(): Promise<void>;
  refresh(): Promise<void>;
  notify(message: string): void;
}
const FleetContext = createContext<FleetContextValue | null>(null);
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Ha ocurrido un error. Inténtalo de nuevo.";

export function FleetProvider({
  children,
  repository: supplied,
  mode = "demo",
  onDemo,
}: {
  children: ReactNode;
  repository?: FleetRepository;
  mode?: "demo" | "company";
  onDemo?(): void;
}) {
  const [repository] = useState<FleetRepository>(
    () =>
      supplied ??
      new LocalFleetRepository({
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
      }),
  );
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const current = useRef<FleetSnapshot | null>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((data) => {
        if (active) {
          current.current = data;
          setSnapshot(data);
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [repository, attempt]);
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timeout);
    }
  }, [toast]);

  async function execute(command: FleetCommand) {
    if (!current.current || saving.current)
      throw new Error("Espera a que termine el guardado actual.");
    saving.current = true;
    setBusy(true);
    try {
      const next = applyCommand(current.current, command);
      const saved = repository.execute
        ? await repository.execute(command)
        : (await repository.save(next), next);
      current.current = saved;
      setSnapshot(saved);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const next = await repository.load();
      current.current = next;
      setSnapshot(next);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function reset() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const next = await repository.reset();
      current.current = next;
      setSnapshot(next);
      setError("");
      setToast("Demostración restablecida.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (!snapshot)
    return (
      <main className="boot-screen">
        <div className="brand-symbol">
          T<span>↗</span>
        </div>
        <h1>
          TruckControl <span>AI</span>
        </h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                mode === "company"
                  ? (setError(""), setAttempt((n) => n + 1))
                  : void reset().catch((err) => setError(errorMessage(err)))
              }
            >
              {mode === "company"
                ? "Reintentar conexión"
                : "Restablecer demostración"}
            </button>
            {mode === "company" && onDemo && (
              <button className="button secondary" onClick={onDemo}>
                Volver a la demo
              </button>
            )}
          </>
        ) : (
          <p role="status">
            {mode === "company"
              ? "Cargando la empresa…"
              : "Preparando tu flota de demostración…"}
          </p>
        )}
      </main>
    );
  return (
    <FleetContext.Provider
      value={{ snapshot, busy, execute, reset, refresh, notify: setToast }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">✓</span>
          {toast}
          <button onClick={() => setToast("")} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}
    </FleetContext.Provider>
  );
}
export function useFleet() {
  const value = useContext(FleetContext);
  if (!value) throw new Error("FleetProvider no disponible");
  return value;
}
