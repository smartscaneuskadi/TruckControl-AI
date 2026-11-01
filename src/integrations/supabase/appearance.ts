import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appearanceMetadataKey,
  appearanceSchema,
} from "../../domain/appearance";
import type { Appearance } from "../../domain/appearance";

/** Cosmetic, self-owned Auth metadata only. Never used for roles, access or money. */
export async function saveOwnAppearance(
  client: Pick<SupabaseClient, "auth">,
  account: string,
  preference: Appearance,
  stillCurrent: () => boolean,
) {
  const data = appearanceSchema.parse(preference);
  const verified = await client.auth.getUser();
  if (verified.error || verified.data.user?.id !== account || !stillCurrent())
    throw new Error("La cuenta ha cambiado; vuelve a guardar desde tu perfil.");
  const result = await client.auth.updateUser({
    data: { [appearanceMetadataKey]: data },
  });
  if (result.error || result.data.user?.id !== account)
    throw new Error(
      "La apariencia se conserva en este dispositivo y se sincronizará al conectar.",
    );
  return data;
}
