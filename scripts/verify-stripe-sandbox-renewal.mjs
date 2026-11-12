// Official Stripe TEST API and authentic signed events. No exported API key.
// Explicit opt-in; all persistence is a disposable local PGlite database.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createManualStripeWebhookHandler } from "../supabase/functions/truckcontrol-stripe-fiscal/handler.ts";
import { persistManualStripePayment } from "../supabase/functions/_shared/subscription-stripe-persistence.ts";
import { lookupKnownStripePayment } from "../supabase/functions/_shared/subscription-financial-persistence.ts";
import { financialDatabase, withDbRole } from "../tests/helpers/subscription-financial-db.ts";
import { requireStripeQaArguments, requireStripeQaIdentity, stripeQaEnvironment, StripeQaAccount } from "./lib/stripe-qa-guards.mjs";

if (process.env.TRUCKCONTROL_STRIPE_RENEWAL_ACCEPTANCE !== "synthetic-sandbox-only")
  throw Error("Explicit sandbox-only acceptance required");
if (process.platform !== "linux") throw Error("Isolated Linux executor required for owned-process cleanup");
const cli = process.env.TRUCKCONTROL_STRIPE_CLI;
if (!cli || !cli.startsWith("/")) throw Error("Absolute official Stripe CLI path required");
const account = StripeQaAccount;
const cliEnv = stripeQaEnvironment(process.env);
const output = resolve(process.env.TRUCKCONTROL_STRIPE_RENEWAL_REPORT || "stripe-renewal-results/receipt.json");
const run = promisify(execFile);
const unique = randomUUID();
const proof = {
  contract: "truckcontrol-real-sandbox-renewal-v1", started_at: new Date().toISOString(),
  account, livemode: false, real_money_eur: 0, production_modified: false,
  transport: "Official CLI only; signed forwarded webhooks and canonical API reads, without exporting its credential",
  persistence: "Disposable local PGlite; never managed production",
  limitations: ["Not a browser Checkout purchase or a production backend key/webhook acceptance",
    "Not a TicketBAI invoice or dispatch; fiscal tasks remain awaiting_issue",
    "Cancellation is checked at the provider only, not production licence suspension"],
  checks: [], events: [], resources: {}, provider_reads: 0,
};
let db, listener, server, clock, customer, subscription, webhookSecret = "";
let chain = Promise.resolve();
const exclusive = (fn) => {
  const pending = chain.then(fn);
  chain = pending.catch(() => {});
  return pending;
};
const save = () => {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output + ".progress", JSON.stringify(proof, null, 2) + "\n");
};
const check = (name, condition) => {
  if (!condition) throw Error(name);
  proof.checks.push(name); save(); console.log("PASS " + name);
};
async function api(args) {
  requireStripeQaArguments(args);
  let stdout;
  try { ({ stdout } = await run(cli, args, { timeout: 30000, maxBuffer: 524288, env: cliEnv })); }
  catch { throw Error("official_cli_request_failed"); }
  const text = stdout.replace(/\x1b\[[0-9;]*m/g, "");
  const data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (data.error) {
    proof.provider_error = { type: data.error.type, code: data.error.code };
    throw Error("stripe_api_rejected_request");
  }
  return data;
}
async function identity() {
  const who = await api(["whoami", "--format", "json"]);
  requireStripeQaIdentity(who);
}
async function mutate(method, path, fields = []) {
  // Recheck the selected official profile before every remote mutation.
  await identity();
  return api([method, path, ...fields.flatMap(([name, value]) => ["-d", name + "=" + value]),
    ...(method === "delete" ? ["--confirm"] : ["--idempotency", "tc-renewal-" + unique + "-" + path.replaceAll("/", "-") + "-" + fields.map(x => x.join(":" )).join("-").slice(-80)])]);
}
async function wait(predicate, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw Error("sandbox_renewal_wait_timeout");
}
const envelopes = new Map();
const payments = [];
const fetcher = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== "https://api.stripe.com" || !url.pathname.startsWith("/v1/") || init?.method !== "GET")
    throw Error("Noncanonical provider request");
  const args = ["get", url.pathname,
    ...Array.from(url.searchParams).flatMap(([name, value]) => ["-d", name + "=" + value])];
  const version = new Headers(init.headers).get("Stripe-Version");
  if (version) args.push("--stripe-version", version);
  const data = await api(args); proof.provider_reads++;
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
};
const localRpc = (name, parameters) => exclusive(async () => {
  const known = name === "tc_manual_subscription_known_payment_event";
  if (!known && name !== "tc_manual_subscription_apply_payment") throw Error("Unreviewed RPC refused");
  try {
    const rows = await withDbRole(db, "service_role", () => db.query(known
      ? "select public.tc_manual_subscription_known_payment_event($1,$2,$3::jsonb) result"
      : "select public.tc_manual_subscription_apply_payment($1,$2,$3::jsonb) result",
      known ? [parameters.p_account, parameters.p_mode, JSON.stringify(parameters.p_event)]
        : [parameters.p_kind, parameters.p_account, JSON.stringify(parameters.p_data)]));
    return { data: rows.rows[0].result, error: null };
  } catch (error) {
    proof.persistence_error = /^[A-Z0-9]{5}$/.test(String(error.code)) ? error.code : "local_rpc_error";
    return { data: null, error: { code: proof.persistence_error } };
  }
});
const handler = () => createManualStripeWebhookHandler({
  applyPayment: async (p) => { await persistManualStripePayment(localRpc, p); payments.push(p); },
  knownPaymentEvent: (owner, mode, event) => lookupKnownStripePayment(localRpc, owner, mode, event),
}, { enabled: true, schemaAccepted: true, knownPaymentEvents: true, mode: "test",
  expectedAccountId: account, stripeKey: "sk_test_OfficialCLITransportMarker", webhookSecret }, fetcher);
