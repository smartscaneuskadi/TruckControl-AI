import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const buyerA = "cc100000-0000-4000-8000-000000000001";
const buyerB = "cc100000-0000-4000-8000-000000000002";
const requestA = "cc200000-0000-4000-8000-000000000001";
const requestA2 = "cc200000-0000-4000-8000-000000000002";
const requestB = "cc200000-0000-4000-8000-000000000003";
const paidAt = "2026-11-07T20:00:00Z";
let db: PGlite;
let orgA = "", orgB = "";

const intake = (
  changes: Partial<{
    account: string;
    event: string;
    payment: string;
    request: string;
    company: string;
    amount: number;
    paidAt: string;
  }> = {},
) => {
  const p = {
    account: "acct_SyntheticExample001",
    event: "evt_SyntheticConfirmed001",
    payment: "in_SyntheticConfirmed001",
    request: requestA,
    company: orgA,
    amount: 36300,
    paidAt,
    ...changes,
  };
  return db.query<{ id: string }>(
    "select private.tc_manual_subscription_invoice_intake($1,$2,$3,$4,$5,$6,$7::timestamptz) id",
    [p.account, p.event, p.payment, p.request, p.company, p.amount, p.paidAt],
  ).then((r) => r.rows[0].id);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users(
    id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
    phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  grant usage on schema public,auth to anon,authenticated;`);
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  for (const [id, n] of [[buyerA, "1"], [buyerB, "2"]]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
      [id, `candidate-${n}@example.invalid`, JSON.stringify({
        truckcontrol_registration: {
          contact_name: "Comprador ficticio",
          company_name: `Empresa simulada ${n}`,
          tax_id: `SIMULADO-${n}`,
          address: "Calle de pruebas 123",
          phone: `+1202555010${n}`,
          requested_plan: "limited",
        },
      })],
    );
  }
  orgA = (await db.query<{ id: string }>(
    "select id from public.organizations where owner_id=$1", [buyerA],
  )).rows[0].id;
  orgB = (await db.query<{ id: string }>(
    "select id from public.organizations where owner_id=$1", [buyerB],
  )).rows[0].id;
  for (const [id, user] of [[requestA, buyerA], [requestA2, buyerA], [requestB, buyerB]]) {
    await db.query(
      `insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status)
         select $1,$2,id,36300,revision,'paid' from private.tc_plans where id='limited'`,
      [id, user],
    );
  }
}, 30000);
afterAll(async () => { await db?.close(); });

describe("cola privada de facturas GDTaller/TicketBAI: candidato sin desplegar", () => {
  it("registra una sola tarea aunque Stripe reenvíe eventos distintos del mismo pago", async () => {
    const first = await intake();
    expect(await intake()).toBe(first);
    expect(await intake({ event: "evt_SyntheticConfirmed002" })).toBe(first);
    const tasks = await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_manual_subscription_invoice_tasks",
    );
    const events = await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_manual_subscription_invoice_events",
    );
    expect(tasks.rows[0].n).toBe(1);
    expect(events.rows[0].n).toBe(2);
  });
  it("rechaza crear otra factura para el mismo pedido con otro pago y evento", async () => {
    await expect(intake({
      event: "evt_SyntheticConfirmed004", payment: "in_SyntheticConfirmed004",
    })).rejects.toThrow("tc_manual_subscription_request_unique");
    const tasks = await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_manual_subscription_invoice_tasks",
    );
    const events = await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_manual_subscription_invoice_events",
    );
    expect(tasks.rows[0].n).toBe(1);
    expect(events.rows[0].n).toBe(2);
  });
  it("no admite el mismo evento para dos pagos distintos ni conserva una tarea parcial", async () => {
    await expect(intake({
      payment: "in_SyntheticConfirmed002", request: requestA2,
    })).rejects.toThrow("manual_invoice_conflicting_event");
    const rows = await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_manual_subscription_invoice_tasks",
    );
    expect(rows.rows[0].n).toBe(1);
  });
  it("impide asociar un evento a una cuenta Stripe distinta de la tarea aun con escritura privilegiada", async () => {
    const task = await db.query<{ id: string }>(
      "select id from private.tc_manual_subscription_invoice_tasks where provider_payment_id='in_SyntheticConfirmed001'",
    );
    expect(task.rows).toHaveLength(1);
    await expect(db.query(
      `insert into private.tc_manual_subscription_invoice_events
        (provider_account_id,provider_event_id,task_id)
        values ('acct_OtherMerchant','evt_SyntheticCrossAccount',$1)`,
      [task.rows[0].id],
    )).rejects.toThrow("tc_manual_subscription_event_task_account_fk");
    const events = await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_manual_subscription_invoice_events",
    );
    expect(events.rows[0].n).toBe(2);
  });
  it("rechaza cruce de empresas, cambios monetarios y pagos no reconciliados", async () => {
    await expect(intake({
      payment: "in_SyntheticConfirmed003", event: "evt_SyntheticConfirmed003",
      request: requestB, company: orgA,
    })).rejects.toThrow("manual_invoice_company_ambiguous");
    await expect(intake({
      payment: "in_SyntheticConfirmed003", event: "evt_SyntheticConfirmed003",
      amount: 84700,
    })).rejects.toThrow("manual_invoice_unreconciled_payment");
    await db.query("update private.tc_payment_requests set status='requested' where id=$1", [requestB]);
    await expect(intake({
      payment: "in_SyntheticConfirmed003", event: "evt_SyntheticConfirmed003",
      request: requestB, company: orgB,
    })).rejects.toThrow("manual_invoice_unreconciled_payment");
  });
  it("no permite cambiar account, identidad del comprador, instante ni evento de pago", async () => {
    await expect(intake({ account: "acct_OtherMerchant" })).rejects.toThrow();
    await expect(intake({ paidAt: "2026-11-07T20:01:00Z" }))
      .rejects.toThrow("manual_invoice_conflicting_payment");
    await expect(intake({ payment: "not_an_invoice", event: "evt_SyntheticConfirmed003" }))
      .rejects.toThrow("manual_invoice_intake_invalid");
    await expect(intake({ event: "evt_SyntheticConfirmed001\n" }))
      .rejects.toThrow("manual_invoice_intake_invalid");
  });
  it("rechaza UPDATE/DELETE/TRUNCATE privilegiados en las tareas y eventos hasta disponer de CAS auditado", async () => {
    const task = await db.query<{ id: string; paid_at: string }>(
      "select id,paid_at::text from private.tc_manual_subscription_invoice_tasks",
    );
    expect(task.rows).toHaveLength(1);
    for (const [table, timestamp] of [
      ["private.tc_manual_subscription_invoice_tasks", "created_at"],
      ["private.tc_manual_subscription_invoice_events", "recorded_at"],
    ]) {
      await expect(db.query(
        `update ${table} set ${timestamp}=now()`,
      )).rejects.toThrow("manual_invoice_intake_immutable");
      await expect(db.query(
        `delete from ${table}`,
      )).rejects.toThrow("manual_invoice_intake_immutable");
      await expect(db.query(
        `truncate table ${table}${table.endsWith("_tasks") ? " cascade" : ""}`,
      )).rejects.toThrow("manual_invoice_intake_immutable");
    }
    const unchanged = await db.query<{ id: string; paid_at: string }>(
      "select id,paid_at::text from private.tc_manual_subscription_invoice_tasks",
    );
    expect(unchanged.rows).toEqual(task.rows);
    const events = await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_manual_subscription_invoice_events",
    );
    expect(events.rows[0].n).toBe(2);
  });
  it("bloquea tablas y función para anon y authenticated, incluida escritura directa", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query("select * from private.tc_manual_subscription_invoice_tasks"))
          .rejects.toThrow();
        await expect(db.query(
          "select private.tc_manual_subscription_invoice_intake('acct_Test','evt_Test','in_Test',$1,$2,36300,now())",
          [requestA, orgA],
        )).rejects.toThrow();
        await expect(db.query(
          "insert into private.tc_manual_subscription_invoice_events(provider_account_id,provider_event_id,task_id) values('acct_Test','evt_Test',$1)",
          ["11111111-1111-4111-8111-111111111111"],
        )).rejects.toThrow();
      } finally {
        await db.exec("reset role");
      }
    }
  });
  it("no habilita cobros, documentos ni estados de factura por crear una tarea", async () => {
    const rows = await db.query<{ status: string; row_version: string; currency: string }>(
      "select status,row_version::text,currency from private.tc_manual_subscription_invoice_tasks",
    );
    expect(rows.rows).toEqual([{ status: "awaiting_issue", row_version: "1", currency: "EUR" }]);
    const flags = await db.query<{ payments_enabled: boolean }>(
      "select payments_enabled from private.tc_settings where id=true",
    );
    expect(flags.rows[0].payments_enabled).toBe(false);
  });
});
