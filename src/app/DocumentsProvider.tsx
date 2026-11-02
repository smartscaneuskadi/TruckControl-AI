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

interface DocumentRegister {
  documents: CompanyDocument[];
  loading: boolean;
  error: string;
  refresh(): Promise<void>;
}
const Context = createContext<DocumentRegister>({
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
    !(cloud && offline.offline);
  const key = `${cloud ? "company" : "demo"}:${org}:${allowed}`;
  const current = useRef(key);
  current.current = key;
  const sequence = useRef(0);
  const [state, setState] = useState<{
    key: string;
    documents: CompanyDocument[];
    loading: boolean;
    error: string;
  }>({ key, documents: [], loading: allowed, error: "" });
  const refresh = useCallback(async () => {
    const run = ++sequence.current;
    if (!allowed) {
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
          ? await loadCompanyDocuments(client, org)
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
      : { documents: [], loading: allowed, error: "" };
  return (
    <Context.Provider value={{ ...visible, refresh }}>
      {children}
    </Context.Provider>
  );
}
export const useDocuments = () => useContext(Context);
