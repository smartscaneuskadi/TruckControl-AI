import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const admin = "cd100000-0000-4000-8000-000000000001";
const buyerA = "cd100000-0000-4000-8000-000000000002";
const buyerB = "cd100000-0000-4000-8000-000000000003";
const adminSession = "cd110000-0000-4000-8000-000000000001";
const buyerSession = "cd110000-0000-4000-8000-000000000002";
const requestA = "cd200000-0000-4000-8000-000000000001";
const requestB = "cd200000-0000-4000-8000-000000000002";
const requestRenewal = "cd200000-0000-4000-8000-000000000003";
const operation = (n: number) => "cd400000-0000-4000-8000-" + String(n).padStart(12, "0");
const buyer = {
  company_name: "Empresa de pruebas validada",
  tax_id: "SIMULADO-VALIDADO",
  address: "Dirección de pruebas 123, 20400",
  email: "facturas-sinteticas@example.invalid",
  evidence_reference: "Verificación manual controlada de pruebas",
};
let db: PGlite;
let orgA = "", orgB = "", taskA = "", taskB = "";

async function attempt<T>(body: () => Promise<T>): Promise<T> {
  // A rejected PostgreSQL statement aborts an explicit transaction. Preserve
  // the exact rejection and roll back only its attempt before reading evidence.
  await db.exec("savepoint operator_attempt");
  try {
    const result = await body();
    await db.exec("release savepoint operator_attempt");
    return result;
  } catch (error) {
    await db.exec("rollback to savepoint operator_attempt; release savepoint operator_attempt");
    throw error;
  }
}

async function adminCall(
  action: string,
  taskId: string | null = taskA,
  expected: number | null = null,
  requestId: string | null = null,
  data: Record<string, unknown> = {},
  actor = admin,
  session: string | null = adminSession,
  role: "authenticated" | "anon" = "authenticated",
) {
  return attempt(async () => {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
    [actor, JSON.stringify({
      sub: actor, role, ...(session ? { session_id: session } : {}),
      user_metadata: { is_admin: true, role: "admin" },
    })],
  );
  await db.exec(role === "anon" ? "set local role anon" : "set local role authenticated");
  const result = await db.query<{ result: Record<string, unknown> }>(
      "select public.tc_admin_manual_subscription_invoices($1,$2::uuid,$3::bigint,$4::uuid,$5::jsonb,null::uuid) result",
      [action, taskId, expected, requestId, JSON.stringify(data)],
    );
  await db.exec("reset role");
  return result.rows[0].result;
  });
}

const actions = () => db.query<{
  row_version: string; operation_id: string; actor_id: string; action: string; state: string; data: unknown;
}>(
  "select row_version::text,operation_id::text,actor_id::text,action,state,data from private.tc_manual_subscription_invoice_actions where task_id=$1 order by row_version",
  [taskA],
);


