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
import { loadCompanyDocuments } from "../integrations/supabase/documents";
import { listDemoDocuments } from "../data/demo-documents";
import type { CompanyDocument } from "../integrations/supabase/database.types";
import { sessionExitEvent } from "./session-events";

interface DocumentRegister {
  scopeKey: string;
  available: boolean;
  documents: CompanyDocument[];
  loading: boolean;
  error: string;
  refresh(): Promise<void>;
}
const Context = createContext<DocumentRegister>({
  scopeKey: "unavailable",
  available: false,
  documents: [],
  loading: false,
  error: "",
  async refresh() {},
});
export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { snapshot } = useFleet(),
    company = useCompany(),
    subscription = useSubscription(),
    offline = useOffline();
  const cloud = company.mode === "company",
    client = getSupabaseClient(),
    org = snapshot.organization.id;
  const allowed =
    (!subscription.enabled || subscription.features.documents) &&
    !(cloud && offline.offline) &&
    (cloud ? Boolean(company.user) : company.mode === "demo");
  // Financial attachments also require their entry's current module. Closing
  // that module must drop cached metadata and any in-flight document scope.
  const permissionKey = `${subscription.enabled}:${subscription.features.income}:${subscription.features.expenses}`;
  const key = `${company.mode}:${company.user?.id ?? "demo"}:${org}:${allowed}:${permissionKey}`;
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const readable = allowed && closedKey !== key;
  const scopeKey = readable ? key : `${key}:closed`;
  const current = useRef(scopeKey);
  current.current = scopeKey;
  const sequence = useRef(0);
  const [state, setState] = useState<{
    key: string;
    documents: CompanyDocument[];
    loading: boolean;
    error: string;
  }>({ key, documents: [], loading: allowed, error: "" });
  const refresh = useCallback(async () => {
    const run = ++sequence.current;
    if (!readable) {
      setState({ key, documents: [], loading: false, error: "" });
      return;
    }
    setState((s) => ({
      key,
      documents: s.key === key ? s.documents : [],
      loading: true,
      error: "",
    }));
    try {
      if (cloud && !client)
        throw Error("La conexión de empresa no está disponible.");
      const documents =
        cloud && client
          ? await loadCompanyDocuments(
              client,
              org,
              () => current.current === key && sequence.current === run,
              company.user?.id,
            )
          : (await listDemoDocuments(org)).map((d) => ({
              id: d.id,
              organization_id: d.organizationId,
              name: d.name,
              truck_id: d.truckId || null,
              driver_id: d.driverId || null,
              created_at: d.createdAt,
              size_bytes: d.file.size,
              content_type: d.file.type,
              object_path: `${org}/${d.id}/demo`,
              tracking: d.tracking,
            }));
      if (current.current === key && sequence.current === run)
        setState({ key, documents, loading: false, error: "" });
    } catch (e) {
      if (current.current === key && sequence.current === run)
        setState({
          key,
          documents: [],
          loading: false,
          error: errorMessage(e),
        });
    }
  }, [readable, cloud, client, org, key, company.user?.id]);
  useEffect(() => {
    const close = () => {
      current.current = `${key}:closed`;
      sequence.current++;
      setClosedKey(key);
      setState({ key, documents: [], loading: false, error: "" });
    };
    window.addEventListener(sessionExitEvent, close);
    return () => window.removeEventListener(sessionExitEvent, close);
  }, [key]);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  const visible =
    state.key === key && readable
      ? state
      : { documents: [], loading: readable, error: "" };
  return (
    <Context.Provider
      value={{ ...visible, scopeKey, available: readable, refresh }}
    >
      {children}
    </Context.Provider>
  );
}
export const useDocuments = () => useContext(Context);
