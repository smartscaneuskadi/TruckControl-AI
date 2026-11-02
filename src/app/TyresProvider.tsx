import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useCompany } from "./CompanyAccess";
import { useFleet, errorMessage } from "./FleetProvider";
import { useSubscription } from "./SubscriptionContext";
import { useOffline } from "./OfflineContext";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  loadCompanyTyres,
  saveCompanyTyre,
  loadTyrePageSet,
} from "../integrations/supabase/tyres";
import { loadDemoTyres, saveDemoTyre } from "../data/tyres";
import type { TyreRecord, TyreData, TyreHistory } from "../domain/tyres";

interface Register {
  rows: TyreRecord[];
  loading: boolean;
  busy: boolean;
  error: string;
  onlineRequired: boolean;
  refresh(): Promise<void>;
  save(
    id: string,
    data: TyreData,
    expected: number | null,
  ): Promise<TyreRecord>;
  history(id: string): Promise<TyreHistory[]>;
}
const Context = createContext<Register | null>(null);
export function TyresProvider({ children }: { children: ReactNode }) {
  const company = useCompany(),
    fleet = useFleet(),
    subscription = useSubscription(),
    offline = useOffline();
  const cloud = company.mode === "company",
    org = fleet.snapshot.organization.id,
    client = getSupabaseClient();
  const allowed =
    (!subscription.enabled || subscription.features.maintenance) &&
    !(cloud && offline.offline);
  const key = `${cloud}:${org}:${allowed}`,
    current = useRef(key);
  current.current = key;
  const sequence = useRef(0),
    lock = useRef(false),
    latest = useRef(fleet.snapshot);
  latest.current = fleet.snapshot;
  const [state, setState] = useState({
    key,
    rows: [] as TyreRecord[],
    loading: allowed,
    busy: false,
    error: "",
  });
  const refresh = useCallback(async () => {
    const n = ++sequence.current;
    setState((s) => ({
      key,
      rows: s.key === key && allowed ? s.rows : [],
      loading: allowed,
      busy: false,
      error: "",
    }));
    if (!allowed) return;
    try {
      if (cloud && !client)
        throw Error("La conexión de empresa no está disponible.");
      const rows =
        cloud && client
          ? await loadCompanyTyres(client, org)
          : loadDemoTyres(org, latest.current).rows;
      if (current.current === key && sequence.current === n)
        setState({ key, rows, loading: false, busy: false, error: "" });
    } catch (e) {
      if (current.current === key && sequence.current === n)
        setState({
          key,
          rows: [],
          loading: false,
          busy: false,
          error: errorMessage(e),
        });
    }
  }, [allowed, cloud, client, org, key]);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  const visible =
    state.key === key && allowed
      ? state
      : { key, rows: [], loading: allowed, busy: false, error: "" };
  async function save(id: string, data: TyreData, expected: number | null) {
    if (
      !allowed ||
      lock.current ||
      visible.loading ||
      (subscription.enabled && !subscription.access?.can_write) ||
      (cloud && !navigator.onLine)
    )
      throw Error(
        "Necesitas conexión y permiso de escritura para guardar el neumático.",
      );
    lock.current = true;
    setState((s) => ({ ...s, busy: true }));
    try {
      if (cloud && !client)
        throw Error("La conexión de empresa no está disponible.");
      const row =
        cloud && client
          ? await saveCompanyTyre(client, org, id, data, expected)
          : saveDemoTyre(org, latest.current, id, data, expected);
      if (current.current === key) await refresh();
      return row;
    } finally {
      lock.current = false;
      if (current.current === key) setState((s) => ({ ...s, busy: false }));
    }
  }
  async function history(id: string) {
    if (!allowed || !visible.rows.some((r) => r.id === id))
      throw Error("El neumático no está disponible en esta empresa.");
    if (cloud && !client)
      throw Error("La conexión de empresa no está disponible.");
    const rows =
      cloud && client
        ? await loadTyrePageSet(client, org, "history", id)
        : loadDemoTyres(org).history.filter((h) => h.tyreId === id);
    if (current.current !== key)
      throw Error("La empresa o los permisos han cambiado.");
    return rows.sort((a, b) => b.version - a.version);
  }
  return (
    <Context.Provider
      value={{
        ...visible,
        onlineRequired:
          cloud &&
          offline.offline &&
          (!subscription.enabled || subscription.features.maintenance),
        refresh,
        save,
        history,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useTyres() {
  const value = useContext(Context);
  if (!value) throw Error("Falta el registro de neumáticos.");
  return value;
}