async function seedRenewals() {
  // Synthetic server records are deliberately not evidence of a Stripe charge.
  await db.query(
    "update private.tc_payment_requests set created_at='2026-08-01T00:00:00Z' where id=$1", [requestRenewal],
  );
  await db.query(
    "insert into private.tc_billing_subscriptions(provider_id,user_id,request_id,customer_id,plan_id,monthly_cents,currency,state,cancel_at_period_end,period_end,event_created) " +
    "values('sub_OperatorRenewal',$1,$2,'cus_OperatorRenewal','limited',36300,'EUR','active',false,'2026-12-01T00:00:00Z',1793491200)",
    [buyerA, requestRenewal],
  );
  for (const [invoice, start, end] of [
    ["in_OperatorRenewalSep", "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"],
    ["in_OperatorRenewalOct", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"],
  ]) {
    await db.query(
      "insert into private.tc_subscription_invoices(invoice_id,subscription_id,user_id,amount_cents,currency,period_start,period_end) " +
      "values($1,'sub_OperatorRenewal',$2,36300,'EUR',$3::timestamptz,$4::timestamptz)",
      [invoice, buyerA, start, end],
    );
  }
}

async function renewal(changes: Partial<{
  event: string; invoice: string; subscription: string; company: string; amount: number; paidAt: string;
}> = {}) {
  const p = {
    event: "evt_OperatorRenewalSep", invoice: "in_OperatorRenewalSep",
    subscription: "sub_OperatorRenewal", company: orgA, amount: 36300,
    paidAt: "2026-09-01T00:01:00Z", ...changes,
  };
  return attempt(async () => (await db.query<{ id: string }>(
    "select private.tc_manual_subscription_invoice_renewal_intake($1,$2,$3,$4,$5::uuid,$6::integer,$7::timestamptz) id",
    ["acct_SyntheticOperator", p.event, p.invoice, p.subscription, p.company, p.amount, p.paidAt],
  )).rows[0].id);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon nologin; create role authenticated nologin; create schema auth;" +
    "create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz," +
    "phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');" +
    "create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));" +
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;" +
    "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;" +
    "grant usage on schema public,auth to anon,authenticated;",
  );
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'operador-sintetico@example.invalid',now())",
    [admin],
  );
  await db.query("insert into private.tc_admins(user_id) values($1) on conflict do nothing", [admin]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [adminSession, admin]);
  for (const [id, n] of [[buyerA, "1"], [buyerB, "2"]]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
      [id, "comprador-sintetico-" + n + "@example.invalid", JSON.stringify({
        truckcontrol_registration: {
          contact_name: "Comprador de pruebas",
          company_name: "Empresa simulada " + n,
          tax_id: "SIMULADO-" + n,
          address: "Dirección de pruebas 123",
          phone: "+1202555020" + n,
          requested_plan: "limited",
        },
      })],
    );
  }
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [buyerSession, buyerA]);
  orgA = (await db.query<{ id: string }>("select id from public.organizations where owner_id=$1", [buyerA])).rows[0].id;
  orgB = (await db.query<{ id: string }>("select id from public.organizations where owner_id=$1", [buyerB])).rows[0].id;
  for (const [id, user] of [[requestA, buyerA], [requestB, buyerB], [requestRenewal, buyerA]]) {
    await db.query(
      "insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,net_cents,vat_rate_bps,vat_cents) " +
      "select $1,$2,id,36300,revision,'paid',30000,2100,6300 from private.tc_plans where id='limited'",
      [id, user],
    );
  }
  for (const [request, company, suffix] of [[requestA, orgA, "A"], [requestB, orgB, "B"]]) {
    const result = await db.query<{ id: string }>(
      "select private.tc_manual_subscription_invoice_intake($1,$2,$3,$4,$5,36300,now()-interval '1 hour') id",
      ["acct_SyntheticOperator", "evt_Operator" + suffix, "pi_Operator" + suffix, request, company],
    );
    if (suffix === "A") taskA = result.rows[0].id;
    else taskB = result.rows[0].id;
  }
}, 45000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("reset role; rollback"); });
afterAll(async () => { await db?.close(); });

