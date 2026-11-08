import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
 financialDatabase,financialPayment,incidentObservation,recordObservation,incidentOriginalSnapshot,
 incidentAdminCall,knownOriginal,withDbRole,incidentAccount,incidentAdmin,incidentAdminSid,type Json,
} from "./helpers/subscription-financial-db";

let db:PGlite;
const entries=async(caseId:string)=>(await db.query<{n:number}>(
 "select count(*)::int n from private.tc_subscription_financial_entries where case_id=$1",[caseId])).rows[0].n;
const dto=async(caseId:string)=>((await incidentAdminCall(db,"detail",caseId)).items as Json[])[0];
beforeAll(async()=>{db=await financialDatabase();},120000);
afterAll(async()=>{await db?.close();});

describe("financial incidents: real migrated SQL, synthetic PGlite database",()=>{
 it("advertises observation only; money movement, licence policy and fiscal emission are unavailable",async()=>{
  expect(await incidentAdminCall(db,"capabilities")).toMatchObject({
   contract:"subscription-financial-incidents-v1",available:true,refunds_available:false,
   license_changes_available:false,rectification_emission_available:false});
 });
 it.each([false,true])("binds a %s monthly payment without altering payment, licence, fiscal task or notice",async monthly=>{
  const p=await financialPayment(db,monthly),before=await incidentOriginalSnapshot(db,p);
  const result=await recordObservation(db,incidentObservation(p));
  expect(result).toMatchObject({contract:"subscription-financial-incidents-record-v1",received:true,duplicate:false});
  expect(await incidentOriginalSnapshot(db,p)).toEqual(before);
  expect(await dto(String(result.case_id))).toMatchObject({task_id:p.task,buyer_company_id:p.company,
   provider_payment_id:p.invoice??p.pi,provider_invoice_id:p.invoice,row_version:2,
   review_state:"pending",rectification_state:"pending",latest_provider:{extent:"partial",current_amount_cents:5000}});
 });
 it("does not depend on an old subscription still being active or having the same current price",async()=>{
  const p=await financialPayment(db,true);
  await db.query("update private.tc_billing_subscriptions set state='canceled',monthly_cents=99999 where provider_id=$1",[p.subscription]);
  const before=await incidentOriginalSnapshot(db,p);
  expect(await recordObservation(db,incidentObservation(p))).toMatchObject({received:true});
  expect(await incidentOriginalSnapshot(db,p)).toEqual(before);
 });
 it("denies both customer companies and forged administrator metadata on all administrative actions",async()=>{
  const p=await financialPayment(db),other=await financialPayment(db);
  const result=await recordObservation(db,incidentObservation(p)),id=String(result.case_id);
  for(const user of [p.user,other.user]){
   const sid=randomUUID();await db.query("insert into auth.sessions(id,user_id) values($1,$2)",[sid,user]);
   for(const action of ["capabilities","list","detail","history","review","report_rectification"])
    await expect(incidentAdminCall(db,action,id,2,randomUUID(),{note:"Unauthorized request"},user,sid))
     .rejects.toMatchObject({code:"42501"});
  }
  expect(await entries(id)).toBe(1);
 });
 it("grants service only two guarded RPCs, not direct table writes or administrator capability",async()=>{
  const p=await financialPayment(db),data=incidentObservation(p);
  for(const name of ["anon","authenticated"]) {
   await expect(withDbRole(db,name,()=>db.query(
    "select public.tc_manual_subscription_record_incident($1,'test',$2::jsonb)",[incidentAccount,JSON.stringify(data)]))).rejects.toThrow();
   await expect(withDbRole(db,name,()=>db.query("select * from private.tc_subscription_financial_cases"))).rejects.toThrow();
  }
  await expect(withDbRole(db,"service_role",()=>db.query("select * from private.tc_subscription_financial_entries"))).rejects.toThrow();
  await expect(withDbRole(db,"service_role",()=>db.query("select public.tc_admin_subscription_incidents('capabilities')"))).rejects.toThrow();
  // Role is checked inside the definer too; claiming service_role in a JWT is insufficient.
  await expect(db.query("select private.tc_manual_subscription_record_incident($1,'test',$2::jsonb)",
   [incidentAccount,JSON.stringify(data)])).rejects.toMatchObject({code:"42501"});
 });
 it("rejects client-selected company/task IDs and malformed numeric fields before creating a case",async()=>{
  const p=await financialPayment(db),base=incidentObservation(p);
  for(const extra of [{company_id:p.company},{task_id:p.task},{current_amount_cents:1.5},{livemode:"false"}])
   await expect(recordObservation(db,{...base,...extra})).rejects.toThrow();
  expect((await db.query("select id from private.tc_subscription_financial_cases where task_id=$1",[p.task])).rows).toEqual([]);
 });
 it("rejects an unknown account or opposite mode instead of assigning a tenant",async()=>{
  const p=await financialPayment(db),data=incidentObservation(p);
  await expect(recordObservation(db,data,"acct_OtherMerchant")).rejects.toMatchObject({code:"23514"});
  await expect(recordObservation(db,{...data,livemode:true},incidentAccount,"live")).rejects.toMatchObject({code:"23514"});
 });
 it.each(["invoice","customer","period","amount"])("rejects %s mismatch against native historical invoice data",async mismatch=>{
  const p=await financialPayment(db,true),data=incidentObservation(p);
  if(mismatch==="invoice")data.invoice_id="in_UnrelatedInvoice";
  if(mismatch==="customer")data.customer_id="cus_AnotherCustomer";
  if(mismatch==="period")data.invoice_period_start=data.invoice_period_start!+1;
  if(mismatch==="amount")data.invoice_amount_cents=1;
  const before=await incidentOriginalSnapshot(db,p);
  await expect(recordObservation(db,data)).rejects.toThrow();
  expect(await incidentOriginalSnapshot(db,p)).toEqual(before);
  expect((await db.query("select id from private.tc_subscription_financial_cases where task_id=$1",[p.task])).rows).toEqual([]);
 });
 it("deduplicates the immutable event even if its later current status/amount changed",async()=>{
  const p=await financialPayment(db),data=incidentObservation(p,{status_at_event:"pending",current_status:"pending",charge_amount_refunded_cents:0});
  const first=await recordObservation(db,data),id=String(first.case_id);
  expect(await recordObservation(db,{...data,current_status:"succeeded",charge_amount_refunded_cents:5000}))
   .toMatchObject({duplicate:true,case_id:id});
  expect(await entries(id)).toBe(1);
  expect(await dto(id)).toMatchObject({latest_provider:{status_at_event:"pending",current_status:"pending"}});
 });
 it("new provider events append observations and invalidate the last review without rewriting history",async()=>{
  const p=await financialPayment(db),data=incidentObservation(p),id=String((await recordObservation(db,data)).case_id);
  await incidentAdminCall(db,"review",id,2,randomUUID(),{note:"Original observation reviewed"});
  await recordObservation(db,{...data,event_id:data.event_id+"Next",event_type:"refund.updated"});
  expect(await dto(id)).toMatchObject({row_version:4,review_state:"pending",last_review:{row_version:3}});
  const history=await incidentAdminCall(db,"history",id);
  expect((history.items as Json[]).map(e=>e.row_version)).toEqual([4,3,2]);
 });
 it("rejects a provider event reused across another paid company with atomic rollback",async()=>{
  const a=await financialPayment(db),b=await financialPayment(db);
  const data=incidentObservation(a),id=String((await recordObservation(db,data)).case_id);
  const before=await incidentOriginalSnapshot(db,b);
  await expect(recordObservation(db,incidentObservation(b,{event_id:data.event_id}))).rejects.toMatchObject({code:"23514"});
  expect(await entries(id)).toBe(1);
  expect((await db.query("select id from private.tc_subscription_financial_cases where task_id=$1",[b.task])).rows).toEqual([]);
  expect(await incidentOriginalSnapshot(db,b)).toEqual(before);
 });
 it.each(["full","failed","dispute_mismatch"])("retains %s observations without automatic suspension or fiscal issuance",async kind=>{
  const p=await financialPayment(db),before=await incidentOriginalSnapshot(db,p);
  const data=incidentObservation(p);
  if(kind==="full")Object.assign(data,{event_amount_cents:36300,current_amount_cents:36300,charge_amount_refunded_cents:36300});
  if(kind==="failed")Object.assign(data,{event_type:"refund.failed",status_at_event:"failed",current_status:"failed",charge_amount_refunded_cents:0});
  if(kind==="dispute_mismatch")Object.assign(data,{object_type:"dispute",object_id:"du_"+p.pi.slice(3),
   event_type:"charge.dispute.created",status_at_event:"needs_response",current_status:"needs_response",
   event_amount_cents:40000,current_amount_cents:40000});
  const id=String((await recordObservation(db,data)).case_id);
  expect(await dto(id)).toMatchObject({latest_provider:{extent:kind==="full"?"full":kind==="dispute_mismatch"?"mismatch":"partial"}});
  expect(await incidentOriginalSnapshot(db,p)).toEqual(before);
 });
 it("serializes administrator actions by expected version and rejects stale competing intentions",async()=>{
  const p=await financialPayment(db),id=String((await recordObservation(db,incidentObservation(p))).case_id);
  const first=await incidentAdminCall(db,"review",id,2,randomUUID(),{note:"Checked original evidence"});
  expect(first).toMatchObject({replayed:false,operation:{expected_version:2,applied_version:3},case:{row_version:3}});
  await expect(incidentAdminCall(db,"review",id,2,randomUUID(),{note:"A stale competing review"})).rejects.toMatchObject({code:"40001"});
  expect(await entries(id)).toBe(2);
 });
 it("replays an identical UUID operation after newer observations using its original immutable ACK",async()=>{
  const p=await financialPayment(db),data=incidentObservation(p),id=String((await recordObservation(db,data)).case_id),op=randomUUID();
  const original=await incidentAdminCall(db,"review",id,2,op,{note:"Exact original review"});
  await recordObservation(db,{...data,event_id:data.event_id+"Changed",event_type:"refund.updated"});
  const replay=await incidentAdminCall(db,"review",id,2,op,{note:"Exact original review"});
  expect(replay).toMatchObject({replayed:true,operation:original.operation,case:{row_version:4}});
  await expect(incidentAdminCall(db,"review",id,2,op,{note:"Changed review bytes"})).rejects.toMatchObject({code:"23514"});
  expect(await entries(id)).toBe(3);
 });
 it("records external rectification references as declarations, globally unique and append-only",async()=>{
  const a=await financialPayment(db),b=await financialPayment(db);
  const ca=String((await recordObservation(db,incidentObservation(a))).case_id),
   cb=String((await recordObservation(db,incidentObservation(b))).case_id),reference="SYNTHETIC-RECT-"+a.pi;
  await incidentAdminCall(db,"report_rectification",ca,2,randomUUID(),{reference,note:"Reference reported by operator"});
  await expect(incidentAdminCall(db,"report_rectification",cb,2,randomUUID(),{reference:reference.toLowerCase(),note:"Duplicate external reference"}))
   .rejects.toMatchObject({code:"23514"});
  await incidentAdminCall(db,"report_rectification",ca,3,randomUUID(),{reference:reference+"-B",note:"Additional reference reported"});
  expect(await dto(ca)).toMatchObject({row_version:4,rectification_state:"reported",rectification:{reference:reference+"-B"}});
  expect(await entries(cb)).toBe(1);
 });
 it("rejects control characters, blank notes and untrimmed references",async()=>{
  const p=await financialPayment(db),id=String((await recordObservation(db,incidentObservation(p))).case_id);
  for(const data of [{note:" "},{note:"text\nnewline"},{note:"valid text",reference:" leading "}]){
   await expect(incidentAdminCall(db,"report_rectification",id,2,randomUUID(),data)).rejects.toMatchObject({code:"22023"});
  }
  expect(await entries(id)).toBe(1);
 });
 it("enforces revocation, bans, deletion and withdrawn global role on every administrator request",async()=>{
  const p=await financialPayment(db),id=String((await recordObservation(db,incidentObservation(p))).case_id);
  await db.query("delete from auth.sessions where id=$1",[incidentAdminSid]);
  await expect(incidentAdminCall(db,"detail",id)).rejects.toMatchObject({code:"42501"});
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)",[incidentAdminSid,incidentAdmin]);
  for(const column of ["banned_until","deleted_at"]){
   await db.query("update auth.users set "+column+"=now()+interval '1 day' where id=$1",[incidentAdmin]);
   await expect(incidentAdminCall(db,"detail",id)).rejects.toMatchObject({code:"42501"});
   await db.query("update auth.users set "+column+"=null where id=$1",[incidentAdmin]);
  }
  await db.query("delete from private.tc_admins where user_id=$1",[incidentAdmin]);
  await expect(incidentAdminCall(db,"detail",id)).rejects.toMatchObject({code:"42501"});
  await db.query("insert into private.tc_admins(user_id) values($1)",[incidentAdmin]);
  await expect(incidentAdminCall(db,"detail",id, null,null,{},incidentAdmin,null)).rejects.toMatchObject({code:"42501"});
 });
 it("preserves provider observations and operator audit against UPDATE, DELETE and TRUNCATE",async()=>{
  for(const table of ["tc_subscription_financial_cases","tc_subscription_financial_entries"])
   for(const statement of ["update private."+table+" set created_at=now()","delete from private."+table,"truncate private."+table])
    await expect(db.exec(statement)).rejects.toThrow("manual_invoice_intake_immutable");
 });
 it("paginates history by immutable version without omitting or repeating entries",async()=>{
  const p=await financialPayment(db),base=incidentObservation(p);
  let caseId="";
  for(let i=0;i<53;i++)caseId=String((await recordObservation(db,{...base,event_id:base.event_id+"Page"+i})).case_id);
  const first=await incidentAdminCall(db,"history",caseId);
  expect((first.items as Json[])).toHaveLength(50);
  expect(first.next_before_version).toBe(5);
  const last=await incidentAdminCall(db,"history",caseId,null,null,{before_version:first.next_before_version});
  expect((last.items as Json[]).map(x=>x.row_version)).toEqual([4,3,2]);
  expect(last.next_before_version).toBeNull();
  expect(new Set([...(first.items as Json[]),...(last.items as Json[])].map(x=>x.id)).size).toBe(53);
 });
});

