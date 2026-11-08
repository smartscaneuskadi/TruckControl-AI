import { expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync,readdirSync } from "node:fs";

type Json = Record<string,unknown>;
type Buyer = {user:string;request:string;company:string;checkout:string;session:string};
const account="acct_SyntheticPipeline";
const userA="fbc10000-0000-4000-8000-000000000001";
const userB="fbc10000-0000-4000-8000-000000000002";

// One acceptance case exercises the REAL migrated RPC, not the standalone
// proposal or a mock of billing/intake/queue. All data remain in PGlite.
// It proves SQL atomicity, not a Stripe charge, TicketBAI issue or mail delivery.
it("pipeline63: pago/licencia/ledger/outbox atómicos, replay y renovaciones independientes sin enviar",async()=>{
  const db=new PGlite();
  let external:ReturnType<typeof vi.spyOn>|undefined;
  try {
    await db.exec(`
      create role anon nologin;create role authenticated nologin;
      create role service_role nologin bypassrls;create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
        phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
        raw_user_meta_data jsonb not null default '{}');
      create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $uid$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $uid$;
      create function auth.jwt() returns jsonb language sql stable as $jwt$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $jwt$;
      grant usage on schema auth,public to anon,authenticated,service_role;
    `);
    const migrations=readdirSync("supabase/migrations").filter(name=>name.endsWith(".sql")).sort();
    expect(migrations).toContain("20261108100352_manual_subscription_payment_and_documents.sql");
    for(const file of migrations) await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
    // No proposal file is loaded or substituted. An incomplete composition
    // must fail before fixtures and cannot silently fall back to a mock.
    expect((await db.query<{installed:boolean}>(`
      select to_regprocedure('public.tc_manual_subscription_apply_payment(text,text,jsonb)') is not null
        and to_regclass('private.tc_manual_invoice_notice_outbox') is not null installed
    `)).rows).toEqual([{installed:true}]);
    external=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>{throw Error("external_network_forbidden_in_sql_pipeline");});
    const globalBefore=(await db.query<{value:unknown}>("select to_jsonb(s) value from private.tc_settings s where id")).rows[0].value;
    await db.exec("begin");

    async function asRole(query:string,params:unknown[]=[],role:"service_role"|"authenticated"="service_role") {
      await db.exec("savepoint pipeline_rpc");
      try {
        await db.exec("set local role "+role);
        const result=await db.query<{result:Json}>(query,params);
        await db.exec("reset role;release savepoint pipeline_rpc");
        return result.rows[0].result;
      } catch(error) {
        await db.exec("rollback to savepoint pipeline_rpc;reset role;release savepoint pipeline_rpc");
        throw error;
      }
    }
    async function buyer(user:string,n:number):Promise<Buyer> {
      const request="fbc20000-0000-4000-8000-"+String(n).padStart(12,"0");
      const session="fbc11000-0000-4000-8000-"+String(n).padStart(12,"0");
      const checkout="cs_test_Pipeline"+n;
      await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
        [user,"pipeline-"+n+"@example.invalid",JSON.stringify({truckcontrol_registration:{
          contact_name:"Persona ficticia pipeline",company_name:"Empresa ficticia pipeline "+n,
          tax_id:"SYNTHETIC-PIPELINE-"+n,address:"Direccion ficticia pipeline 123",
          phone:"+1202555010"+n,requested_plan:"limited",
        }})]);
      await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 hour')",[session,user]);
      const company=(await db.query<{id:string}>("select id from public.organizations where owner_id=$1",[user])).rows[0].id;
      await db.query(`insert into private.tc_payment_requests(
        id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents
      ) select $1,$2,id,36300,revision,'checkout',$3,30000,2100,6300 from private.tc_plans where id='limited'`,
        [request,user,checkout]);
      return {user,request,company,checkout,session};
    }
    const a=await buyer(userA,1),b=await buyer(userB,2);
    await db.query(`insert into private.tc_subscription_orders(user_id,request_id,checkout_id,terms_version)
      values($1,$2,$3,'synthetic-pipeline-acceptance')`,[b.user,b.request,b.checkout]);
    // Sandbox channel exists ONLY inside this isolated, rolled-back test DB.
    await db.query(`insert into private.tc_manual_stripe_channels(
      provider_account_id,mode,enabled,isolated_test_instance
    ) values($1,'test',true,true)`,[account]);
    const epoch=Math.floor(Date.now()/1000);
    const initial:Json={
      provider_event_id:"evt_PipelineInitial",provider_event_type:"checkout.session.completed",
      provider_event_created:epoch,provider_payment_id:"pi_PipelineInitial",request_id:a.request,
      user_id:a.user,company_id:a.company,amount_cents:36300,currency:"EUR",
      paid_at:new Date((epoch-2)*1000).toISOString(),livemode:false,
      checkout_id:a.checkout,customer_id:"cus_PipelineA",
    };
    async function call(kind:string,payload:Json) {
      return asRole("select public.tc_manual_subscription_apply_payment($1,$2,$3::jsonb) result",
        [kind,account,JSON.stringify(payload)]);
    }
    async function snapshot() {
      return (await db.query<{result:Json}>(`select jsonb_build_object(
        'customers',(select coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]') from private.tc_customers c),
        'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from private.tc_payment_requests r),
        'payment_events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.event_id),'[]') from private.tc_payment_events e),
        'subscriptions',(select coalesce(jsonb_agg(to_jsonb(s) order by s.provider_id),'[]') from private.tc_billing_subscriptions s),
        'subscription_events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.event_id),'[]') from private.tc_subscription_events e),
        'subscription_invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by i.invoice_id),'[]') from private.tc_subscription_invoices i),
        'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from private.tc_manual_subscription_invoice_tasks t),
        'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.provider_event_id),'[]') from private.tc_manual_stripe_bridge_receipts r),
        'outbox',(select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]') from private.tc_manual_invoice_notice_outbox n),
        'notice_audit',(select coalesce(jsonb_agg(to_jsonb(n) order by n.notice_id,n.row_version),'[]') from private.tc_manual_invoice_notice_audit n)
      ) result`)).rows[0].result;
    }

    const beforeFailure=await snapshot();
    // Add one extra failing trigger in this test DB; do NOT disable or replace
    // any production guard, RLS policy, fiscal function or permission.
    await db.exec(`
      create function private.tc_pipeline_test_outbox_failure() returns trigger language plpgsql as $forced$
        begin raise exception 'synthetic_pipeline_outbox_failure';end;$forced$;
      create trigger zz_pipeline_outbox_failure before insert on private.tc_manual_invoice_notice_outbox
        for each row execute function private.tc_pipeline_test_outbox_failure();
    `);
    await expect(call("initial_payment",initial)).rejects.toThrow("synthetic_pipeline_outbox_failure");
    expect(await snapshot()).toEqual(beforeFailure);
    await db.exec("drop trigger zz_pipeline_outbox_failure on private.tc_manual_invoice_notice_outbox;drop function private.tc_pipeline_test_outbox_failure()");

    const first=await call("initial_payment",initial);
    expect(first).toMatchObject({contract:"manual-stripe-payment-bridge-v1",received:true,duplicate:false});
    expect((await db.query(`select r.status,c.status customer_status,c.paid_until is not null and c.paid_until>now() paid_access,
      (select count(*)::int from private.tc_manual_subscription_invoice_tasks where request_id=r.id) tasks,
      (select count(*)::int from private.tc_manual_stripe_bridge_receipts where request_id=r.id) receipts,
      (select count(*)::int from private.tc_manual_invoice_notice_outbox n join private.tc_manual_subscription_invoice_tasks t on t.id=n.task_id where t.request_id=r.id) notices
      from private.tc_payment_requests r join private.tc_customers c on c.user_id=r.user_id where r.id=$1`,[a.request])).rows)
      .toEqual([{status:"paid",customer_status:"active",paid_access:true,tasks:1,receipts:1,notices:1}]);

    const afterInitial=await snapshot();
    expect(await call("initial_payment",initial)).toMatchObject({received:true,duplicate:true,task_id:first.task_id});
    expect(await snapshot()).toEqual(afterInitial);
    // The saved license also works through the actual authenticated access API
    // with a current session; no fake user_metadata admin flag is involved.
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [a.user,JSON.stringify({sub:a.user,role:"authenticated",session_id:a.session})]);
    expect(await asRole("select public.tc_my_access() result",[],"authenticated"))
      .toMatchObject({active:true,plan:"limited",max_trucks:50,payments_enabled:false});
    await db.exec("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)");

    function monthly(second:boolean):Json {
      const start=epoch+(second?30*86400:0),invoice=second?"in_PipelineSecond":"in_PipelineFirst";
      return {
        provider_event_id:second?"evt_PipelineSecond":"evt_PipelineFirst",provider_event_type:"invoice.paid",
        provider_event_created:epoch+(second?2:1),provider_payment_id:invoice,invoice_id:invoice,
        request_id:b.request,user_id:b.user,company_id:b.company,amount_cents:36300,currency:"EUR",
        paid_at:new Date((epoch-2)*1000).toISOString(),livemode:false,checkout_id:b.checkout,
        subscription_id:"sub_PipelineB",customer_id:"cus_PipelineB",
        invoice_period_start:start,invoice_period_end:start+30*86400,
        subscription_current_period_end:start+30*86400,unit_amount:36300,subscription_state:"active",
        cancel_at_period_end:false,billing_reason:second?"subscription_cycle":"subscription_create",
      };
    }
    const monthOne=await call("subscription_invoice",monthly(false));
    const monthTwo=await call("subscription_invoice",monthly(true));
    expect(monthOne.task_id).not.toBe(monthTwo.task_id);
    const periods=(await db.query<{invoice:string;notice:string;request_id:string;start:string;end:string}>(`
      select t.provider_invoice_id invoice,n.id::text notice,t.request_id::text,
        t.period_start::text start,t.period_end::text "end"
      from private.tc_manual_subscription_invoice_tasks t
      join private.tc_manual_invoice_notice_outbox n on n.task_id=t.id
      where t.request_id=$1 order by t.period_start`,[b.request])).rows;
    expect(periods).toHaveLength(2);
    expect(periods.map(row=>row.invoice)).toEqual(["in_PipelineFirst","in_PipelineSecond"]);
    expect(periods.map(row=>row.request_id)).toEqual([b.request,b.request]);
    expect(periods[0].notice).not.toBe(periods[1].notice);
    expect(periods[0].end).toBe(periods[1].start);
    const beforeMonthlyReplay=await snapshot();
    expect(await call("subscription_invoice",monthly(true))).toMatchObject({duplicate:true,task_id:monthTwo.task_id});
    expect(await snapshot()).toEqual(beforeMonthlyReplay);

    // Even with worker enabled, synthetic Stripe mode must NEVER acquire a
    // sending lease. No transport/worker is invoked by this SQL-only test.
    await db.exec("update private.tc_manual_invoice_notice_settings set enabled=true where id");
    for(let i=0;i<3;i++)
      expect(await asRole("select public.tc_manual_invoice_notice_claim() result")).toBeNull();
    expect((await db.query("select count(*)::int notices,sum(attempts)::int attempts,bool_and(mode='test' and status='pending' and provider_email_id is null) safely_pending from private.tc_manual_invoice_notice_outbox")).rows)
      .toEqual([{notices:3,attempts:0,safely_pending:true}]);
    expect((await db.query("select count(*)::int n from private.tc_manual_invoice_notice_audit where to_status='leased'")).rows)
      .toEqual([{n:0}]);
    expect((await db.query<{value:unknown}>("select to_jsonb(s) value from private.tc_settings s where id")).rows[0].value)
      .toEqual(globalBefore);
    expect(external).not.toHaveBeenCalled();

    await db.exec("rollback");
    expect((await db.query("select count(*)::int n from auth.users where id::text like 'fbc10000-%'")).rows)
      .toEqual([{n:0}]);
    expect((await db.query("select count(*)::int n from private.tc_manual_invoice_notice_outbox")).rows)
      .toEqual([{n:0}]);
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_invoice_tasks")).rows)
      .toEqual([{n:0}]);
    expect((await db.query("select enabled from private.tc_manual_invoice_notice_settings where id")).rows)
      .toEqual([{enabled:false}]);
  } finally {
    external?.mockRestore();
    await db.close();
  }
},120000);
