import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useCompany } from "./CompanyAccess";
import { useFleet, errorMessage } from "./FleetProvider";
import { useSubscription } from "./SubscriptionContext";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  CloudOperationRepository,
  DemoOperationRepository,
  OfflineOperationRepository,
} from "../data/operations";
import { useOffline } from "./OfflineContext";
import { OfflineCacheSync } from "../components/OfflineSettings";
import { applyOperation } from "../domain/operations";
import type { OperationCommand, OperationRecord } from "../domain/operations";

interface OperationsContextValue {
  rows: OperationRecord[];
  loading: boolean;
  busy: boolean;
  error: string;
  execute(command: OperationCommand): Promise<void>;
  refresh(): Promise<void>;
  book(record: OperationRecord): Promise<void>;
}
const Context = createContext<OperationsContextValue | null>(null);
export function OperationsProvider({ children }: { children: ReactNode }) {
  const company = useCompany(),
    fleet = useFleet(),
    subscription = useSubscription();
  const offline = useOffline();
  const client = getSupabaseClient();
  const [repository] = useState(() =>
    offline.offline && offline.session
      ? new OfflineOperationRepository(offline.session)
      : company.mode === "company" && client && company.organization
        ? new CloudOperationRepository(client, company.organization.id)
        : new DemoOperationRepository(),
  );
  const [rows, setRows] = useState<OperationRecord[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    current = useRef(rows);
  current.current = rows;
  const latest = useRef(fleet);
  latest.current = fleet;
  useEffect(() => {
    let active = true;
    repository
      .load(latest.current.snapshot)
      .then((data) => {
        if (active) {
          current.current = data;
          setRows(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository]);
  async function refresh() {
    const next = await repository.load(latest.current.snapshot);
    current.current = next;
    setRows(next);
    setError("");
  }
  async function execute(command: OperationCommand) {
    if (lock.current || loading)
      throw Error("Espera a que termine la operación actual.");
    const kind = command.type === "save" ? command.value.kind : command.kind;
    if (
      subscription.enabled &&
      (!subscription.features[kind] || subscription.access?.can_write === false)
    )
      throw Error("No tienes permiso de escritura en este apartado.");
    lock.current = true;
    setBusy(true);
    try {
      applyOperation(current.current, command, latest.current.snapshot);
      const next = await repository.execute(command, latest.current.snapshot);
      current.current = next;
      setRows(next);
      setError("");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function book(record: OperationRecord) {
    if (offline.offline)
      throw Error(
        "Conecta y sincroniza antes de registrar el apunte contable.",
      );
    if (lock.current) throw Error("Espera a que termine la operación actual.");
    if (subscription.enabled && subscription.access?.can_write === false)
      throw Error("Tu acceso es de consulta.");
    lock.current = true;
    setBusy(true);
    try {
      if (repository instanceof CloudOperationRepository)
        await repository.book(record);
      else if (repository instanceof DemoOperationRepository) {
        const d = record.data,
          kind = record.kind === "trips" ? "income" : "expense";
        if (
          !["trips", "maintenance", "fuel"].includes(record.kind) ||
          Number(d.amountCents) <= 0 ||
          (record.kind !== "fuel" && d.status !== "completed")
        )
          throw Error("Finaliza el trabajo y revisa su importe.");
        if (!fleet.snapshot.entries.some((e) => e.id === record.id))
          await fleet.execute({
            type: "save-entry",
            value: {
              id: record.id,
              truckId: String(d.truckId),
              kind,
              concept:
                record.kind === "trips"
                  ? `Viaje ${d.reference}`
                  : record.kind === "fuel"
                    ? `Repostaje: ${d.station}`
                    : `Mantenimiento: ${d.description}`,
              date: String(d.endOn || d.completedOn || d.date || d.startOn),
              amountCents: Number(d.amountCents),
              category:
                record.kind === "trips"
                  ? "transport"
                  : record.kind === "fuel"
                    ? "fuel"
                    : "maintenance",
              paymentStatus: "pending",
              distanceKm: record.kind === "trips" ? Number(d.distanceKm) : 0,
            },
          });
        const next = await repository.markBooked(
          record.id,
          record.id,
          latest.current.snapshot,
        );
        current.current = next;
        setRows(next);
      }
      await fleet.refresh();
      await refresh();
      fleet.notify("Apunte registrado una sola vez en la contabilidad.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{ rows, loading, busy, error, execute, refresh, book }}
    >
      <OfflineCacheSync />
      {children}
    </Context.Provider>
  );
}
export function useOperations() {
  const value = useContext(Context);
  if (!value) throw Error("Falta el espacio de operaciones.");
  return value;
}
