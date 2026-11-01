import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const migration = "20261101110905_commercial_offer_ten_days_vat.sql";
const previousUser = "a7100000-0000-4000-8000-000000000001";
const newUser = "a7100000-0000-4000-8000-000000000002";
let db: PGlite;
let previousTrial: unknown;
let previousRequest: string;
const registration = {
  truckcontrol_registration: {
    contact_name: "Persona ficticia",
    company_name: "Transporte ficticio",
    tax_id: "DEMO-PRICING",
    address: "Dirección ficticia 10",
    phone: "+34600000001",
    requested_plan: "full",
  },
  trial_days: 9999,
  is_admin: true,
};
async function insertUser(id: string) {
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
    [
      id,
      `${id}@example.com`,
      {
        ...registration,
        truckcontrol_registration: {
          ...registration.truckcontrol_registration,
          phone: id === newUser ? "+34600000002" : "+34600000001",
        },
      },
    ],
  );
}
async function request(user: string, plan: string) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return (
      await db.query<{ id: string }>("select public.tc_request_plan($1) id", [
        plan,
      ])
    ).rows[0].id;
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file === migration) break;
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec(
    "update private.tc_settings set registration_open=true,sms_ready=false,enforce_access=true",
  );
  await insertUser(previousUser);
  previousTrial = (
    await db.query(
      "select trial_started_at,trial_ends_at from private.tc_customers where user_id=$1",
      [previousUser],
    )
  ).rows[0];
  previousRequest = await request(previousUser, "limited");
  await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  await insertUser(newUser);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("oferta comercial y conservación de contratos", () => {
  it("conserva la prueba anterior de treinta días y su presupuesto sin inventar IVA histórico", async () => {
    expect(
      (
        await db.query(
          "select trial_started_at,trial_ends_at from private.tc_customers where user_id=$1",
          [previousUser],
        )
      ).rows[0],
    ).toEqual(previousTrial);
    expect(
      (
        await db.query(
          "select quoted_cents,net_cents,vat_cents from private.tc_payment_requests where id=$1",
          [previousRequest],
        )
      ).rows[0],
    ).toEqual({ quoted_cents: 1000, net_cents: null, vat_cents: null });
  });
  it("crea nuevas pruebas de diez días y conserva el interés Full sin conceder privilegios por metadatos", async () => {
    const row = (
      await db.query<{ days: number; requested_plan: string }>(
        "select extract(epoch from trial_ends_at-trial_started_at)/86400 days,requested_plan from private.tc_customers where user_id=$1",
        [newUser],
      )
    ).rows[0];
    expect(Number(row.days)).toBe(10);
    expect(row.requested_plan).toBe("full");
    expect(
      (
        await db.query("select * from private.tc_admins where user_id=$1", [
          newUser,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("cotiza ambos planes con IVA desde el servidor y mantiene apagado el pago", async () => {
    for (const [plan, base, vat, total] of [
      ["limited", 30000, 6300, 36300],
      ["full", 70000, 14700, 84700],
    ] as const) {
      const id = await request(newUser, plan);
      expect(await request(newUser, plan)).toBe(id);
      expect(
        (
          await db.query(
            "select net_cents,vat_rate_bps,vat_cents,quoted_cents from private.tc_payment_requests where id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({
        net_cents: base,
        vat_rate_bps: 2100,
        vat_cents: vat,
        quoted_cents: total,
      });
    }
    expect(
      (
        await db.query<{ payments_enabled: boolean }>(
          "select payments_enabled from private.tc_settings",
        )
      ).rows[0].payments_enabled,
    ).toBe(false);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from private.tc_billing_subscriptions",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("rechaza un presupuesto con IVA inconsistente y bloquea el acceso directo del cliente", async () => {
    await expect(
      db.query(
        "insert into private.tc_payment_requests(user_id,plan_id,quoted_cents,plan_revision,net_cents,vat_rate_bps,vat_cents) values($1,'limited',30000,3,30000,2100,6300)",
        [newUser],
      ),
    ).rejects.toThrow(/tc_payment_quote_tax_check/);
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query("select * from private.tc_payment_requests"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
