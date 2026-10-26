import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FleetSnapshot } from "../domain/models";
import { applyCommand } from "../domain/commands";
import type { FleetCommand } from "../domain/commands";
import { LocalFleetRepository } from "../data/repository";

interface FleetContextValue {
  snapshot: FleetSnapshot;
  busy: boolean;
  execute(command: FleetCommand): Promise<void>;
  reset(): Promise<void>;
  notify(message: string): void;
}
const FleetContext = createContext<FleetContextValue | null>(null);
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Ha ocurrido un error. Inténtalo de nuevo.";

export function FleetProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(
    () =>
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
  }, [repository]);
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
      await repository.save(next);
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
                reset().catch((err) => setError(errorMessage(err)))
              }
            >
              Restablecer demostración
            </button>
          </>
        ) : (
          <p role="status">Preparando tu flota de demostración…</p>
        )}
      </main>
    );
  return (
    <FleetContext.Provider
      value={{ snapshot, busy, execute, reset, notify: setToast }}
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
