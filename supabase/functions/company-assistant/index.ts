import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createAssistantHandler } from "./handler.ts";
import type { AssistantGateway } from "./handler.ts";
const url=Deno.env.get("SUPABASE_URL")!;
const publicKey=Deno.env.get("SUPABASE_ANON_KEY")!;
const service=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const gateway:AssistantGateway={
  async authenticate(token){
    const client=createClient(url,publicKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.auth.getUser(token);if(error||!data.user)return null;
    return {userId:data.user.id,
      async access(organizationId){const {data,error}=await client.rpc("tc_organization_access",{p_org:organizationId});if(error)throw Error("Authorization unavailable");return data;},
      async document(organizationId,documentId){const {data,error}=await client.rpc("get_company_document",{p_organization_id:organizationId,p_document_id:documentId});return error?null:data?.[0]??null;},
      async download(path){const {data,error}=await client.storage.from("truckcontrol-documents").download(path);if(error||!data)throw Error("Document unavailable");return new Uint8Array(await data.arrayBuffer());},
    };
  },
  async consume(organizationId,userId){const {data,error}=await service.rpc("tc_consume_document_ai",{p_org:organizationId,p_user:userId});return !error&&data===true;},
};
const key=Deno.env.get("OPENAI_API_KEY"),model=Deno.env.get("OPENAI_DOCUMENT_MODEL");
Deno.serve(createAssistantHandler(gateway,{
 appOrigin:Deno.env.get("TRUCKCONTROL_APP_ORIGIN")??"https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
 ai:Deno.env.get("DOCUMENT_AI_ENABLED")==="true"&&key&&model?{key,model}:undefined,
}));