describe("operador fiscal: permisos frescos, CAS y evidencia append-only", () => {
  it("conserva la procedencia sin convertir un perfil en validación fiscal", async () => {
    const result = await adminCall("detail");
    const task = (result.items as Array<Record<string, unknown>>)[0];
    expect(task).toMatchObject({ id: taskA, row_version: 1, status: "awaiting_issue", buyer_validated: false });
    expect((await actions()).rows).toEqual([]);
  });

  it("valida datos explícitos del comprador sin reescribir el ledger de ingesta", async () => {
    const original = (await db.query(
      "select buyer_company_name,buyer_tax_id,buyer_address,buyer_email from private.tc_manual_subscription_invoice_tasks where id=$1", [taskA],
    )).rows;
    const result = await adminCall("validate_buyer", taskA, 1, operation(1), buyer);
    expect(result.replayed).toBe(false);
    expect(result.task).toMatchObject({
      id: taskA, row_version: 2, status: "awaiting_issue", buyer_validated: true,
      buyer_company_name: buyer.company_name, buyer_tax_id: buyer.tax_id, buyer_address: buyer.address, buyer_email: buyer.email,
    });
    expect((await actions()).rows).toMatchObject([{
      row_version: "2", operation_id: operation(1), actor_id: admin,
      action: "validate_buyer", state: "awaiting_issue",
    }]);
    expect((await db.query(
      "select buyer_company_name,buyer_tax_id,buyer_address,buyer_email from private.tc_manual_subscription_invoice_tasks where id=$1", [taskA],
    )).rows).toEqual(original);
  });

  it("repite una operación idéntica sin crear una segunda acción ni incrementar versión", async () => {
    const first = await adminCall("validate_buyer", taskA, 1, operation(2), buyer);
    const replay = await adminCall("validate_buyer", taskA, 1, operation(2), buyer);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.task).toEqual(first.task);
    expect((await actions()).rows).toHaveLength(1);
  });

  it("rechaza reutilizar la identidad de una operación para datos distintos", async () => {
    await adminCall("validate_buyer", taskA, 1, operation(3), buyer);
    const before = (await actions()).rows;
    await expect(adminCall("validate_buyer", taskA, 1, operation(3), { ...buyer, tax_id: "SIMULADO-CONFLICTO" }))
      .rejects.toThrow();
    expect((await actions()).rows).toEqual(before);
  });

  it("rechaza dos escritores con la misma versión esperada y conserva la primera evidencia", async () => {
    await adminCall("validate_buyer", taskA, 1, operation(4), buyer);
    const before = (await actions()).rows;
    // Deterministic stale-writer exercise. PGlite is not a two-connection
    // load test; native concurrency acceptance is recorded separately.
    await expect(adminCall("validate_buyer", taskA, 1, operation(5), { ...buyer, address: "Otra dirección de pruebas 900" }))
      .rejects.toThrow();
    expect((await actions()).rows).toEqual(before);
  });

  it("permite una corrección auditada antes de emitir con la versión vigente", async () => {
    await adminCall("validate_buyer", taskA, 1, operation(6), buyer);
    const corrected = { ...buyer, address: "Dirección corregida de pruebas 456", evidence_reference: "Soporte corregido sintético" };
    const result = await adminCall("validate_buyer", taskA, 2, operation(7), corrected);
    expect(result.task).toMatchObject({ row_version: 3, buyer_address: corrected.address, buyer_validated: true });
    const rows = (await actions()).rows;
    expect(rows.map((row) => row.row_version)).toEqual(["2", "3"]);
    expect(rows[0].data).not.toEqual(rows[1].data);
  });

  it("requiere evidencia de validación y rechaza una identidad vacía sin acción parcial", async () => {
    await expect(adminCall("validate_buyer", taskA, 1, operation(8), { ...buyer, evidence_reference: "" }))
      .rejects.toThrow();
    expect((await actions()).rows).toEqual([]);
  });

  it("impide registrar una factura sin datos validados o PDF comprobado por servidor", async () => {
    await expect(adminCall("register_invoice", taskA, 1, operation(9), {
      invoice_number: "PRUEBA-NO-FISCAL", ticketbai_reference: "NO-ES-FACTURA",
      pdf_object_key: "subscription-invoices/" + orgA + "/" + taskA + "/" + operation(9) + ".pdf",
      pdf_sha256: "0".repeat(64),
      issued_at: new Date().toISOString(),
    })).rejects.toThrow("manual_invoice_buyer_not_validated");
    await adminCall("validate_buyer", taskA, 1, operation(10), buyer);
    await expect(adminCall("register_invoice", taskA, 2, operation(11), {
      invoice_number: "PRUEBA-NO-FISCAL", ticketbai_reference: "NO-ES-FACTURA",
      pdf_object_key: "subscription-invoices/" + orgA + "/" + taskA + "/" + operation(11) + ".pdf",
      pdf_sha256: "0".repeat(64),
      issued_at: new Date().toISOString(),
    })).rejects.toThrow("manual_invoice_document_not_verified");
    expect((await actions()).rows.map((row) => row.action)).toEqual(["validate_buyer"]);
  });

  it("no declara un envío si todavía no existe una factura fiscal registrada", async () => {
    await expect(adminCall("report_sent", taskA, 1, operation(12), {
      dispatch_record_id: operation(13), sent_at: new Date().toISOString(), recipient: buyer.email,
    })).rejects.toThrow();
    expect((await actions()).rows).toEqual([]);
  });

  it("needs_review es terminal y no permite borrar la incidencia mediante validación", async () => {
    const result = await adminCall("needs_review", taskA, 1, operation(14), { reason: "customer_data_invalid" });
    expect(result.task).toMatchObject({ status: "needs_review", row_version: 2 });
    const before = (await actions()).rows;
    await expect(adminCall("validate_buyer", taskA, 2, operation(15), buyer)).rejects.toThrow();
    expect((await actions()).rows).toEqual(before);
  });

  it("un cliente no obtiene datos de su tarea ni de otra empresa aunque falsifique claims administrativos", async () => {
    for (const task of [taskA, taskB]) {
      await expect(adminCall("detail", task, null, null, {}, buyerA, buyerSession)).rejects.toThrow();
      await expect(adminCall("validate_buyer", task, 1, operation(16), buyer, buyerA, buyerSession)).rejects.toThrow();
    }
    expect((await actions()).rows).toEqual([]);
  });

  it("rechaza anon y acceso directo a las acciones incluso con identidad de administrador", async () => {
    await expect(adminCall("list", null, null, null, {}, "", null, "anon")).rejects.toThrow();
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [admin]);
    await db.exec("set local role authenticated");
    try {
      await expect(attempt(() => db.query("select * from private.tc_manual_subscription_invoice_actions"))).rejects.toThrow();
      await expect(attempt(() => db.query(
        "insert into private.tc_manual_subscription_invoice_actions(task_id,row_version,operation_id,actor_id,action,state,data) values($1,2,$2,$3,'validate_buyer','awaiting_issue','{}')",
        [taskA, operation(17), admin],
      ))).rejects.toThrow();
    } finally { await db.exec("reset role"); }
    expect((await actions()).rows).toEqual([]);
  });

  it("revocar el rol bloquea incluso el reintento idempotente antes de devolver datos", async () => {
    await adminCall("validate_buyer", taskA, 1, operation(18), buyer);
    await db.query("delete from private.tc_admins where user_id=$1", [admin]);
    await expect(adminCall("validate_buyer", taskA, 1, operation(18), buyer)).rejects.toThrow();
    expect((await actions()).rows).toHaveLength(1);
  });

  it("rechaza administrador bloqueado, sin correo confirmado o con sesión revocada", async () => {
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [admin]);
    await expect(adminCall("detail")).rejects.toThrow();
    await db.query("update auth.users set banned_until=null,email_confirmed_at=null where id=$1", [admin]);
    await expect(adminCall("detail")).rejects.toThrow();
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [admin]);
    await db.query("delete from auth.sessions where id=$1", [adminSession]);
    await expect(adminCall("detail")).rejects.toThrow();
    expect((await actions()).rows).toEqual([]);
  });

  it("el historial no se altera ni borra por SQL privilegiado o truncado en cascada", async () => {
    await adminCall("validate_buyer", taskA, 1, operation(19), buyer);
    const before = (await actions()).rows;
    for (const sql of [
      "update private.tc_manual_subscription_invoice_actions set data=data",
      "delete from private.tc_manual_subscription_invoice_actions",
      "truncate private.tc_manual_subscription_invoice_actions",
      "truncate auth.users cascade",
    ]) {
      await expect(attempt(() => db.exec(sql))).rejects.toThrow();
    }
    expect((await actions()).rows).toEqual(before);
    expect((await db.query("select payments_enabled from private.tc_settings where id=true")).rows)
      .toEqual([{ payments_enabled: false }]);
  });

  it("cada renovación tiene factura y periodo propios aunque comparta el pedido original", async () => {
    await seedRenewals();
    const first = await renewal();
    expect(await renewal({ event: "evt_OperatorRenewalSepReplay" })).toBe(first);
    const second = await renewal({
      event: "evt_OperatorRenewalOct", invoice: "in_OperatorRenewalOct", paidAt: "2026-10-01T00:01:00Z",
    });
    expect(second).not.toBe(first);
    const rows = await db.query<{
      id: string; request_id: string; provider_invoice_id: string; subscription_id: string; period_start: string; period_end: string;
    }>(
      "select id,request_id,provider_invoice_id,subscription_id,period_start::text,period_end::text " +
      "from private.tc_manual_subscription_invoice_tasks where provider_invoice_id is not null order by period_start",
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row) => row.request_id)).toEqual([requestRenewal, requestRenewal]);
    expect(rows.rows.map((row) => row.provider_invoice_id)).toEqual(["in_OperatorRenewalSep", "in_OperatorRenewalOct"]);
    expect(rows.rows.map((row) => row.subscription_id)).toEqual(["sub_OperatorRenewal", "sub_OperatorRenewal"]);
    expect(rows.rows[0].period_end).toBe(rows.rows[1].period_start);
    expect((await db.query(
      "select count(*)::int n from private.tc_manual_subscription_invoice_tasks where request_id=$1", [requestRenewal],
    )).rows).toEqual([{ n: 2 }]);
  });

  it("renovación exige factura nativa, suscripción, empresa y total reconciliados", async () => {
    await seedRenewals();
    const first = await renewal();
    const before = (await db.query(
      "select id,provider_account_id,provider_payment_id,request_id,buyer_company_id,amount_cents from private.tc_manual_subscription_invoice_tasks order by id",
    )).rows;
    for (const invalid of [
      { event: "evt_OperatorMissingInvoice", invoice: "in_OperatorDoesNotExist" },
      { event: "evt_OperatorWrongSub", subscription: "sub_AnotherSubscription" },
      { event: "evt_OperatorOtherCompany", company: orgB },
      { event: "evt_OperatorWrongAmount", amount: 84700 },
      { event: "evt_OperatorRenewalSep", invoice: "in_OperatorRenewalOct", paidAt: "2026-10-01T00:01:00Z" },
    ]) {
      await expect(renewal(invalid)).rejects.toThrow();
    }
    expect((await db.query(
      "select id,provider_account_id,provider_payment_id,request_id,buyer_company_id,amount_cents from private.tc_manual_subscription_invoice_tasks order by id",
    )).rows).toEqual(before);
    expect(await renewal()).toBe(first);
  });

});
