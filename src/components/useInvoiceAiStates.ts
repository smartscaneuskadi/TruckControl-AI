import { useEffect, useState } from "react";
import { getSupabaseClient } from "../integrations/supabase/client";
import { loadInvoiceAiStates } from "../integrations/supabase/invoice-ai";
import type { InvoiceAiState } from "../../supabase/functions/_shared/invoice-ai.ts";
export function useInvoiceAiStates(
  org: string,
  ids: string[],
  enabled: boolean,
) {
  const client = getSupabaseClient(),
    idsKey = ids.join(","),
    key = `${org}:${enabled}:${idsKey}`;
  const [state, setState] = useState<{
    key: string;
    ready: boolean;
    loading: boolean;
    error: string;
    states: Record<string, InvoiceAiState>;
  }>({ key, ready: false, loading: enabled, error: "", states: {} });
  useEffect(() => {
    if (!enabled || !client || !idsKey) {
      setState({ key, ready: false, loading: false, error: "", states: {} });
      return;
    }
    let active = true;
    const controller = new AbortController();
    setState({ key, ready: false, loading: true, error: "", states: {} });
    void loadInvoiceAiStates(client, org, idsKey.split(","), controller.signal)
      .then((data) => {
        if (active)
          setState({
            key,
            ready: data.enabled,
            loading: false,
            error: "",
            states: Object.fromEntries(
              data.states.map((s) => [s.invoice_id, s]),
            ),
          });
      })
      .catch(() => {
        if (active)
          setState({
            key,
            ready: false,
            loading: false,
            error:
              "No se ha podido comprobar la lectura IA. Actualiza la bandeja; no se ha solicitado ningún análisis.",
            states: {},
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, org, idsKey, enabled, key]);
  return state.key === key && enabled
    ? state
    : {
        key,
        ready: false,
        loading: enabled && Boolean(idsKey),
        error: "",
        states: {} as Record<string, InvoiceAiState>,
      };
}
