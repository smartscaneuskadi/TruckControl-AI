import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Opt-in factory only. The Phase 1 demo does not instantiate or call Supabase. */
export function createFutureSupabaseClient(
  url = import.meta.env.VITE_SUPABASE_URL as string | undefined,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    string | undefined,
) {
  if (!url || !publishableKey)
    throw new Error(
      "Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para usar el futuro adaptador remoto.",
    );
  if (!publishableKey.startsWith("sb_publishable_"))
    throw new Error(
      "El cliente público requiere una clave publicable sb_publishable_. Nunca uses claves secretas o service_role.",
    );
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(parsed.hostname)
  )
    throw new Error("Supabase requiere HTTPS fuera del entorno local.");
  return createClient<Database>(url, publishableKey);
}
