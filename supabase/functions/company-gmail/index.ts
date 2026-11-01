import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { bucket, createGmailHandler } from "./handler.ts";
import type { GmailConfig, GmailGateway } from "./handler.ts";
import { createGmailConfigResolver } from "./config.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Canonical production origin is pinned independently of obsolete demo settings.
// A valid OAuth state preserves www/legacy sessions through its own allowlist.
const appOrigin = "https://truckcontrolai.com";
const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const gateway: GmailGateway = {
  async featureAllowed(organizationId, userId, feature) {
    const { data, error } = await client.rpc("tc_company_server_access", {
      p_org: organizationId,
      p_user: userId,
    });
    return !error && Boolean(data?.active && data?.features?.[feature]);
  },
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user;
  },
  async owns(organizationId, userId) {
    const { data, error } = await client.rpc("tc_company_server_access", {
      p_org: organizationId,
      p_user: userId,
    });
    return !error && Boolean(data?.active);
  },
  async actionAllowed(organizationId, userId, action) {
    const { data, error } = await client.rpc("tc_company_server_access", {
      p_org: organizationId,
      p_user: userId,
    });
    if (error || !data?.active) return false;
    if (["start", "complete", "disconnect"].includes(action))
      return Boolean(data.can_manage);
    if (action === "sync") return Boolean(data.can_write);
    return action === "status";
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
const resolveOAuth = createGmailConfigResolver(
  { clientId, clientSecret, encryptionKey },
  async () => {
    const { data, error } = await client.rpc("gmail_runtime_config");
    if (error) return null;
    return data;
  },
  Date.now,
  "468881730124",
);
const key = Deno.env.get("OPENAI_API_KEY");
const model = Deno.env.get("OPENAI_INVOICE_MODEL");
const config: GmailConfig = {
  enforceCompanyRoles: true,
  enforceEntitlements: true,
  appOrigin,
  additionalOrigins: [
    "https://truckcontrolai.com",
    "https://www.truckcontrolai.com",
    "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
  ],
  callbackUrl: `${appOrigin}/gmail-callback.html`,
  resolveOAuth,
  // Opt-in only; presence of an API key never enables billable processing.
  ai:
    Deno.env.get("INVOICE_AI_ENABLED") === "true" && key && model
      ? { key, model }
      : undefined,
};
Deno.serve(createGmailHandler(gateway, config));
