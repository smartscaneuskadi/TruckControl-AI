import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiRuntimeResolver } from "../_shared/ai-runtime.ts";
import { extractInvoice } from "../_shared/invoice.ts";
import { MailActionError } from "./handler.ts";
import type { MailAccess, MailGateway } from "./handler.ts";

export function createMailGateway(
  client: SupabaseClient,
  environmentKey?: string,
): MailGateway {
  const runtime = createAiRuntimeResolver(
    {
      async config() {
        const { data, error } = await client.rpc(
          "company_provider_runtime_config",
          { p_scope: "ai" },
        );
        return error ? null : data;
      },
      async budget(action, data) {
        const { data: result, error } = await client.rpc(
          "company_ai_budget_server",
          { p_action: action, p_data: data },
        );
        if (error) throw Error("AI budget unavailable");
        return result;
      },
    },
    environmentKey,
  );
  return {
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
    async aiStatus() {
      return (await runtime.health()).enabled;
    },
    async analyze(organization_id, user_id, invoice_id, bytes, type) {
      if (bytes.length > 6 * 1024 * 1024) return false;
      const ai = await runtime.resolve({
        organization_id,
        user_id,
        invoice_id,
        kind: "invoice",
      });
      if (!ai) return false;
      const fields = await extractInvoice(bytes, type, ai, ai.fetcher);
      const { data, error } = await client.rpc("company_invoice_ai_apply", {
        p_data: { organization_id, user_id, invoice_id, fields },
      });
      return !error && data === true;
    },
  };
}
