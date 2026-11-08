import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync,readdirSync } from "node:fs";
const buyerA="fba10000-0000-4000-8000-000000000001",buyerB="fba10000-0000-4000-8000-000000000002";
const requests=["fba20000-0000-4000-8000-000000000001","fba20000-0000-4000-8000-000000000002","fba20000-0000-4000-8000-000000000003"];
let db:PGlite,taskA="",taskB="",taskTest="";
const baseClock="2026-11-08T12:00:00Z";
async function roleQuery(query:string,params:unknown[]=[],role:"service_role"|"authenticated"|"anon"="service_role") {
  await db.exec("savepoint notice_attempt");
  try {
    await db.exec("set local role "+role);
    const result=await db.query<Record<string,unknown>>(query,params);
    await db.exec("reset role;release savepoint notice_attempt");
    return result.rows;
  } catch(error) {
    await db.exec("rollback to savepoint notice_attempt;reset role;release savepoint notice_attempt");
    throw error;
  }
}
async function clock(value:string) {
  await db.query("select set_config('truckcontrol_test.notice_clock',$1,true)",[value]);
}
async function enable() {await db.exec("update private.tc_manual_invoice_notice_settings set enabled=true where id");}
async function enqueue(task=taskA) {
  return (await roleQuery("select private.tc_manual_invoice_notice_enqueue($1::uuid) id",[task]))[0].id as string;
}
async function claim() {
  return (await roleQuery("select public.tc_manual_invoice_notice_claim() result"))[0].result as null|{notice:{
    id:string;task_id:string;lease_token:string;row_version:number;attempt:number;first_attempt_at:string;lease_until:string;
  }};
}
async function finish(n:NonNullable<Awaited<ReturnType<typeof claim>>>["notice"],outcome:string,provider:string|null=null) {
  return (await roleQuery("select public.tc_manual_invoice_notice_finish($1,$2,$3,$4,$5) result",
    [n.id,n.lease_token,n.row_version,outcome,provider]))[0].result as {status:string;replayed:boolean};
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
      phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));
    create function auth.uid() returns uuid language sql stable as $uid$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $uid$;
    create function auth.jwt() returns jsonb language sql stable as $jwt$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $jwt$;
    grant usage on schema auth,public to anon,authenticated,service_role;
  `);
  for(const f of readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort())
    await db.exec(readFileSync("supabase/migrations/"+f,"utf8"));
  // The standalone D branch lacks B's proposal. Model only its external
  // receipt contract; this NEVER asserts Stripe settlement. In the composite
  // migration use the actual B tables instead of replacing them.
  const bridge=(await db.query<{present:boolean}>("select to_regclass('private.tc_manual_stripe_bridge_receipts') is not null present")).rows[0].present;
  if(!bridge) await db.exec(`
    create table private.tc_manual_stripe_channels(
      provider_account_id text not null,mode text not null,enabled boolean not null default false,
      isolated_test_instance boolean not null default false,commercial_approved_at timestamptz,
      approval_reference text,primary key(provider_account_id,mode));
    create table private.tc_manual_stripe_bridge_receipts(
      provider_event_id text primary key,provider_account_id text not null,mode text not null,
      payment_kind text not null,provider_payment_id text not null,
      request_id uuid not null references private.tc_payment_requests(id),task_id uuid not null,
      proof_sha256 text not null,created_at timestamptz not null default now(),
      foreign key(provider_account_id,mode) references private.tc_manual_stripe_channels(provider_account_id,mode),
      foreign key(task_id,provider_account_id) references private.tc_manual_subscription_invoice_tasks(id,provider_account_id));
  `);
  const installed=(await db.query<{present:boolean}>("select to_regclass('private.tc_manual_invoice_notice_outbox') is not null present")).rows[0].present;
  if(!installed) await db.exec(readFileSync("docs/verification/manual-invoice-notifications.proposal.sql","utf8"));
  // Deterministic TIME ONLY, changed solely in this ephemeral test DB. The
  // production clock has no GUC override and uses clock_timestamp() directly.
  await db.exec(`
    create or replace function private.tc_manual_invoice_notice_clock() returns timestamptz
    language sql volatile security invoker set search_path='' as $clock$
      select coalesce(nullif(current_setting('truckcontrol_test.notice_clock',true),'')::timestamptz,clock_timestamp())
    $clock$;
  `);
  for(const [user,n] of [[buyerA,"A"],[buyerB,"B"]]) {
    await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
      [user,"notice-"+n+"@example.invalid",JSON.stringify({truckcontrol_registration:{
        contact_name:"Persona ficticia "+n,company_name:"Empresa ficticia "+n,tax_id:"SYNTHETIC-NOTICE-"+n,
        address:"Direccion ficticia 123",phone:n==="A"?"+12025550901":"+12025550902",requested_plan:"limited",
      }})]);
  }
  await db.exec("insert into private.tc_manual_stripe_channels(provider_account_id,mode) values('acct_NoticeSynthetic','live'),('acct_NoticeSynthetic','test')");
  const taskIds:string[]=[];
  for(const [index,user] of [buyerA,buyerB,buyerA].entries()) {
    const company=(await db.query<{id:string}>("select id from public.organizations where owner_id=$1",[user])).rows[0].id;
    await db.query("insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,net_cents,vat_rate_bps,vat_cents) select $1,$2,id,36300,revision,'paid',30000,2100,6300 from private.tc_plans where id='limited'",[requests[index],user]);
    const id=(await db.query<{id:string}>("select private.tc_manual_subscription_invoice_intake($1,$2,$3,$4,$5,36300,now()-interval '1 hour') id",
      ["acct_NoticeSynthetic","evt_NoticeSynthetic"+index,"pi_NoticeSynthetic"+index,requests[index],company])).rows[0].id;
    taskIds.push(id);
    await db.query("insert into private.tc_manual_stripe_bridge_receipts(provider_event_id,provider_account_id,mode,payment_kind,provider_payment_id,request_id,task_id,proof_sha256) values($1,'acct_NoticeSynthetic',$2,'initial_payment',$3,$4,$5,$6)",
      ["evt_NoticeSynthetic"+index,index===2?"test":"live","pi_NoticeSynthetic"+index,requests[index],id,"0".repeat(64)]);
  }
  [taskA,taskB,taskTest]=taskIds;
},120000);
beforeEach(async()=>{await db.exec("begin");await clock(baseClock);});
afterEach(async()=>{await db.exec("reset role;rollback");});
afterAll(async()=>{await db?.close();});
describe("outbox de avisos: privado, deduplicado y cerrado por defecto",()=>{
  it("encola una vez por tarea incluso con replays y arranca apagado",async()=>{
    const id=await enqueue();expect(await enqueue()).toBe(id);
    expect((await db.query("select recipient,status,attempts,mode from private.tc_manual_invoice_notice_outbox")).rows)
      .toEqual([{recipient:"pedidos@smartscaneuskadi.com",status:"pending",attempts:0,mode:"live"}]);
    expect((await db.query("select count(*)::int n from private.tc_manual_invoice_notice_audit")).rows).toEqual([{n:1}]);
    expect(await claim()).toBeNull();
  });
  it("rechaza tarea inexistente sin crear un aviso huérfano",async()=>{
    await expect(enqueue("fba90000-0000-4000-8000-000000000099")).rejects.toThrow();
    expect((await db.query("select count(*)::int n from private.tc_manual_invoice_notice_outbox")).rows).toEqual([{n:0}]);
  });
  it("no puede reclamarse una prueba Stripe aunque se habilite el worker",async()=>{
    await enqueue(taskTest);await enable();expect(await claim()).toBeNull();
  });
  it("un lease exclusivo impide segunda reclamación y requiere token/version exactos",async()=>{
    await enqueue();await enable();const first=(await claim())!;
    expect(first.notice.attempt).toBe(1);expect(await claim()).toBeNull();
    await expect(finish({...first.notice,row_version:first.notice.row_version+1},"accepted","fba50000-0000-4000-8000-000000000001")).rejects.toThrow();
    await expect(finish({...first.notice,lease_token:"fba60000-0000-4000-8000-000000000099"},"uncertain")).rejects.toThrow();
    const accepted=await finish(first.notice,"accepted","fba50000-0000-4000-8000-000000000001");
    expect(accepted.status).toBe("accepted");
    expect((await finish(first.notice,"accepted","fba50000-0000-4000-8000-000000000001")).replayed).toBe(true);
    expect(await claim()).toBeNull();
    expect((await db.query("select count(*)::int n from private.tc_manual_invoice_notice_audit")).rows).toEqual([{n:3}]);
  });
  it("limita a tres intentos, con backoff y jitter antes de volver a reclamar",async()=>{
    await enqueue();await enable();let firstAttempt:string|null=null;
    for(let attempt=1;attempt<=3;attempt++) {
      const c=(await claim())!;expect(c.notice.attempt).toBe(attempt);
      firstAttempt??=c.notice.first_attempt_at;expect(c.notice.first_attempt_at).toBe(firstAttempt);
      const done=await finish(c.notice,"retry_rate");
      expect(done.status).toBe(attempt===3?"failed":"retry_wait");
      expect(await claim()).toBeNull();
      const row=(await db.query<{due:string}>("select (extract(epoch from next_attempt_at)*1000)::text due from private.tc_manual_invoice_notice_outbox")).rows[0];
      if(attempt<3) await clock(new Date(Number(row.due)+1).toISOString());
    }
    expect((await db.query("select attempts,status,error_code from private.tc_manual_invoice_notice_outbox")).rows)
      .toEqual([{attempts:3,status:"failed",error_code:"attempts_exhausted"}]);
  });
  it("crash o aceptación con ACK perdido caduca a incertidumbre sin reenvío",async()=>{
    await enqueue();await enable();const c=(await claim())!;
    await clock(new Date(Date.parse(c.notice.lease_until)+1).toISOString());
    expect(await claim()).toBeNull();
    expect((await db.query("select attempts,status,error_code from private.tc_manual_invoice_notice_outbox")).rows)
      .toEqual([{attempts:1,status:"uncertain",error_code:"lease_expired"}]);
    await expect(finish(c.notice,"accepted","fba50000-0000-4000-8000-000000000001")).rejects.toThrow();
  });
  it("una respuesta incierta y un rechazo permanente quedan terminales",async()=>{
    await enqueue();await enqueue(taskB);await enable();
    const one=(await claim())!;await finish(one.notice,"uncertain");
    const two=(await claim())!;expect(two.notice.id).not.toBe(one.notice.id);await finish(two.notice,"failed");
    expect(await claim()).toBeNull();
    expect((await db.query("select status from private.tc_manual_invoice_notice_outbox order by status")).rows)
      .toEqual([{status:"failed"},{status:"uncertain"}]);
  });
  it("nunca reintenta al superar ventana propia23h menor que la de Resend24h",async()=>{
    await enqueue();await enable();const c=(await claim())!;await finish(c.notice,"retry_busy");
    await clock(new Date(Date.parse(c.notice.first_attempt_at)+23*3600000).toISOString());
    expect(await claim()).toBeNull();
    expect((await db.query("select status,error_code,attempts from private.tc_manual_invoice_notice_outbox")).rows)
      .toEqual([{status:"failed",error_code:"idempotency_window_expired",attempts:1}]);
  });
  it("cuenta leases antes del proveedor y aplica cuota diaria compartida por trabajadores",async()=>{
    await enqueue();await enqueue(taskB);await enable();
    await db.exec("update private.tc_manual_invoice_notice_settings set daily_limit=1 where id");
    const c=(await claim())!;await finish(c.notice,"failed");
    expect(await claim()).toBeNull();
    expect((await db.query("select count(*)::int n from private.tc_manual_invoice_notice_audit where to_status='leased'")).rows).toEqual([{n:1}]);
  });
  it("clientes de ambas empresas, anon y claims falsos no leen ni encolan",async()=>{
    await enqueue();
    for(const role of ["authenticated","anon"] as const) {
      await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [buyerA,JSON.stringify({sub:buyerA,role,user_metadata:{is_admin:true}})]);
      await expect(roleQuery("select public.tc_manual_invoice_notice_claim()",[],role)).rejects.toThrow();
      await expect(roleQuery("select private.tc_manual_invoice_notice_enqueue($1)",[taskB],role)).rejects.toThrow();
      await expect(roleQuery("select * from private.tc_manual_invoice_notice_outbox",[],role)).rejects.toThrow();
    }
  });
  it("el servicio solo usa RPC y la metadata/auditoría no se reescriben",async()=>{
    await enqueue();await enable();const c=(await claim())!;
    await expect(roleQuery("update private.tc_manual_invoice_notice_outbox set recipient='other@example.invalid'")).rejects.toThrow();
    await db.exec("savepoint protected_metadata");
    await expect(db.exec("update private.tc_manual_invoice_notice_outbox set recipient='other@example.invalid'")).rejects.toThrow();
    await db.exec("rollback to savepoint protected_metadata;release savepoint protected_metadata");
    await db.exec("savepoint protected_audit");
    await expect(db.exec("update private.tc_manual_invoice_notice_audit set attempts=99")).rejects.toThrow();
    await db.exec("rollback to savepoint protected_audit;release savepoint protected_audit");
    await finish(c.notice,"accepted","fba50000-0000-4000-8000-000000000001");
    const row=(await db.query<{data:Record<string,unknown>}>("select to_jsonb(n) data from private.tc_manual_invoice_notice_outbox n")).rows[0].data;
    expect(Object.keys(row).some(key=>/buyer|tax|address|body|pdf|api_key/i.test(key))).toBe(false);
    expect(row.recipient).toBe("pedidos@smartscaneuskadi.com");
  });
});
