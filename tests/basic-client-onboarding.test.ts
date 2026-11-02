import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const migration = "20261102062634_basic_client_onboarding.sql";
const legacy = "bd100000-0000-4000-8000-000000000001";
const basic = "bd100000-0000-4000-8000-000000000002";
const other = "bd100000-0000-4000-8000-000000000003";
const admin = "bd100000-0000-4000-8000-000000000004";
let db: PGlite, before: unknown, org: string, otherOrg: string;
const profile = (n: number) => ({
  truckcontrol_registration: {
    contact_name: "Persona ficticia",
    company_name: `Alta ficticia ${n}`,
    tax_id: `DEMO-${n}`,
    address: "Dirección ficticia 10",
    phone: `+3460000090${n}`,
    requested_plan: "full",
    trial_plan_id: "full",
    trial_days: 9999,
  },
  paid_plan: "full",
  is_admin: true,
  module_overrides: { invoice_ai: true, document_ai: true },
});
async function actor<T>(id: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function access(id = basic, organization?: string) {
  return actor(
    id,
    async () =>
      (
        await db.query<{
          v: {
            active: boolean;
            is_admin: boolean;
            plan: string;
            max_trucks: number;
            profile: {
              trial_plan_id: string;
              requested_plan: string;
              trial_started_at: string;
              trial_ends_at: string;
            };
            features: Record<string, boolean>;
          };
        }>(
          organization
            ? "select public.tc_organization_access($1) v"
            : "select public.tc_my_access() v",
          organization ? [organization] : [],
        )
      ).rows[0].v,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (f === migration) break;
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  }
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'legacy@company.invalid',now(),$2)",
    [legacy, profile(1)],
  );
  before = (
    await db.query(
      "select to_jsonb(c) v from private.tc_customers c where user_id=$1",
      [legacy],
    )
  ).rows[0].v;
  await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  await db.exec(
    "update private.tc_plans set modules=modules||'{\"document_ai\":false}'::jsonb where id='limited'",
  );
  await db.exec(
    "update private.tc_auth_mail_settings set enabled=true,legal_ready=true",
  );
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,'basic@company.invalid',$2),($3,'other@company.invalid',$4)",
    [basic, profile(2), other, profile(3)],
  );
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@company.invalid',now())",
    [admin],
  );
  await db.query("insert into private.tc_admins(user_id) values($1)", [admin]);
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("alta verificada con acceso Básico", () => {
  it("conserva íntegros los datos y el acceso Full concedidos anteriormente", async () => {
    const after = (
      await db.query(
        "select to_jsonb(c)-'trial_plan_id' v from private.tc_customers c where user_id=$1",
        [legacy],
      )
    ).rows[0].v;
    expect(after).toEqual(before);
    expect((await access(legacy)).plan).toBe("full");
  });
  it("publica Básico como prueba inicial de diez días y mantiene precios y cobros", async () => {
    const c = (
      await db.query<{
        v: {
          trial_plan: string;
          trial_days: number;
          payments_enabled: boolean;
          plans: { monthly_cents: number }[];
        };
      }>("select public.tc_public_catalog() v")
    ).rows[0].v;
    expect(c.trial_plan).toBe("limited");
    expect(c.trial_days).toBe(10);
    expect(c.payments_enabled).toBe(false);
    expect(c.plans.map((p) => p.monthly_cents)).toEqual([30000, 70000]);
  });
  it("no activa una cuenta por solicitar acceso o falsificar metadatos", async () => {
    expect((await access()).active).toBe(false);
    expect(
      (
        await db.query(
          "select id from public.organizations where owner_id=$1",
          [basic],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("exige un recibo legal del servidor además del correo verificado", async () => {
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [basic],
    );
    expect((await access()).active).toBe(false);
    await db.query(
      "insert into private.tc_auth_legal_consents(user_id,legal_version,source) values($1,'2026-11-02','authenticated_profile')",
      [basic],
    );
    await db.query("select private.tc_provision($1)", [basic]);
    const a = await access();
    expect(a.active).toBe(true);
    expect(a.is_admin).toBe(false);
    expect(a.plan).toBe("limited");
    expect(a.profile.requested_plan).toBe("full");
    expect(a.profile.trial_plan_id).toBe("limited");
    expect(
      Date.parse(a.profile.trial_ends_at) -
        Date.parse(a.profile.trial_started_at),
    ).toBe(10 * 86400000);
    org = (
      await db.query<{ id: string }>(
        "select id from public.organizations where owner_id=$1",
        [basic],
      )
    ).rows[0].id;
    expect((await access(basic, org)).plan).toBe("limited");
  });
  it("no concede las funciones Full aunque el usuario acepte IA", async () => {
    await db.exec(
      "update private.tc_modules set enabled=true where id in('invoice_ai','document_ai')",
    );
    await db.query(
      "update private.tc_customers set ai_allowed=true,ai_opt_in=true where user_id=$1",
      [basic],
    );
    const a = await access(basic, org);
    expect(a.features.invoice_ai).toBe(false);
    expect(a.features.document_ai).toBe(false);
    expect(a.features.trucks).toBe(true);
    expect(a.features.profitability).toBe(true);
    expect(a.max_trucks).toBe(50);
  });
  it("los clientes no pueden cambiar su plan de prueba en tablas privadas", async () => {
    await expect(
      actor(basic, () =>
        db.query(
          "update private.tc_customers set trial_plan_id='full' where user_id=$1",
          [basic],
        ),
      ),
    ).rejects.toThrow();
    expect((await access()).plan).toBe("limited");
  });
  it("cambiar el perfil o solicitar Full no lo activa ni reinicia la prueba", async () => {
    const initial = (await access()).profile.trial_ends_at;
    await db.query("update auth.users set raw_user_meta_data=$2 where id=$1", [
      basic,
      profile(2),
    ]);
    await actor(basic, () => db.query("select public.tc_request_plan('full')"));
    const a = await access();
    expect(a.plan).toBe("limited");
    expect(a.profile.trial_ends_at).toBe(initial);
  });
  it("el alta repetida no duplica la empresa", async () => {
    await db.query("select private.tc_provision($1)", [basic]);
    expect(
      (
        await db.query(
          "select id from public.organizations where owner_id=$1",
          [basic],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("mantiene el aislamiento entre dos nuevas empresas Básico", async () => {
    await db.query(
      "insert into private.tc_auth_legal_consents(user_id,legal_version,source) values($1,'2026-11-02','authenticated_profile')",
      [other],
    );
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [other],
    );
    otherOrg = (
      await db.query<{ id: string }>(
        "select id from public.organizations where owner_id=$1",
        [other],
      )
    ).rows[0].id;
    expect((await access(other, otherOrg)).plan).toBe("limited");
    expect((await access(other, org)).active).toBe(false);
    const rows = await actor(other, () =>
      db.query("select id from public.organizations where id=$1", [org]),
    );
    expect(rows.rows).toHaveLength(0);
  });
  it("la licencia de los miembros se limita al plan de la empresa", async () => {
    await db.query(
      "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'viewer','active',$3)",
      [org, legacy, basic],
    );
    const a = await access(legacy, org);
    expect(a.plan).toBe("limited");
    expect(a.features.invoice_ai).toBe(false);
  });
  it("solo la activación administrativa permite Full durante una prueba Básico", async () => {
    const request = (
      await actor(basic, () =>
        db.query<{ id: string }>("select public.tc_request_plan('full') id"),
      )
    ).rows[0].id;
    await actor(admin, () =>
      db.query("select public.tc_admin_control('manual_payment',$1::jsonb)", [
        JSON.stringify({
          request_id: request,
          receipt: "TEST ficticio sin cobro",
        }),
      ]),
    );
    expect((await access(basic, org)).plan).toBe("full");
    expect((await access()).plan).toBe("full");
  });
  it("el vencimiento de Básico bloquea el acceso sin conceder Full ni cobrar", async () => {
    await db.query(
      "update private.tc_customers set trial_started_at=now()-interval '11 days',trial_ends_at=now()-interval '1 day' where user_id=$1",
      [other],
    );
    const a = await access(other, otherOrg);
    expect(a.active).toBe(false);
    expect(a.plan).toBe("limited");
    expect(Object.values(a.features).some(Boolean)).toBe(false);
  });
});
