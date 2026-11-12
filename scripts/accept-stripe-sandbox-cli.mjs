// Real, authenticated Stripe TEST API through the authorized official CLI.
// The production handlers run locally; all SQL is a fresh disposable PGlite DB.
// No CLI key/token is read, exported, logged, or used outside the CLI.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createManualStripeWebhookHandler } from '../supabase/functions/truckcontrol-stripe-fiscal/handler.ts';
import { createStripeIncidentHandler } from '../supabase/functions/truckcontrol-stripe-incidents/handler.ts';
import { financialDatabase, withDbRole } from '../tests/helpers/subscription-financial-db.ts';
const run = promisify(execFile);
if(process.env.TRUCKCONTROL_RUN_STRIPE_SANDBOX!=='yes')throw Error('Explicit isolated sandbox acceptance opt-in required');
const cli=process.env.STRIPE_CLI_BIN||'stripe';
const account='acct_1UWYX5ECykZtDl5d';
const directory=process.env.TRUCKCONTROL_STRIPE_SANDBOX_ARTIFACTS||join('/tmp','truckcontrol-stripe-sandbox-'+randomUUID());
mkdirSync(directory,{recursive:true});
const output=join(directory,'stripe-sandbox-result.json');
if(existsSync(output))throw Error('Preserve existing acceptance receipt; select an empty artifact directory');
const proof={started_at:new Date().toISOString(),account,livemode:false,real_money_eur:0,
  transport:'Official Stripe CLI forwards signed real sandbox events; canonical API reads use the same authorized CLI. No backend API key is exported.',
  persistence:'Fresh local PGlite with all reviewed migrations, never managed production',
  limitations:['Not a completed browser Checkout purchase','Not a production-registered webhook or production backend key acceptance','Cancellation does not certify production licence suspension','No fiscal invoice issued or delivered'],checks:[],events:[],provider_reads:[],resources:{}};
