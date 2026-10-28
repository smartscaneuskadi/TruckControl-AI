import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Public client for TruckControl's dedicated project. Never use FIXPilot keys. */
export function createFutureSupabaseClient(
  url = import.meta.env.VITE_SUPABASE_URL as string | undefined,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    string | undefined,
) {
  if (!url || !publishableKey)
    throw new Error("La conexión de empresas todavía no está activada.");
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
  return createClient<Database>(url, publishableKey, {
    auth: {
      flowType: "pkce",
      storageKey: "truckcontrol-auth-v1",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let client: ReturnType<typeof createFutureSupabaseClient> | null | undefined;
export function getSupabaseClient() {
  if (client === undefined) {
    const { VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = import.meta
      .env;
    client =
      VITE_SUPABASE_URL && VITE_SUPABASE_PUBLISHABLE_KEY
        ? createFutureSupabaseClient(
            VITE_SUPABASE_URL,
            VITE_SUPABASE_PUBLISHABLE_KEY,
          )
        : null;
  }
  return client;
}
