import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { StripeFinancialIncident } from "../../supabase/functions/_shared/subscription-financial-incidents";

export type Json = Record<string, unknown>;
export const incidentAccount = "acct_IncidentSynthetic";
export const incidentNow = Math.floor(Date.now()/1000);
export const incidentAdmin = "fa910000-0000-4000-8000-000000000001";
export const incidentAdminSid = "fa920000-0000-4000-8000-000000000001";
export interface PaidFixture {
 user:string;company:string;request:string;checkout:string;customer:string;
 invoice:string|null;subscription:string|null;pi:string;charge:string;
 task:string;event:string;kind:"initial_payment"|"subscription_invoice";proof:Json;
 periodStart:number|null;periodEnd:number|null;
}
let sequence=0;
export async function financialDatabase() {
 const db=new PGlite();
 await db.exec(String.raw`
 create role anon nologin;create role authenticated nologin;
 create role service_role nologin bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
  raw_user_meta_data jsonb not null default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $uid$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $uid$;
 create function auth.jwt() returns jsonb language sql stable as $jwt$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $jwt$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 `);
 for(const path of readdirSync("supabase/migrations").filter(x=>x.endsWith(".sql")).sort())
  await db.exec(readFileSync("supabase/migrations/"+path,"utf8"));
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'financial-operator@example.invalid',now())",[incidentAdmin]);
 await db.query("insert into auth.sessions(id,user_id) values($1,$2)",[incidentAdminSid,incidentAdmin]);
 await db.query("insert into private.tc_admins(user_id) values($1) on conflict do nothing",[incidentAdmin]);
 // Synthetic isolated channel only; all persisted native/default switches stay OFF.
 await db.query("insert into private.tc_manual_stripe_channels(provider_account_id,mode,enabled,isolated_test_instance) values($1,'test',true,true)",[incidentAccount]);
 return db;
}
export async function withDbRole<T>(db:PGlite, role:string, fn:()=>Promise<T>) {
 await db.exec("set role "+role);
 try{return await fn();}finally{await db.exec("reset role");}
}
export async function financialPayment(db:PGlite,monthly=false):Promise<PaidFixture> {
 const n=++sequence, user=randomUUID(),request=randomUUID(),checkout="cs_test_Incident"+n;
 await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
 [user,"financial-"+n+"@example.invalid",JSON.stringify({truckcontrol_registration:{
  contact_name:"Persona ficticia",company_name:"Empresa sintética "+n,tax_id:"SYNTHETIC-"+n,
  address:"Direccion de pruebas aisladas 123",phone:"+1202555"+String(1000+n),requested_plan:"limited",
 }})]);
 const company=(await db.query<{id:string}>("select id from public.organizations where owner_id=$1",[user])).rows[0].id;
 await db.query("insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents) select $1,$2,id,36300,revision,'checkout',$3,30000,2100,6300 from private.tc_plans where id='limited'",[request,user,checkout]);
 const invoice=monthly?"in_Incident"+n:null,subscription=monthly?"sub_Incident"+n:null;
 const periodStart=monthly?incidentNow-30*86400:null,periodEnd=monthly?incidentNow:null;
 const event="evt_PaidIncident"+n,kind=monthly?"subscription_invoice":"initial_payment";
 const proof:Json={provider_event_id:event,provider_event_type:monthly?"invoice.paid":"checkout.session.completed",
  provider_event_created:incidentNow-10,provider_payment_id:invoice??"pi_Incident"+n,
  request_id:request,user_id:user,company_id:company,amount_cents:36300,currency:"EUR",
  paid_at:new Date((incidentNow-15)*1000).toISOString(),livemode:false,checkout_id:checkout,
  customer_id:"cus_Incident"+n};
 if(monthly) {
  await db.query("insert into private.tc_subscription_orders(user_id,request_id,checkout_id,terms_version) values($1,$2,$3,'synthetic-v1')",[user,request,checkout]);
  Object.assign(proof,{invoice_id:invoice,subscription_id:subscription,invoice_period_start:periodStart,
   invoice_period_end:periodEnd,subscription_current_period_end:periodEnd,unit_amount:36300,
   subscription_state:"active",cancel_at_period_end:false,billing_reason:"subscription_create"});
 }
 const result=await withDbRole(db,"service_role",async()=>(await db.query<{result:Json}>(
  "select public.tc_manual_subscription_apply_payment($1,$2,$3::jsonb) result",[kind,incidentAccount,JSON.stringify(proof)])).rows[0].result);
 return {user,company,request,checkout,invoice,subscription,customer:"cus_Incident"+n,pi:"pi_Incident"+n,
  charge:"ch_Incident"+n,task:String(result.task_id),event,kind,proof,periodStart,periodEnd};
}
export function incidentObservation(p:PaidFixture,overrides:Partial<StripeFinancialIncident>={}):StripeFinancialIncident {
 return {event_id:"evt_Refund"+p.pi.slice(3),event_type:"refund.created",event_created:incidentNow-5,
  livemode:false,currency:"EUR",object_type:"refund",object_id:"re_"+p.pi.slice(3),
  status_at_event:"succeeded",current_status:"succeeded",event_amount_cents:5000,current_amount_cents:5000,
  charge_amount_cents:36300,charge_amount_refunded_cents:5000,event_amount_refunded_cents:null,
  payment_intent_id:p.pi,charge_id:p.charge,customer_id:p.customer,invoice_id:p.invoice,
  subscription_id:p.subscription,invoice_payment_id:p.invoice?"inpay_"+p.pi.slice(3):null,
  invoice_period_start:p.periodStart,invoice_period_end:p.periodEnd,invoice_amount_cents:p.invoice?36300:null,
  ...overrides};
}
export async function recordObservation(db:PGlite,data:unknown,account=incidentAccount,mode="test") {
 return withDbRole(db,"service_role",async()=>(await db.query<{result:Json}>(
  "select public.tc_manual_subscription_record_incident($1,$2,$3::jsonb) result",[account,mode,JSON.stringify(data)])).rows[0].result);
}
export async function incidentAdminCall(db:PGlite,action:string,caseId:string|null=null,expected:number|null=null,
 operation:string|null=null,data:Json={},user=incidentAdmin,sid:string|null=incidentAdminSid) {
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
 [user,JSON.stringify({sub:user,role:"authenticated",...(sid?{session_id:sid}:{}),user_metadata:{is_admin:true}})]);
 return withDbRole(db,"authenticated",async()=>(await db.query<{result:Json}>(
  "select public.tc_admin_subscription_incidents($1,$2::uuid,$3::bigint,$4::uuid,$5::jsonb,null::uuid) result",
  [action,caseId,expected,operation,JSON.stringify(data)])).rows[0].result);
}
export async function incidentOriginalSnapshot(db:PGlite,p:PaidFixture) {
 return (await db.query<{result:Json}>(String.raw`select jsonb_build_object(
 'customer',(select to_jsonb(c) from private.tc_customers c where user_id=$1),
 'request',(select to_jsonb(r) from private.tc_payment_requests r where id=$2),
 'tasks',(select jsonb_agg(to_jsonb(t) order by t.id) from private.tc_manual_subscription_invoice_tasks t where request_id=$2),
 'receipts',(select jsonb_agg(to_jsonb(b) order by b.provider_event_id) from private.tc_manual_stripe_bridge_receipts b where request_id=$2),
 'invoices',(select jsonb_agg(to_jsonb(i) order by i.invoice_id) from private.tc_subscription_invoices i where user_id=$1),
 'notices',(select jsonb_agg(to_jsonb(n) order by n.id) from private.tc_manual_invoice_notice_outbox n where task_id=$3)
 ) result`,[p.user,p.request,p.task])).rows[0].result;
}
export async function knownOriginal(db:PGlite,p:PaidFixture,override:Json={},account=incidentAccount,mode="test") {
 const hint={id:p.event,type:p.proof.provider_event_type,created:p.proof.provider_event_created,
  resource_id:p.invoice??p.checkout,...override};
 return withDbRole(db,"service_role",async()=>(await db.query<{result:Json}>(
  "select public.tc_manual_subscription_known_payment_event($1,$2,$3::jsonb) result",[account,mode,JSON.stringify(hint)])).rows[0].result);
}
