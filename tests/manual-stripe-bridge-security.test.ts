import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;
let counter = 0;
const account = "acct_IsolatedBridge";
const now = Math.floor(Date.now() / 1000);
type Obj = Record<string, unknown>;
interface Buyer { user: string; request: string; company: string; n: number; checkout: string }
async function role<T>(name: string, fn: () => Promise<T>) {
  await db.exec("set role " + name);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function buyer(): Promise<Buyer> {
  const n = ++counter;
  const suffix = String(n).padStart(12, "0");
  const user = "ed110000-0000-4000-8000-" + suffix;
  const request = "ed220000-0000-4000-8000-" + suffix;
  const checkout = "cs_test_Bridge" + n;
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)", [
    user, "bridge-" + n + "@example.invalid", JSON.stringify({ truckcontrol_registration: {
      contact_name: "Comprador ficticio", company_name: "Empresa aislada " + n,
      tax_id: "SYNTHETIC-" + n, address: "Calle de prueba aislada 123",
      phone: "+1202555" + String(1000 + n), requested_plan: "limited",
    } }),
  ]);
  const company = (await db.query<{id:string}>("select id from public.organizations where owner_id=$1", [user])).rows[0].id;
  await db.query(`insert into private.tc_payment_requests(
    id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents
  ) select $1,$2,id,36300,revision,'checkout',$3,30000,2100,6300 from private.tc_plans where id='limited'`,
  [request,user,checkout]);
  return { user,request,company,n,checkout };
}
function oneOff(b: Buyer, changes: Obj = {}) {
  return { provider_event_id: "evt_One" + b.n, provider_event_type: "checkout.session.completed",
    provider_event_created: now, provider_payment_id: "pi_One" + b.n,
    request_id: b.request,user_id: b.user,company_id: b.company,amount_cents: 36300,
    currency: "EUR",paid_at: new Date((now-2)*1000).toISOString(),livemode: false,
    checkout_id: b.checkout,customer_id: "cus_Buyer" + b.n,...changes };
}
function monthly(b: Buyer, second = false, changes: Obj = {}) {
  const start = now + (second ? 30 * 86400 : 0);
  return { ...oneOff(b), provider_event_id: (second ? "evt_Second" : "evt_First") + b.n,
    provider_event_type: "invoice.paid", provider_payment_id: (second ? "in_Second" : "in_First") + b.n,
    invoice_id: (second ? "in_Second" : "in_First") + b.n,subscription_id: "sub_Buyer" + b.n,
    customer_id: "cus_Buyer" + b.n,invoice_period_start: start,invoice_period_end: start + 30 * 86400,
    subscription_current_period_end: start + 30 * 86400,unit_amount: 36300,
    subscription_state: "active",cancel_at_period_end: false,
    billing_reason: second ? "subscription_cycle" : "subscription_create",...changes };
}
async function reserve(b: Buyer) {
  await db.query(`insert into private.tc_subscription_orders(
    user_id,request_id,checkout_id,terms_version) values($1,$2,$3,'isolated-test-v1')`,
    [b.user,b.request,b.checkout]);
}
async function call(kind: string, data: Obj, merchant = account) {
  return role("service_role", async () => (await db.query<{result:Obj}>(
    "select public.tc_manual_subscription_apply_payment($1,$2,$3::jsonb) result",
    [kind,merchant,JSON.stringify(data)])).rows[0].result);
}
async function snapshot(b: Buyer) {
  return (await db.query<{result:Obj}>(`select jsonb_build_object(
    'paid_until',(select paid_until from private.tc_customers where user_id=$1),
    'request_status',(select status from private.tc_payment_requests where id=$2),
    'tasks',(select count(*) from private.tc_manual_subscription_invoice_tasks where request_id=$2),
    'receipts',(select count(*) from private.tc_manual_stripe_bridge_receipts where request_id=$2),
    'invoices',(select count(*) from private.tc_subscription_invoices where user_id=$1)
  ) result`,[b.user,b.request])).rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
      phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
      raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $auth$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $auth$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort())
    await db.exec(readFileSync("supabase/migrations/" + file,"utf8"));
  await db.exec(readFileSync("docs/verification/manual-stripe-bridge.proposal.sql","utf8"));
  // Only this ephemeral PGlite database enables synthetic Stripe mode.
  await db.query(`insert into private.tc_manual_stripe_channels(
    provider_account_id,mode,enabled,isolated_test_instance
  ) values($1,'test',true,true),('acct_OtherIsolated','test',true,true)`,[account]);
},30000);
afterAll(async () => { await db?.close(); });
describe("atomic Stripe-to-manual-fiscal proposal: isolated PGlite only", () => {
  it("denies browser roles regardless of JWT sub or direct private-table grants", async () => {
    const b = await buyer();
    for (const name of ["anon","authenticated"]) {
      await expect(role(name, () => db.query("select public.tc_manual_subscription_apply_payment($1,$2,$3)",
        ["initial_payment",account,JSON.stringify(oneOff(b))]))).rejects.toThrow();
      await expect(role(name, () => db.query("select * from private.tc_manual_stripe_channels"))).rejects.toThrow();
    }
    await db.exec(`grant select on private.tc_manual_stripe_bridge_receipts to authenticated;
      create policy bridge_synthetic_permissive on private.tc_manual_stripe_bridge_receipts
        for select to authenticated using(true)`);
    try { expect((await role("authenticated", () => db.query("select * from private.tc_manual_stripe_bridge_receipts"))).rows).toEqual([]); }
    finally { await db.exec("drop policy bridge_synthetic_permissive on private.tc_manual_stripe_bridge_receipts;revoke select on private.tc_manual_stripe_bridge_receipts from authenticated"); }
  });
  it("does not grant service_role permission to enable its own channel", async () => {
    await expect(role("service_role", () => db.query("update private.tc_manual_stripe_channels set enabled=true"))).rejects.toThrow();
  });
  it("atomically grants a one-off paid period and records one private fiscal task", async () => {
    const b = await buyer();
    expect(await call("initial_payment",oneOff(b))).toMatchObject({received:true,duplicate:false});
    expect(await snapshot(b)).toMatchObject({request_status:"paid",tasks:1,receipts:1,invoices:0});
  });
  it("deduplicates exact and new-event replays without extending the same PI twice", async () => {
    const b = await buyer(); const first = await call("initial_payment",oneOff(b));
    const before = await snapshot(b);
    expect(await call("initial_payment",oneOff(b))).toMatchObject({duplicate:true,task_id:first.task_id});
    expect(await call("initial_payment",oneOff(b,{provider_event_id:"evt_Replay" + b.n}))).toMatchObject({duplicate:true,task_id:first.task_id});
    expect(await snapshot(b)).toEqual({...before,receipts:2});
  });
  it("rejects another account for an already bound payment and keeps all records unchanged", async () => {
    const b = await buyer(); await call("initial_payment",oneOff(b)); const before=await snapshot(b);
    await expect(call("initial_payment",oneOff(b,{provider_event_id:"evt_OtherAccount" + b.n}),"acct_OtherIsolated"))
      .rejects.toThrow("manual_stripe_payment_conflict");
    expect(await snapshot(b)).toEqual(before);
  });
  it("rejects foreign owner, organization and saved Checkout mismatches before writes", async () => {
    const a = await buyer();const b=await buyer();const before=await snapshot(a);
    await expect(call("initial_payment",oneOff(a,{company_id:b.company}))).rejects.toThrow("manual_stripe_company_ambiguous");
    await expect(call("initial_payment",oneOff(a,{user_id:b.user}))).rejects.toThrow("manual_stripe_order_mismatch");
    await expect(call("initial_payment",oneOff(a,{checkout_id:b.checkout}))).rejects.toThrow("manual_stripe_checkout_mismatch");
    expect(await snapshot(a)).toEqual(before);
  });
  it("keeps absent, disabled, test/live mismatched or unapproved channels closed", async () => {
    const b=await buyer();const before=await snapshot(b);
    await expect(call("initial_payment",oneOff(b),"acct_NotConfigured")).rejects.toThrow("manual_stripe_channel_disabled");
    await expect(call("initial_payment",oneOff(b,{livemode:true}))).rejects.toThrow("manual_stripe_channel_disabled");
    await db.query("update private.tc_manual_stripe_channels set enabled=false where provider_account_id=$1",[account]);
    try { await expect(call("initial_payment",oneOff(b))).rejects.toThrow("manual_stripe_channel_disabled"); }
    finally { await db.query("update private.tc_manual_stripe_channels set enabled=true where provider_account_id=$1",[account]); }
    expect(await snapshot(b)).toEqual(before);
  });
  it("rolls back the prior billing update if fiscal intake rejects missing buyer details", async () => {
    const b=await buyer();
    await db.query("update private.tc_customers set email='x' where user_id=$1",[b.user]);
    const before=await snapshot(b);
    await expect(call("initial_payment",oneOff(b))).rejects.toThrow("manual_invoice_buyer_details_missing");
    expect(await snapshot(b)).toEqual(before);
    expect((await db.query("select * from private.tc_payment_events where event_id=$1",["evt_One" + b.n])).rows).toEqual([]);
  });
  it("rolls back billing, task and provider event when receipt persistence fails", async () => {
    const b=await buyer();const before=await snapshot(b);
    await db.exec(`create function private.bridge_test_failure() returns trigger language plpgsql as $fixture$
      begin raise exception 'synthetic_receipt_failure';end;$fixture$;
      create trigger bridge_test_failure before insert on private.tc_manual_stripe_bridge_receipts
      for each row execute function private.bridge_test_failure()`);
    try { await expect(call("initial_payment",oneOff(b))).rejects.toThrow("synthetic_receipt_failure"); }
    finally { await db.exec("drop trigger bridge_test_failure on private.tc_manual_stripe_bridge_receipts;drop function private.bridge_test_failure()"); }
    expect(await snapshot(b)).toEqual(before);
    expect((await db.query("select * from private.tc_payment_events where event_id=$1",["evt_One" + b.n])).rows).toEqual([]);
  });
  it("records separate first and second monthly invoice identities from the same request", async () => {
    const b=await buyer();await reserve(b);
    const first=await call("subscription_invoice",monthly(b));
    const second=await call("subscription_invoice",monthly(b,true));
    expect(first.task_id).not.toBe(second.task_id);
    expect(await snapshot(b)).toMatchObject({request_status:"paid",tasks:2,receipts:2,invoices:2});
    const before=await snapshot(b);
    expect(await call("subscription_invoice",monthly(b,true))).toMatchObject({duplicate:true,task_id:second.task_id});
    expect(await snapshot(b)).toEqual(before);
  });
  it("cannot reuse a monthly event for another invoice or rewrite the historical period", async () => {
    const b=await buyer();await reserve(b);await call("subscription_invoice",monthly(b));
    const before=await snapshot(b);
    await expect(call("subscription_invoice",monthly(b,true,{provider_event_id:"evt_First" + b.n}))).rejects.toThrow();
    await expect(call("subscription_invoice",monthly(b,false,{
      provider_event_id:"evt_TamperedPeriod" + b.n,invoice_period_start:now-86400,invoice_period_end:now+29*86400,
    }))).rejects.toThrow("manual_stripe_invoice_mismatch");
    expect(await snapshot(b)).toEqual(before);
  });
  it("never treats subscription Checkout as a one-off or ingests an unreserved subscription", async () => {
    const b=await buyer();await reserve(b);const before=await snapshot(b);
    await expect(call("initial_payment",oneOff(b))).rejects.toThrow("manual_stripe_checkout_mismatch");
    expect(await snapshot(b)).toEqual(before);
    const other=await buyer();
    await expect(call("subscription_invoice",monthly(other))).rejects.toThrow("manual_stripe_reservation_missing");
  });
  it("requires review of legacy already-paid requests instead of extending access again", async () => {
    const b=await buyer();await db.query("update private.tc_payment_requests set status='paid' where id=$1",[b.request]);
    const before=await snapshot(b);
    await expect(call("initial_payment",oneOff(b))).rejects.toThrow("manual_stripe_legacy_payment_review");
    expect(await snapshot(b)).toEqual(before);
  });
  it("preserves append-only receipt evidence against privileged mutations", async () => {
    for(const command of [
      "update private.tc_manual_stripe_bridge_receipts set proof_sha256=repeat('0',64)",
      "delete from private.tc_manual_stripe_bridge_receipts",
      "truncate private.tc_manual_stripe_bridge_receipts",
    ]) await expect(db.exec(command)).rejects.toThrow("manual_invoice_intake_immutable");
  });
});
