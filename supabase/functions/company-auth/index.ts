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
      return error || !data.user || !data.properties?.hashed_token
        ? null
        : { token_hash: data.properties.hashed_token, user_id: data.user.id };
    },
    async consent(user, request, version) {
      const { data, error } = await client.rpc("company_auth_mail_consent", {
        p_user_id: user,
        p_request_id: request,
        p_version: version,
        p_authenticated: false,
      });
      return !error && data === true;
    },
    async completeProfile(token, profile, version) {
      const { data: identity, error: authError } =
        await client.auth.getUser(token);
      const user = identity.user;
      if (authError || !user?.email_confirmed_at) return false;
      const { data, error } = await client.rpc("company_auth_mail_consent", {
        p_user_id: user.id,
        p_request_id: null,
        p_version: version,
        p_authenticated: true,
      });
      if (error || data !== true) return false;
      const updated = await client.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          truckcontrol_registration: profile,
        },
      });
      return !updated.error;
    },
  }),
);
