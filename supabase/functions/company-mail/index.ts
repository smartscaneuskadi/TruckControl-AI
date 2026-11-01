import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createMailHandler, MailActionError } from "./handler.ts";
import type { MailAccess, MailGateway } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const gateway: MailGateway = {
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user;
  },
  async access(org, user) {
    const { data, error } = await client.rpc("tc_company_server_access", {
      p_org: org,
      p_user: user,
    });
    return error ? null : (data as MailAccess);
  },
  async server<T>(action: string, data: Record<string, unknown>): Promise<T> {
    const { data: result, error } = await client.rpc("company_mail_server", {
      p_action: action,
      p_data: data,
    });
    if (error) {
      if (error.code === "42501")
        throw new MailActionError("company_access_denied", 403, true);
      if (error.code === "P0001" && error.message.startsWith("Límite"))
        throw new MailActionError("mail_daily_limit", 429, true);
      throw new MailActionError(
        "mail_operation_unavailable",
        409,
        Boolean(error.code),
      );
    }
    return result as T;
  },
  async upload(path, bytes, type) {
    const { error } = await client.storage
      .from("truckcontrol-documents")
      .upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw new MailActionError("document_upload_failed", 502);
  },
  async remove(path) {
    const { error } = await client.storage
      .from("truckcontrol-documents")
      .remove([path]);
    if (error) throw new MailActionError("document_cleanup_failed", 502);
  },
};
Deno.serve(
  createMailHandler(gateway, {
    origins: [
      "https://truckcontrolai.com",
      "https://www.truckcontrolai.com",
      "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
    ],
    // An approved receiver/relay must be connected before enabling this route.
    // Never reuse a Gmail/AES key or expose the shared signing key in VITE variables.
    ingress: {
      enabled: Deno.env.get("COMPANY_MAIL_INGRESS_ENABLED") === "true",
      domain: Deno.env.get("COMPANY_MAIL_INGRESS_DOMAIN") ?? "",
      signingKey: Deno.env.get("COMPANY_MAIL_INGRESS_SIGNING_KEY") ?? "",
    },
  }),
);