let db, listener, server, webhookSecret='', customer, subscription;
const check=(name,ok)=>{if(!ok)throw Error(name);proof.checks.push(name);};
async function api(args){
  if(args.some(x=>x==='--live'||x==='--api-key'))throw Error('Forbidden live/credential argument');
  if(args[0]==='get'&&args[1]?.includes('?')){const url=new URL(args[1],'https://api.stripe.com');args=[args[0],url.pathname,...Array.from(url.searchParams).flatMap(([k,v])=>['-d',k+'='+v]),...args.slice(2)];}
  const {stdout}=await run(cli,args,{timeout:20000,maxBuffer:262144});
  const s=stdout.replace(/\x1b\[[0-9;]*m/g,'');
  const data=JSON.parse(s.slice(s.indexOf('{'),s.lastIndexOf('}')+1));
  if(data.error)throw Error('stripe_api_error');
  return data;
}
const wait=async(predicate,timeout=60000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,200));}throw Error('wait_timeout');};
try{
  const identity=await api(['whoami','--format','json']);
  check('Official CLI is authorized only for the explicitly selected test account for this run',identity.authorized===true&&identity.account_id===account&&identity.mode==='test');
  const actual=await api(['get','/v1/account']);check('Canonical Stripe account identity matches the existing sandbox',actual.id===account);
  db=await financialDatabase();
  const user=randomUUID(),request=randomUUID();
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'qa-stripe-20261112@example.invalid',now(),$2::jsonb)",[user,JSON.stringify({truckcontrol_registration:{contact_name:'Synthetic QA operator',company_name:'Synthetic Stripe QA 20261112',tax_id:'DEMO-STRIPE-20261112',address:'Synthetic QA street 112',phone:'+12025550911',requested_plan:'limited'}})]);
  const org=(await db.query('select id from public.organizations where owner_id=$1',[user])).rows[0].id;
  const checkout='cs_test_LocalQA'+request.replaceAll('-','');
  await db.query("insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents) select $1,$2,id,36300,revision,'checkout',$3,30000,2100,6300 from private.tc_plans where id='limited'",[request,user,checkout]);
  await db.query("insert into private.tc_subscription_orders(user_id,request_id,checkout_id,terms_version) values($1,$2,$3,'isolated-real-sandbox-20261112')",[user,request,checkout]);
  await db.query("insert into private.tc_manual_stripe_channels(provider_account_id,mode,enabled,isolated_test_instance) values($1,'test',true,true)",[account]);
  const fetcher=async(input,init)=>{
    const url=new URL(String(input));
    if(url.origin!=='https://api.stripe.com'||!url.pathname.startsWith('/v1/')||init?.method!=='GET')throw Error('Noncanonical provider request');
    const version=new Headers(init.headers).get('Stripe-Version');
    const args=['get',url.pathname+url.search];if(version)args.push('--stripe-version',version);
    const data=await api(args);proof.provider_reads.push(url.pathname+url.search);
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const config=()=>({enabled:true,schemaAccepted:true,knownPaymentEvents:false,mode:'test',expectedAccountId:account,
    // Format marker for injected CLI transport; deliberately NOT an API credential.
    stripeKey:'sk_test_OfficialCLITransportMarker',webhookSecret});
  const payments=[];let replayEnvelope=null;
  const paymentHandler=()=>createManualStripeWebhookHandler({applyPayment:async(p)=>{
    const {kind,provider_account_id,...data}=p;
    await withDbRole(db,'service_role',()=>db.query('select public.tc_manual_subscription_apply_payment($1,$2,$3::jsonb)',[kind,provider_account_id,JSON.stringify(data)]));payments.push(p);
  }},config(),fetcher);
  const incidentHandler=()=>createStripeIncidentHandler({record:async(a,mode,data)=>{
    await withDbRole(db,'service_role',()=>db.query('select public.tc_manual_subscription_record_incident($1,$2,$3::jsonb)',[a,mode,JSON.stringify(data)]));
  }},config(),fetcher);
  server=createServer(async(req,res)=>{
    try{
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)throw Error('body_limit');}
      const event=JSON.parse(raw);
      if(event.livemode!==false){res.writeHead(400);res.end();return;}
      const target=event.type==='invoice.paid'?paymentHandler():incidentHandler();
      const response=await target(new Request('http://127.0.0.1/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':req.headers['stripe-signature']||''},body:raw}));
      const body=await response.text();let code;try{code=JSON.parse(body).error;}catch{}
      proof.events.push({id:event.id,type:event.type,status:response.status,error:code||null});writeFileSync(output+'.progress',JSON.stringify({checks:proof.checks,events:proof.events,resources:proof.resources}));
      if(event.type==='invoice.paid'&&response.status===200)replayEnvelope={raw,signature:req.headers['stripe-signature']};
      res.writeHead(response.status,{'Content-Type':'application/json'});res.end(body);
    }catch{res.writeHead(503);res.end('{"error":"isolated_test_error"}');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;
  listener=spawn(cli,['listen','--events','invoice.paid,refund.created,refund.updated,charge.refunded','--forward-to',`http://127.0.0.1:${port}/webhook`],{stdio:['ignore','pipe','pipe'],detached:true});
  let listenerText='';for(const stream of [listener.stdout,listener.stderr])stream.on('data',b=>{listenerText=(listenerText+b.toString()).slice(-16384);const m=listenerText.match(/whsec_[A-Za-z0-9]+/);if(m)webhookSecret=m[0];});
  await wait(()=>Boolean(webhookSecret),45000);check('Official CLI webhook signing secret obtained only in process memory',true);
  customer=await api(['customers','create','--name','Synthetic TruckControl QA 20261112','--payment-method','pm_card_visa','-d','invoice_settings[default_payment_method]=pm_card_visa','-d','metadata[application]=truckcontrol-ai','-d','metadata[purpose]=isolated-signed-acceptance-20261112','--idempotency','tc-qa-customer-20261112-'+request]);
  check('Synthetic customer created strictly in sandbox',customer.livemode===false);
  proof.resources.customer=customer.id;
  const price=await api(['get','/v1/prices/price_1UZVzXECykZtDl5d70qBU4vQ']);check('Existing test monthly price is EUR36300 with no production price changes',price.livemode===false&&price.unit_amount===36300&&price.currency==='eur');
  subscription=await api(['subscriptions','create','--customer',customer.id,'--payment-behavior','error_if_incomplete','-d','items[0][price]='+price.id,'-d','metadata[application]=truckcontrol-ai','-d','metadata[purpose]=isolated-signed-acceptance-20261112','-d','metadata[tc_user_id]='+user,'-d','metadata[tc_company_id]='+org,'-d','metadata[tc_request_id]='+request,'--idempotency','tc-qa-subscription-20261112-'+request]);
  proof.resources.subscription=subscription.id;
  check('Real sandbox subscription is active',subscription.livemode===false&&subscription.status==='active');
  await wait(()=>payments.length===1,90000);
  const payment=payments[0];check('Authentic signed sandbox invoice reconciles and persists atomically',payment.kind==='subscription_invoice'&&payment.amount_cents===36300&&payment.livemode===false&&payment.user_id===user&&payment.company_id===org);
  const tasks=()=>db.query('select id from private.tc_manual_subscription_invoice_tasks where request_id=$1',[request]);
  check('Exactly one invoice request from the funded subscription', (await tasks()).rows.length===1);
  const before=(await db.query('select to_jsonb(c) data from private.tc_customers c where user_id=$1',[user])).rows[0].data;
  const replay=await paymentHandler()(new Request('http://127.0.0.1/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':replayEnvelope.signature},body:replayEnvelope.raw}));
  check('Exact signed event replay is idempotent',replay.status===200&&(await tasks()).rows.length===1);
  const reads=proof.provider_reads.length;
  const denied=await paymentHandler()(new Request('http://127.0.0.1/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':'t=1,v1=invalid'},body:replayEnvelope.raw}));
  check('Invalid signature rejected before any provider read',denied.status===400&&proof.provider_reads.length===reads);
  const ip=await api(['get','/v1/invoice_payments?invoice='+payment.invoice_id+'&status=paid&limit=2']);
  const pi=ip.data?.[0]?.payment?.payment_intent;
  if(typeof pi!=='string')throw Error('No canonical funded test intent');
  const intent=await api(['get','/v1/payment_intents/'+pi]);check('Refund targets only this newly created test customer and funded intent',intent.livemode===false&&intent.customer===customer.id);
  const refund=await api(['refunds','create','--payment-intent',pi,'--amount','5000','--idempotency','tc-qa-refund-20261112-'+request]);
  proof.resources.refund=refund.id;
  await wait(async()=>Number((await db.query('select count(*)::int n from private.tc_subscription_financial_cases where task_id in (select id from private.tc_manual_subscription_invoice_tasks where request_id=$1)',[request])).rows[0].n)===1,90000);
  check('Real test refund reaches signed incident reconciliation and isolated immutable ledger',true);
  const after=(await db.query('select to_jsonb(c) data from private.tc_customers c where user_id=$1',[user])).rows[0].data;
  check('Refund observation preserves licence pending manual review',JSON.stringify(before)===JSON.stringify(after));
  proof.complete=true;
}catch(error){proof.complete=false;proof.failure_code=String(error?.message||'unknown').slice(0,140).replace(/(?:sk|rk|whsec)_[A-Za-z0-9_]+/g,'[redacted]');}
finally{
  if(subscription?.id){try{const cancelled=await api(['subscriptions','cancel',subscription.id,'--confirm']);proof.subscription_cleanup=cancelled.status==='canceled';}catch{proof.subscription_cleanup=false;}}
  if(listener?.pid){try{process.kill(-listener.pid,'SIGTERM');}catch{}}
  server?.closeAllConnections();await new Promise(r=>server?server.close(r):r());await db?.close();
  proof.finished_at=new Date().toISOString();writeFileSync(output,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({complete:proof.complete,checks:proof.checks.length,events:proof.events,provider_reads:proof.provider_reads.length,failure_code:proof.failure_code||null,real_money_eur:0,receipt:output}));
  if(!proof.complete)process.exitCode=1;
}
