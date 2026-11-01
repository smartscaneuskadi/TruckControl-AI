import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createAuthMailHandler } from "./handler.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  createAuthMailHandler({
    async config() {
      const { data, error } = await client.rpc("company_auth_mail_config", {});
      return error ? null : data;
    },
    async reserve(data) {
      const { data: result, error } = await client.rpc(
        "company_auth_mail_reserve",
        { p_data: data },
      );
      if (error) throw Error("Reservation unavailable");
      return result;
    },
    async generate(type, email, metadata) {
      const { data, error } = await client.auth.admin.generateLink(
        type === "invite"
          ? {
              type: "invite",
              email,
              options: { data: metadata },
            }
          : { type: "recovery", email },
      );
      return error ? null : (data.properties?.hashed_token ?? null);
    },
  }),
);
