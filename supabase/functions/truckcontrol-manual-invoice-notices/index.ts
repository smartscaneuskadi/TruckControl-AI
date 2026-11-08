import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createManualInvoiceNoticeHandler } from "./handler.ts";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey,
  { auth:{ persistSession:false,autoRefreshToken:false } });
Deno.serve(createManualInvoiceNoticeHandler({
  async config() {
    const { data:runtime,error } = await client.rpc("tc_manual_invoice_notice_runtime",{});
    if (error || !runtime || runtime.contract !== "manual-invoice-notice-runtime-v1") return null;
    if (runtime.enabled !== true) return { enabled:false,providerEnabled:false,apiKey:"" };
    // Reuse the EXISTING backend-only Vault integration. Never return/log its
    // credential or signing-key fields; never store them in a browser bundle.
    const { data:provider,error:providerError } = await client.rpc("company_auth_mail_config",{});
    return providerError || !provider ? null : {
      enabled:true,providerEnabled:provider.enabled === true,
      apiKey:typeof provider.api_key === "string" ? provider.api_key : "",
    };
  },
  async claim() {
    const { data,error } = await client.rpc("tc_manual_invoice_notice_claim",{});
    if (error) throw Error("notice_claim_unavailable");
    return data;
  },
  async finish(notice,outcome,providerId) {
    const { data,error } = await client.rpc("tc_manual_invoice_notice_finish",{
      p_notice:notice.id,p_lease:notice.lease_token,p_expected:notice.row_version,
      p_outcome:outcome,p_provider_id:providerId,
    });
    if (error) throw Error("notice_result_unavailable");
    return data;
  },
},serviceKey));