const requestFor = (envelope) => new Request("http://127.0.0.1/webhook", { method: "POST",
  headers: { "Content-Type": "application/json", "stripe-signature": envelope.signature }, body: envelope.raw });

try {
  await identity();
  check("Authorized official profile is the existing test sandbox", true);
  check("Canonical provider identity matches the sandbox", (await api(["get", "/v1/account"])).id === account);
  const price = await api(["get", "/v1/prices/price_1UZVzXECykZtDl5d70qBU4vQ"]);
  check("Existing EUR363 monthly test price is unchanged", price.livemode === false && price.unit_amount === 36300 && price.currency === "eur");
  db = await financialDatabase();
  const user = randomUUID(), order = randomUUID();
  const start = Math.floor(Date.now() / 1000) - 40 * 86400;
  const checkout = "cs_test_RenewalFixture" + unique.replaceAll("-", "");
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'renewal-qa@example.invalid',now(),$2::jsonb)",
    [user, JSON.stringify({ truckcontrol_registration: { contact_name: "Synthetic renewal operator", company_name: "Synthetic renewal QA",
      tax_id: "DEMO-RENEWAL", address: "Synthetic renewal street 112", phone: "+12025550912", requested_plan: "limited" } })]);
  const company = (await db.query("select id from public.organizations where owner_id=$1", [user])).rows[0].id;
  await db.query("insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents,created_at) select $1,$2,id,36300,revision,'checkout',$3,30000,2100,6300,to_timestamp($4) from private.tc_plans where id='limited'", [order, user, checkout, start]);
  await db.query("insert into private.tc_subscription_orders(user_id,request_id,checkout_id,terms_version) values($1,$2,$3,'synthetic-clock-renewal-v1')", [user, order, checkout]);
  await db.query("insert into private.tc_manual_stripe_channels(provider_account_id,mode,enabled,isolated_test_instance) values($1,'test',true,true)", [account]);
  server = createServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 65536) throw Error("body_limit"); }
      const event = JSON.parse(raw);
      // Ignore unrelated sandbox traffic, without reconciling or persisting it.
      if (event.livemode !== false || event.type !== "invoice.paid" || event.data?.object?.customer !== customer?.id) {
        res.writeHead(200); res.end(); return;
      }
      const envelope = { raw, signature: req.headers["stripe-signature"] || "" };
      const response = await handler()(requestFor(envelope));
      const body = await response.text();
      proof.events.push({ id: event.id, type: event.type, status: response.status });
      if (response.status === 200) envelopes.set(event.data.object.id, envelope);
      save(); res.writeHead(response.status, { "Content-Type": "application/json" }); res.end(body);
    } catch { res.writeHead(503); res.end('{"error":"isolated_test_error"}'); }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  proof.resources.local_listener_port = server.address().port;
  listener = spawn(cli, ["listen", "--events", "invoice.paid", "--forward-to", "http://127.0.0.1:" + server.address().port + "/webhook"], { detached: true, env: cliEnv, stdio: ["ignore", "pipe", "pipe"] });
  let listenerText = "";
  for (const stream of [listener.stdout, listener.stderr]) stream.on("data", bytes => {
    listenerText = (listenerText + bytes.toString()).slice(-16384);
    const value = listenerText.match(/whsec_[A-Za-z0-9]+/); if (value) webhookSecret = value[0];
  });
  await wait(() => !!webhookSecret, 45000);
  check("Authentic signing secret remains only in process memory", true);
  clock = await mutate("post", "/v1/test_helpers/test_clocks", [["frozen_time", start], ["name", "TruckControl renewal QA " + unique]]);
  check("Own disposable clock starts in the past without relaxing time validation", clock.livemode === false && clock.frozen_time === start);
  proof.resources.clock = clock.id; save();
  customer = await mutate("post", "/v1/customers", [["test_clock", clock.id], ["name", "Synthetic TruckControl renewal QA"],
    ["payment_method", "pm_card_visa"], ["invoice_settings[default_payment_method]", "pm_card_visa"], ["metadata[application]", "truckcontrol-ai"], ["metadata[acceptance]", unique]]);
  check("Test customer is attached only to this clock", customer.livemode === false && customer.test_clock === clock.id);
  proof.resources.customer = customer.id; save();
  subscription = await mutate("post", "/v1/subscriptions", [["customer", customer.id], ["payment_behavior", "error_if_incomplete"],
    ["items[0][price]", price.id], ["metadata[application]", "truckcontrol-ai"], ["metadata[tc_user_id]", user],
    ["metadata[tc_company_id]", company], ["metadata[tc_request_id]", order]]);
  proof.resources.subscription = subscription.id; save();
  check("Real sandbox subscription is active", subscription.livemode === false && subscription.status === "active");
  const tasks = () => exclusive(async () => (await db.query(
    "select id,provider_invoice_id,subscription_id,period_start,period_end,status,amount_cents from private.tc_manual_subscription_invoice_tasks where request_id=$1 order by period_start", [order])).rows);
  await wait(async () => (await tasks()).length === 1 && envelopes.size === 1);
  const first = (await tasks())[0];
  check("First genuine signed invoice creates one awaiting-issue task", first.status === "awaiting_issue" && first.amount_cents === 36300 && first.subscription_id === subscription.id);
  const target = Math.floor(Date.now() / 1000) - 2 * 86400;
  await mutate("post", "/v1/test_helpers/test_clocks/" + clock.id + "/advance", [["frozen_time", target]]);
  await wait(async () => (await api(["get", "/v1/test_helpers/test_clocks/" + clock.id])).status === "ready");
  // Stripe drafts the renewal first; advance another two hours for automatic
  // finalization/payment. Both times remain in the past. No signature, period
  // or database time control is disabled for the simulation.
  await mutate("post", "/v1/test_helpers/test_clocks/" + clock.id + "/advance", [["frozen_time", target + 7200]]);
  await wait(async () => (await api(["get", "/v1/test_helpers/test_clocks/" + clock.id])).status === "ready");
  await wait(async () => (await tasks()).length === 2 && envelopes.size === 2);
  const both = await tasks();
  check("Renewal invoice creates an independent second task", both[0].id !== both[1].id && both[0].provider_invoice_id !== both[1].provider_invoice_id);
  check("Monthly periods are contiguous and belong to the same subscription", new Date(both[0].period_end).getTime() === new Date(both[1].period_start).getTime() && both.every(x => x.subscription_id === subscription.id && x.amount_cents === 36300 && x.status === "awaiting_issue"));
  check("Original immutable task survives the renewal unchanged", JSON.stringify(first) === JSON.stringify(both[0]));
  check("Provider canonical evidence distinguishes initial purchase and renewal", payments.length === 2 && payments[0].billing_reason === "subscription_create" && payments[1].billing_reason === "subscription_cycle");
  const before = await exclusive(async () => (await db.query("select to_jsonb(c) data from private.tc_customers c where user_id=$1", [user])).rows[0].data);
  for (const entry of both.toReversed()) {
    const reads = proof.provider_reads;
    const replay = await handler()(requestFor(envelopes.get(entry.provider_invoice_id)));
    check("Signed replay is idempotent for " + (entry.id === first.id ? "first period after renewal" : "renewal period"), replay.status === 200 && (await tasks()).length === 2 && proof.provider_reads === reads + 2);
  }
  const after = await exclusive(async () => (await db.query("select to_jsonb(c) data from private.tc_customers c where user_id=$1", [user])).rows[0].data);
  check("Out-of-order replays do not regress or extend isolated access", JSON.stringify(before) === JSON.stringify(after) && new Date(after.paid_until).getTime() === new Date(both[1].period_end).getTime());
  const sample = envelopes.get(first.provider_invoice_id);
  const reads = proof.provider_reads;
  const denied = await handler()(requestFor({ ...sample, signature: "t=1,v1=invalid" }));
  check("Invalid signature is denied before canonical reads", denied.status === 400 && proof.provider_reads === reads);
  proof.tasks = both;
  const canceled = await mutate("delete", "/v1/subscriptions/" + subscription.id);
  check("Only this synthetic subscription is canceled at the provider", canceled.id === subscription.id && canceled.livemode === false && canceled.status === "canceled");
  proof.complete = true;
} catch (error) {
  proof.complete = false;
  proof.failure_code = String(error?.message || "unknown").slice(0, 140).replace(/(?:sk|rk|whsec)_[A-Za-z0-9_]+/g, "[redacted]");
} finally {
  if (listener?.pid) { try { process.kill(-listener.pid, "SIGTERM"); } catch { /* Already exited. */ } }
  server?.closeAllConnections();
  await new Promise(r => server ? server.close(r) : r());
  await chain; await db?.close();
  if (clock?.id) {
    try {
      const own = await api(["get", "/v1/test_helpers/test_clocks/" + clock.id]);
      if (own.id !== clock.id || own.livemode !== false || own.name !== "TruckControl renewal QA " + unique)
        throw Error("Refuse foreign clock cleanup");
      const deleted = await mutate("delete", "/v1/test_helpers/test_clocks/" + clock.id);
      proof.synthetic_clock_and_associated_resources_removed = deleted.deleted === true;
    } catch { proof.synthetic_clock_and_associated_resources_removed = false; }
  }
  proof.completed_at = new Date().toISOString();
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(proof, null, 2) + "\n");
  console.log(JSON.stringify({ complete: proof.complete, checks: proof.checks.length, failure_code: proof.failure_code || null,
    cleanup: proof.synthetic_clock_and_associated_resources_removed, real_money_eur: 0, report: output }));
  if (!proof.complete || proof.synthetic_clock_and_associated_resources_removed !== true) process.exitCode = 1;
}
