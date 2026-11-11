import { describe,expect,it,vi } from "vitest";
import { createStripeIncidentHandler } from "../supabase/functions/truckcontrol-stripe-incidents/handler";
import { createManualStripeWebhookHandler } from "../supabase/functions/truckcontrol-stripe-fiscal/handler";
import { knownStripePaymentReplay } from "../supabase/functions/_shared/subscription-paid-replay";
import { persistStripeFinancialIncident,lookupKnownStripePayment } from "../supabase/functions/_shared/subscription-financial-persistence";
import { financialFixture,financialConfig,financialQuery,financialSignature,type FinancialObject } from "./helpers/stripe-financial-fixtures";

const enabled={...financialConfig,enabled:true,schemaAccepted:true};
function requestFor(f:ReturnType<typeof financialFixture>) {
 return new Request("https://isolated.invalid/provider",{method:"POST",
  headers:{"content-type":"application/json","stripe-signature":f.signature()},body:f.raw()});
}
function paidFixture(){
 const f=financialFixture("invoice.paid");
 const invoice=f.records["invoices/in_FinancialOriginal"];
 const parent=invoice.parent as {subscription_details:{metadata:FinancialObject}};
 const sub=f.records["subscriptions/sub_FinancialOriginal"];
 Object.assign(sub,{status:"active",cancel_at_period_end:false,latest_invoice:invoice.id,
  metadata:structuredClone(parent.subscription_details.metadata)});
 const item=(sub.items as {data:FinancialObject[]}).data[0];
 (item.price as FinancialObject).unit_amount=36300;
 const charge=f.records["charges/ch_FinancialOriginal"];
 Object.assign(charge,{amount_refunded:0,refunded:false,disputed:false});
 f.records["invoice_payments?invoice=in_FinancialOriginal&status=paid&limit=2"]=f.records[financialQuery];
 return f;
}
describe("financial webhook durable acknowledgement; no provider writes",()=>{
 it.each(["disabled","schema_pending"])("fails closed before provider and SQL when %s",async flag=>{
  const f=financialFixture(),record=vi.fn();
  const h=createStripeIncidentHandler({record},{...enabled,enabled:flag!=="disabled",schemaAccepted:flag!=="schema_pending"},f.fetcher);
  expect((await h(requestFor(f))).status).toBe(503);expect(record).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
 });
 it("passes only canonical observation to one durable RPC before acknowledgement",async()=>{
  const f=financialFixture(),record=vi.fn(async()=>{});
  const result=await createStripeIncidentHandler({record},enabled,f.fetcher)(requestFor(f));
  expect(result.status).toBe(200);expect(await result.json()).toEqual({received:true});
  expect(record).toHaveBeenCalledOnce();
  expect(record).toHaveBeenCalledWith(financialConfig.expectedAccountId,"test",expect.objectContaining({
   event_id:f.event.id,payment_intent_id:"pi_FinancialOriginal",charge_id:"ch_FinancialOriginal",currency:"EUR"}));
 });
 it("waits for transaction commit and suppresses a lost/failed persistence ACK",async()=>{
  const f=financialFixture();let resolve:(()=>void)|undefined;let started=false,finished=false;
  const record=vi.fn(async()=>{started=true;await new Promise<void>(yes=>{resolve=yes;});});
  const pending=createStripeIncidentHandler({record},enabled,f.fetcher)(requestFor(f)).then(x=>{finished=true;return x;});
  await vi.waitFor(()=>expect(started).toBe(true));expect(finished).toBe(false);resolve!();
  expect((await pending).status).toBe(200);
  const broken=await createStripeIncidentHandler({record:async()=>{throw Error("private-token/private-person");}},enabled,f.fetcher)(requestFor(f));
  expect(broken.status).toBe(503);expect(await broken.json()).toEqual({error:"subscription_incident_pipeline_unavailable"});
 });
 it("does not accept browser Origin or alternative methods as a provider capability",async()=>{
  const f=financialFixture(),record=vi.fn(),handler=createStripeIncidentHandler({record},enabled,f.fetcher);
  expect((await handler(new Request("https://isolated.invalid/provider"))).status).toBe(405);
  const request=requestFor(f);request.headers.set("origin","https://truckcontrolai.com");
  const result=await handler(request);expect(result.status).toBe(403);
  expect(result.headers.has("access-control-allow-origin")).toBe(false);
  expect(record).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
 });
 it("invalid HMAC or oversize body never reaches provider or persistence",async()=>{
  const f=financialFixture(),record=vi.fn(),handler=createStripeIncidentHandler({record},enabled,f.fetcher);
  const unsigned=new Request("https://isolated.invalid/provider",{method:"POST",headers:{"content-type":"application/json"},body:f.raw()});
  expect((await handler(unsigned)).status).toBe(400);
  const huge=new Request("https://isolated.invalid/provider",{method:"POST",headers:{"content-type":"application/json"},body:"x".repeat(65537)});
  expect((await handler(huge)).status).toBe(413);expect(record).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
 });
 it("returns retriable mapping failure and never ACKs an ambiguous invoice",async()=>{
  const f=financialFixture();f.records[financialQuery].has_more=true;const record=vi.fn();
  const result=await createStripeIncidentHandler({record},enabled,f.fetcher)(requestFor(f));
  expect(result.status).toBe(503);expect(await result.json()).toEqual({error:"financial_mapping_unavailable"});
  expect(record).not.toHaveBeenCalled();
 });
 it("acknowledges an unrelated signed type without provider or database activity",async()=>{
  const f=financialFixture("customer.updated"),record=vi.fn();
  expect((await createStripeIncidentHandler({record},enabled,f.fetcher)(requestFor(f))).status).toBe(200);
  expect(record).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
 });
});
describe("late original paid replay after a refund",()=>{
 it("uses HMAC, canonical account and Event before exact stored-proof lookup, with no payment write",async()=>{
  const f=paidFixture();Object.assign(f.records["charges/ch_FinancialOriginal"],{refunded:true,amount_refunded:36300});
  const knownPaymentEvent=vi.fn(async()=>true),applyPayment=vi.fn();
  const response=await createManualStripeWebhookHandler({knownPaymentEvent,applyPayment},
   {...enabled,knownPaymentEvents:true},f.fetcher)(requestFor(f));
  expect(response.status).toBe(200);expect(applyPayment).not.toHaveBeenCalled();
  expect(knownPaymentEvent).toHaveBeenCalledWith(financialConfig.expectedAccountId,"test",{
   id:f.event.id,type:"invoice.paid",created:f.event.created,resource_id:"in_FinancialOriginal"});
  expect(f.fetcher).toHaveBeenCalledTimes(2);
 });
 it("unknown original event still passes full funding and persists exactly once",async()=>{
  const f=paidFixture(),knownPaymentEvent=vi.fn(async()=>false),applyPayment=vi.fn(async()=>{});
  const response=await createManualStripeWebhookHandler({knownPaymentEvent,applyPayment},
   {...enabled,knownPaymentEvents:true},f.fetcher)(requestFor(f));
  expect(response.status).toBe(200);expect(knownPaymentEvent).toHaveBeenCalledOnce();expect(applyPayment).toHaveBeenCalledOnce();
 });
 it("a new event after refund cannot exploit the known-event read path",async()=>{
  const f=paidFixture();Object.assign(f.records["charges/ch_FinancialOriginal"],{refunded:true,amount_refunded:36300});
  const knownPaymentEvent=vi.fn(async()=>false),applyPayment=vi.fn();
  const response=await createManualStripeWebhookHandler({knownPaymentEvent,applyPayment},
   {...enabled,knownPaymentEvents:true},f.fetcher)(requestFor(f));
  expect(response.status).toBe(400);expect(applyPayment).not.toHaveBeenCalled();
 });
 it("missing64 capability or lookup error is retriable with no new grant",async()=>{
  for(const gateway of [{applyPayment:vi.fn()},{
   applyPayment:vi.fn(),knownPaymentEvent:vi.fn(async()=>{throw Error("private database");})}]){
   const f=paidFixture();
   const response=await createManualStripeWebhookHandler(gateway,{...enabled,knownPaymentEvents:true},f.fetcher)(requestFor(f));
   expect(response.status).toBe(503);expect(gateway.applyPayment).not.toHaveBeenCalled();
  }
 });
 it("default closed capability keeps the old full funding path, with no proof lookup",async()=>{
  const f=paidFixture(),knownPaymentEvent=vi.fn(),applyPayment=vi.fn(async()=>{});
  const response=await createManualStripeWebhookHandler({knownPaymentEvent,applyPayment},enabled,f.fetcher)(requestFor(f));
  expect(response.status).toBe(200);expect(knownPaymentEvent).not.toHaveBeenCalled();expect(applyPayment).toHaveBeenCalledOnce();
 });
 it("unsigned or canonically mismatched event never invokes the SQL lookup",async()=>{
  const f=paidFixture(),lookup=vi.fn(async()=>true);
  await expect(knownStripePaymentReplay(f.raw(),null,financialConfig,lookup,f.fetcher)).rejects.toThrow();
  expect(lookup).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
  const raw=f.raw();f.records["events/"+String(f.event.id)]={...f.event,created:1};
  await expect(knownStripePaymentReplay(raw,financialSignature(raw),financialConfig,lookup,f.fetcher)).rejects.toThrow();
  expect(lookup).not.toHaveBeenCalled();
 });
});
describe("typed financial persistence acknowledgements",()=>{
 const valid={contract:"subscription-financial-incidents-record-v1",received:true,duplicate:false,
  case_id:"fa930000-0000-4000-8000-000000000001"};
 const proof={event_id:"evt_PersistenceSynthetic"} as Parameters<typeof persistStripeFinancialIncident>[3];
 it("persists exactly one guarded RPC and accepts explicit duplicate acknowledgement",async()=>{
  const rpc=vi.fn(async()=>({data:{...valid,duplicate:true},error:null}));
  await persistStripeFinancialIncident(rpc,financialConfig.expectedAccountId,"test",proof);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("tc_manual_subscription_record_incident",{
   p_account:financialConfig.expectedAccountId,p_mode:"test",p_data:proof});
 });
 it.each([null,{}, {...valid,contract:"older"},{...valid,case_id:"wrong"},{...valid,received:false},{...valid,duplicate:undefined}])
 ("rejects malformed or missing observation acknowledgement (%j)",async data=>{
  await expect(persistStripeFinancialIncident(async()=>({data,error:null}),financialConfig.expectedAccountId,"test",proof))
   .rejects.toThrow("subscription_incident_persistence_unavailable");
 });
 it("never leaks or retries a database/transport failure",async()=>{
  const rpc=vi.fn(async()=>{throw Error("PRIVATE-TRANSPORT");});
  await expect(persistStripeFinancialIncident(rpc,financialConfig.expectedAccountId,"test",proof))
   .rejects.toThrow("subscription_incident_persistence_unavailable");expect(rpc).toHaveBeenCalledOnce();
 });
 it.each([null,{}, {contract:"manual-stripe-known-payment-event-v1",known:1}])
 ("fails closed for malformed known-payment proof ACK (%j)",async data=>{
  await expect(lookupKnownStripePayment(async()=>({data,error:null}),financialConfig.expectedAccountId,"test",
   {id:"evt_Known",type:"invoice.paid",created:1,resource_id:"in_Known"})).rejects.toThrow("subscription_payment_replay_unavailable");
 });
});
