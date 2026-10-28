import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { bucket, createGmailHandler } from "./handler.ts";
import type { GmailConfig, GmailGateway } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appOrigin =
  Deno.env.get("TRUCKCONTROL_APP_ORIGIN") ??
  "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site";
const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const gateway: GmailGateway = {
  async featureAllowed(organizationId, userId, feature) {
    const { data, error } = await client.rpc("tc_platform_server", {
      p_action: "user_access",
      p_data: { organization_id: organizationId, user_id: userId },
    });
    return !error && Boolean(data?.active && data?.features?.[feature]);
  },
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user;
  },
  async owns(organizationId, userId) {
    const { data, error } = await client
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .eq("owner_id", userId)
      .maybeSingle();
    return !error && Boolean(data);
  },
  async server<T>(action: string, data: Record<string, unknown>): Promise<T> {
    const { data: result, error } = await client.rpc("gmail_server", {
      p_action: action,
      p_data: data,
    });
    if (error) throw new Error("Integration database operation failed");
    return result as T;
  },
  async upload(path, bytes, type) {
    const { error } = await client.storage
      .from(bucket)
      .upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw new Error("Document upload failed");
  },
  async remove(path) {
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) throw new Error("Document cleanup failed");
  },
};
const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
const encryptionKey = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY");
const key = Deno.env.get("OPENAI_API_KEY");
const model = Deno.env.get("OPENAI_INVOICE_MODEL");
const config: GmailConfig = {
  enforceEntitlements: true,
  appOrigin,
  callbackUrl: `${url}/functions/v1/company-gmail`,
  oauth:
    clientId && clientSecret && encryptionKey
      ? { clientId, clientSecret, encryptionKey }
      : undefined,
  // Opt-in only; presence of an API key never enables billable processing.
  ai:
    Deno.env.get("INVOICE_AI_ENABLED") === "true" && key && model
      ? { key, model }
      : undefined,
};
Deno.serve(createGmailHandler(gateway, config));
