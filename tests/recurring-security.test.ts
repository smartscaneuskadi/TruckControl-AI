import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const a = "f0000000-0000-4000-8000-000000000001",
  b = "f0000000-0000-4000-8000-000000000002";
const order = "f0000000-0000-4000-8000-000000000003",
  otherOrder = "f0000000-0000-4000-8000-000000000004";
const now = Math.floor(Date.now() / 1000);
async function as<T>(role: string, run: () => Promise<T>, user = a) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}
async function call(
  action: string,
  data: Record<string, unknown> = {},
  user = a,
) {
  return as(
    "service_role",
    async () =>
      (
        await db.query<{ v: Record<string, unknown> }>(
          "select public.tc_recurring_billing($1,$2) v",
          [action, JSON.stringify({ user_id: user, ...data })],
        )
      ).rows[0].v,
  );
}
const prepare = (data: Record<string, unknown> = {}) =>
  call("prepare", {
    request_id: order,
    terms_accepted: true,
    terms_version: "test-approved-v1",
    ...data,
  });
const event = (data: Record<string, unknown> = {}) =>
  call("event", {
    request_id: order,
    event_id: "evt_first",
    event_type: "invoice.paid",
    event_created: now,
    subscription_id: "sub_synthetic",
    customer_id: "cus_synthetic",
    unit_amount: 36300,
    currency: "EUR",
    state: "active",
    cancel_at_period_end: false,
    period_end: now + 30 * 86400,
    invoice_paid: true,
    invoice_id: "in_first",
    invoice_amount: 36300,
    invoice_period_start: now,
    invoice_period_end: now + 30 * 86400,
    ...data,
  });