describe("known paid-event replay after refunds: original63 proof, no write or new licence",()=>{
 it.each([false,true])("matches exact original digest for monthly=%s using real63 bridge receipts",async monthly=>{
  const p=await financialPayment(db,monthly);
  await recordObservation(db,incidentObservation(p));
  const before=await incidentOriginalSnapshot(db,p);
  await db.exec("begin read only");
  try{expect(await knownOriginal(db,p)).toEqual({contract:"manual-stripe-known-payment-event-v1",known:true});}
  finally{await db.exec("rollback");}
  expect(await incidentOriginalSnapshot(db,p)).toEqual(before);
 });
 it.each(["account","mode","type","resource","created"])("does not acknowledge a conflicting %s of an existing event",async change=>{
  const p=await financialPayment(db,true);
  const override=change==="type"?{type:"checkout.session.completed"}:change==="resource"?{resource_id:"in_Different"}:
   change==="created"?{created:Number(p.proof.provider_event_created)-1}:{};
  await expect(knownOriginal(db,p,override,change==="account"?"acct_Another":incidentAccount,change==="mode"?"live":"test"))
   .rejects.toMatchObject({code:"23514"});
 });
 it("returns unknown for a new event instead of bypassing canonical funding acceptance",async()=>{
  const p=await financialPayment(db);
  expect(await knownOriginal(db,p,{id:"evt_NotPreviouslyAccepted"})).toMatchObject({known:false});
 });
 it("fails closed for a legacy/missing proof digest instead of reconstructing invented evidence",async()=>{
  const p=await financialPayment(db);
  await db.query("insert into private.tc_manual_stripe_bridge_receipts(provider_event_id,provider_account_id,mode,payment_kind,provider_payment_id,request_id,task_id,proof_sha256) select 'evt_LegacyIncidentBadProof',provider_account_id,mode,payment_kind,provider_payment_id,request_id,task_id,repeat('0',64) from private.tc_manual_stripe_bridge_receipts where provider_event_id=$1",[p.event]);
  await expect(knownOriginal(db,p,{id:"evt_LegacyIncidentBadProof"})).rejects.toMatchObject({code:"23514"});
 });
 it("never grants browser roles the read-only payment proof capability",async()=>{
  for(const role of ["anon","authenticated"])
   await expect(withDbRole(db,role,()=>db.query("select public.tc_manual_subscription_known_payment_event('acct_X','test','{}'::jsonb)")))
    .rejects.toThrow();
 });
});