async function customer() {
  return (
    await db.query<{ paid_until: Date | null; status: string }>(
      "select paid_until,status from private.tc_customers where user_id=$1",
      [a],
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [i, id] of [a, b].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        id,
        `billing${i}@example.com`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Empresa ficticia ${i}`,
            tax_id: `DEMO-${i}`,
            address: "Dirección ficticia 10",
            phone: `+3460000020${i}`,
          },
        },
      ],
    );
}, 30000);
beforeEach(async () => {
  await db.exec(`delete from private.tc_subscription_invoices; delete from private.tc_subscription_events;
    delete from private.tc_billing_subscriptions; delete from private.tc_subscription_orders; delete from private.tc_payment_requests;
    update private.tc_customers set status='trial',paid_until=null,paid_plan=null,stripe_subscription_id=null;
    update private.tc_settings set payments_enabled=true,prices_are_examples=false;`);
  await db.query(
    `insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision)
    select $1,$2,'limited',monthly_cents+private.tc_quote_vat(monthly_cents),revision from private.tc_plans where id='limited'`,
    [order, a],
  );
  await db.query(
    `insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision)
    select $1,$2,'limited',monthly_cents+private.tc_quote_vat(monthly_cents),revision from private.tc_plans where id='limited'`,
    [otherOrder, b],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("aislamiento y ciclo de renovación en PostgreSQL", () => {
  it("la política restrictiva impide exponer recibos aunque aparezcan permisos y políticas permisivas por error", async () => {
    await prepare();
    await event();
    await db.exec(`grant select on private.tc_billing_subscriptions,private.tc_subscription_invoices to authenticated;
      create policy synthetic_permissive on private.tc_billing_subscriptions for select to authenticated using(true);
      create policy synthetic_permissive on private.tc_subscription_invoices for select to authenticated using(true);`);
    try {
      for (const user of [a, b]) {
        expect(
          (
            await as(
              "authenticated",
              () => db.query("select * from private.tc_billing_subscriptions"),
              user,
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await as(
              "authenticated",
              () => db.query("select * from private.tc_subscription_invoices"),
              user,
            )
          ).rows,
        ).toEqual([]);
      }
    } finally {
      await db.exec(`drop policy synthetic_permissive on private.tc_billing_subscriptions;
        drop policy synthetic_permissive on private.tc_subscription_invoices;
        revoke select on private.tc_billing_subscriptions,private.tc_subscription_invoices from authenticated;`);
    }
  });
  it("no libera por reloj local un checkout que podría haberse completado con webhook retrasado", async () => {
    await prepare();
    await call("saved", {
      request_id: order,
      checkout_id: "cs_test_synthetic",
    });
    await db.exec(
      "update private.tc_subscription_orders set expires_at=now()-interval '1 minute'",
    );
    expect((await prepare()).available).toBe(false);
    expect(
      (
        await db.query(
          "select count(*)::integer n from private.tc_subscription_orders",
        )
      ).rows[0].n,
    ).toBe(1);
    await event();
    expect((await customer()).paid_until).not.toBeNull();
    await expect(
      call("checkout_expired", {
        request_id: order,
        checkout_id: "cs_test_synthetic",
      }),
    ).rejects.toThrow(/no puede liberarse/);
  });
  it("libera un checkout caducado confirmado por el servidor, sin activar ni eliminar datos de la cuenta", async () => {
    await prepare();
    await call("saved", {
      request_id: order,
      checkout_id: "cs_test_synthetic",
    });
    await expect(
      call("checkout_expired", {
        request_id: order,
        checkout_id: "cs_test_other",
      }),
    ).rejects.toThrow(/no puede liberarse/);
    await call("checkout_expired", {
      request_id: order,
      checkout_id: "cs_test_synthetic",
    });
    expect(
      (
        await db.query(
          "select status from private.tc_payment_requests where id=$1",
          [order],
        )
      ).rows[0].status,
    ).toBe("cancelled");
    expect((await customer()).paid_until).toBeNull();
    expect(
      (
        await call("checkout_expired", {
          request_id: order,
          checkout_id: "cs_test_synthetic",
        })
      ).received,
    ).toBe(true);
  });
  it("no expone tablas ni la función de servidor a ningún cliente", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(
        as(role, () =>
          db.query("select * from private.tc_billing_subscriptions"),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        as(role, () =>
          db.query("select public.tc_recurring_billing('status',$1)", [
            JSON.stringify({ user_id: a }),
          ]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
  it("mantiene la puerta de costes y exige consentimiento y precio vigente", async () => {
    await db.exec("update private.tc_settings set payments_enabled=false");
    await expect(prepare()).rejects.toThrow(/Cobros desactivados/);
    await db.exec("update private.tc_settings set payments_enabled=true");
    await expect(prepare({ terms_accepted: false })).rejects.toThrow(
      /condiciones/,
    );
    await db.exec("update private.tc_payment_requests set plan_revision=999");
    await expect(prepare()).rejects.toThrow(/precio vigente/);
  });
  it("reserva solo el pedido del usuario y conserva consentimiento sin crear acceso pagado", async () => {
    await expect(prepare({ request_id: otherOrder })).rejects.toThrow(
      /precio vigente/,
    );
    expect((await prepare()).available).toBe(true);
    await prepare();
    expect(
      (
        await db.query(
          "select terms_version from private.tc_subscription_orders",
        )
      ).rows,
    ).toEqual([{ terms_version: "test-approved-v1" }]);
    expect((await customer()).paid_until).toBeNull();
  });
  it("checkout, prueba e impago no conceden un mes pagado", async () => {
    await prepare();
    await call("saved", {
      request_id: order,
      checkout_id: "cs_test_synthetic",
    });
    await event({ invoice_paid: false, state: "trialing" });
    expect((await customer()).paid_until).toBeNull();
    await event({
      invoice_paid: false,
      state: "past_due",
      event_id: "evt_failed",
      event_created: now + 1,
    });
    expect((await customer()).paid_until).toBeNull();
  });
  it("aplica un periodo pagado una sola vez, incluso con otro evento de la misma factura", async () => {
    await prepare();
    await event();
    const paid = (await customer()).paid_until!.toISOString();
    expect((await event()).duplicate).toBe(true);
    await event({ event_id: "evt_retry" });
    expect((await customer()).paid_until!.toISOString()).toBe(paid);
    expect(
      (
        await db.query(
          "select count(*)::integer n from private.tc_subscription_invoices",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("renueva con el periodo verificado y no añade meses por cada webhook", async () => {
    await prepare();
    await event();
    await event({
      event_id: "evt_second",
      event_created: now + 1,
      invoice_id: "in_second",
      invoice_period_start: now + 30 * 86400,
      invoice_period_end: now + 60 * 86400,
      period_end: now + 60 * 86400,
    });
    expect((await customer()).paid_until!.toISOString()).toBe(
      new Date((now + 60 * 86400) * 1000).toISOString(),
    );
  });
  it("rechaza importe alterado, factura de otro cliente y periodos abusivos sin guardar el evento", async () => {
    await prepare();
    await expect(event({ invoice_amount: 1 })).rejects.toThrow(/Factura/);
    await expect(event({ unit_amount: 1 })).rejects.toThrow(/precio/);
    await expect(
      event({ invoice_period_end: now + 365 * 86400 }),
    ).rejects.toThrow(/Factura/);
    expect((await customer()).paid_until).toBeNull();
    expect(
      (
        await db.query(
          "select count(*)::integer n from private.tc_subscription_events",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("no reasigna una suscripción ni expone recibos de otra cuenta", async () => {
    await prepare();
    await event();
    await call(
      "prepare",
      {
        request_id: otherOrder,
        terms_accepted: true,
        terms_version: "test-approved-v1",
      },
      b,
    );
    await expect(
      event({ user_id: b, request_id: otherOrder, event_id: "evt_foreign" }),
    ).rejects.toThrow(/otra cuenta/);
    expect((await call("status", {}, b)).invoices).toEqual([]);
    expect((await call("status", {}, b)).subscription).toBeNull();
  });
  it("conserva suspensiones administrativas y acceso ya abonado al cancelar", async () => {
    await prepare();
    await db.query(
      "update private.tc_customers set status='suspended' where user_id=$1",
      [a],
    );
    await event();
    expect((await customer()).status).toBe("suspended");
    const paid = (await customer()).paid_until!.toISOString();
    await event({
      event_id: "evt_cancelled",
      event_created: now + 2,
      invoice_paid: false,
      state: "canceled",
    });
    await event({
      event_id: "evt_delayed",
      event_created: now + 1,
      invoice_paid: false,
    });
    expect((await call("status")).subscription).toMatchObject({
      state: "canceled",
    });
    expect((await customer()).paid_until!.toISOString()).toBe(paid);
  });
  it("permite gestionar cancelaciones con ventas apagadas; no permite reanudar ni duplicar suscripciones", async () => {
    await prepare();
    await event();
    await expect(prepare()).rejects.toThrow(/suscripción existente/);
    await db.exec("update private.tc_settings set payments_enabled=false");
    expect((await call("manage", { operation: "cancel" })).provider_id).toBe(
      "sub_synthetic",
    );
    await expect(call("manage", { operation: "resume" })).rejects.toThrow(
      /desactivadas/,
    );
  });
});
