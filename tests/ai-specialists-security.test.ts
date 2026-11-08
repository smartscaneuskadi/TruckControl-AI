import { installAuthSessionFixture, bindFixtureActor, seedFixtureSessions } from "./helpers/auth-session-fixture";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { specialistProfiles } from "../src/domain/ai-specialists";
let db: PGlite, org: string, foreign: string;
const owner = "fb110000-0000-4000-8000-000000000001",
  other = "fb110000-0000-4000-8000-000000000002",
  viewer = "fb110000-0000-4000-8000-000000000003";
const truck = "fb120000-0000-4000-8000-000000000001",
  foreignTruck = "fb120000-0000-4000-8000-000000000002",
  driver = "fb130000-0000-4000-8000-000000000001",
  document = "fb140000-0000-4000-8000-000000000001";
async function as<T>(
  actor: string,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await bindFixtureActor(db, actor);
  await db.exec("savepoint call");
  try {
    return await fn();
  } catch (e) {
    await db.exec("rollback to savepoint call");
    throw e;
  } finally {
    await db.exec("release savepoint call;reset role");
  }
}
async function control(
  action: string,
  data: unknown = {},
  company = org,
  actor = owner,
): Promise<any> {
  return as(
    actor,
    async () =>
      (
        await db.query<{ v: unknown }>(
          "select public.tc_company_specialists($1,$2,$3::jsonb) v",
          [company, action, JSON.stringify(data)],
        )
      ).rows[0].v,
  );
}
async function server(
  action: string,
  data: unknown,
  actor = owner,
): Promise<any> {
  return as(
    actor,
    async () =>
      (
        await db.query<{ v: unknown }>(
          "select public.company_specialists_server($1,$2,$3,$4::jsonb) v",
          [org, actor, action, JSON.stringify(data)],
        )
      ).rows[0].v,
    "service_role",
  );
}
async function start(profile = "general", docs: string[] = []) {
  const context = await control("prepare", {
    profile,
    query: "Consulta de prueba",
    document_ids: docs,
  });
  const id = randomUUID();
  expect(await server("begin", { request_id: id, profile, context })).toEqual({
    started: true,
  });
  return { id, context };
}
async function finish(id: string, extra: Record<string, unknown> = {}) {
  return server("finish", {
    request_id: id,
    reply: "Respuesta basada en los registros de prueba.",
    items: [],
    citations: ["R1"],
    uncertainties: [],
    ...extra,
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`);
  await installAuthSessionFixture(db);
  for (const name of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  for (const [i, id] of [owner, other, viewer].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        id,
        `specialists-${i}@example.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: "DEMO Especialistas " + i,
            tax_id: "DEMO-SP-" + i,
            address: "Direccion ficticia",
            phone: "+1202555020" + i,
            requested_plan: "limited",
          },
        },
      ],
    );
  org = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [owner],
    )
  ).rows[0].id;
  foreign = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [other],
    )
  ).rows[0].id;
  await db.exec(
    "update private.tc_settings set enforce_access=true,sms_ready=false;update private.tc_modules set enabled=true;update private.tc_provider_settings set ai_enabled=true,ai_monthly_budget_cents=1000;update private.tc_customers set status='trial',trial_started_at=now(),trial_ends_at=now()+interval '10 days',trial_plan_id='full',ai_allowed=true,ai_opt_in=true",
  );
  await db.query(
    "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'viewer','active',$3)",
    [org, viewer, owner],
  );
  await db.query(
    "insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values($1,$2,'DEMO-SP-A','Scania','Ficticio',2020,100800,'available',current_date+30,''),($3,$4,'DEMO-SECRET-B','MAN','Ficticio',2020,500000,'available',current_date+30,'')",
    [truck, org, foreignTruck, foreign],
  );
  await db.query(
    "insert into public.drivers(id,organization_id,name,email,phone,license,license_expires_on,status) values($1,$2,'Conductor ficticio','','','C+E',current_date-1,'active')",
    [driver, org],
  );
  await db.query(
    "insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values(gen_random_uuid(),$1,$2,'income','Ingreso ficticio',current_date,110000,'transport','paid',1000),(gen_random_uuid(),$1,$2,'expense','Gasto ficticio',current_date,33000,'fuel','paid',0)",
    [org, truck],
  );
  for (const [offset, km, ml, full] of [
    [-10, 100000, 300000, true],
    [-5, 100400, 120000, false],
    [0, 100800, 120000, true],
  ] as const) {
    const day = (
      await db.query<{ d: string }>(
        "select to_char(current_date+$1::integer,'YYYY-MM-DD') d",
        [offset],
      )
    ).rows[0].d;
    await db.query(
      "insert into private.fleet_records(id,organization_id,kind,truck_id,payload) values(gen_random_uuid(),$1,'fuel',$2,$3)",
      [
        org,
        truck,
        {
          truckId: truck,
          driverId: null,
          date: day,
          odometerKm: km,
          millilitres: ml,
          amountCents: 10000,
          station: "DEMO",
          fullTank: full,
          notes: "",
        },
      ],
    );
  }
  await db.query(
    "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values($1::uuid,$2::uuid,'Documento ficticio.pdf',$2::uuid::text||'/'||$1::uuid::text||'/document.pdf','application/pdf',100)",
    [document, org],
  );
  await seedFixtureSessions(db);
}, 30000);
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("reset role;rollback"));
afterAll(() => db.close());
describe("ocho perfiles con evidencias y dominio de empresa", () => {
  it("el nombre DEMO y los metadatos no autorizan el staging", async () => {
    await expect(control("stage_access")).rejects.toThrow();
    await db.query(
      "insert into private.tc_specialist_test_organizations(organization_id,enabled) values($1,true)",
      [org],
    );
    expect(await control("stage_access")).toMatchObject({
      organization_id: org,
      allowed: true,
    });
    await expect(control("stage_access", {}, foreign)).rejects.toThrow();
    await db.query(
      "update private.tc_specialist_test_organizations set enabled=false where organization_id=$1",
      [org],
    );
    await expect(control("stage_access")).rejects.toThrow();
  });
  it("un cliente no puede autorizar staging ni certificar conexiones", async () => {
    await expect(
      as(owner, () =>
        db.query(
          "insert into private.tc_specialist_test_organizations(organization_id,enabled) values($1,true)",
          [org],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      as(owner, () =>
        db.exec(
          "update private.tc_specialist_verifications set verified_at=now()",
        ),
      ),
    ).rejects.toThrow();
  });
  it("no presenta conexiones como verificadas antes de la aceptación real", async () => {
    const s = await control("status");
    expect(s.profiles).toHaveLength(8);
    expect(
      s.profiles.every(
        (p: any) =>
          p.allowed &&
          p.connection_verified === false &&
          p.verified_at === null,
      ),
    ).toBe(true);
  });
  for (const p of specialistProfiles)
    it(`prepara solo el ámbito autorizado de ${p.id}`, async () => {
      const c = await control("prepare", {
        profile: p.id,
        query: "Consulta de prueba",
        document_ids: [],
      });
      expect(Object.keys(c.entities).sort()).toEqual([...p.entities].sort());
      expect(JSON.stringify(c)).not.toContain(foreignTruck);
      expect(JSON.stringify(c)).not.toContain("DEMO-SECRET-B");
      expect(c.organization_id).toBe(org);
    });
  it("calcula beneficio y euros/km con enteros y base explícita", async () => {
    const c = await control("prepare", {
      profile: "finance",
      query: "Beneficio",
      document_ids: [],
    });
    expect(c.statistics.values.finance_by_truck[0]).toMatchObject({
      incomeCents: 110000,
      expenseCents: 33000,
      profitCents: 77000,
      registeredIncomeKm: 1000,
      incomeEurosPerKm: 1.1,
      expenseEurosPerKm: 0.33,
      profitEurosPerKm: 0.77,
    });
  });
  it("incluye parciales entre depósitos llenos y excluye el primer llenado", async () => {
    const c = await control("prepare", {
      profile: "fuel",
      query: "Consumo",
      document_ids: [],
    });
    expect(c.statistics.values.fuel_by_truck[0]).toMatchObject({
      fullTankIntervals: 1,
      measuredKm: 800,
      intervalMillilitres: 240000,
      litresPer100Km: 30,
    });
  });
  it("consumo sin dos depósitos completos es desconocido, no cero", async () => {
    await db.exec(
      "update private.fleet_records set payload=jsonb_set(payload,'{fullTank}','false') where kind='fuel'",
    );
    const c = await control("prepare", {
      profile: "fuel",
      query: "Consumo",
      document_ids: [],
    });
    expect(c.statistics.values.fuel_by_truck[0].litresPer100Km).toBeNull();
  });
  it("no deriva gastos ni margen cuando el permiso de gastos se retira", async () => {
    await db.query(
      "update private.tc_customers set module_overrides='{" +
        '"expenses":false' +
        "}' where user_id=$1",
      [owner],
    );
    const c = await control("prepare", {
      profile: "finance",
      query: "Beneficio",
      document_ids: [],
    });
    expect(c.entities.expense.allowed).toBe(false);
    expect(c.monthly_eur[0].expenseCents).toBeNull();
    expect(c.statistics.values.finance_by_truck[0]).toMatchObject({
      expenseCents: null,
      profitCents: null,
      expenseEurosPerKm: null,
      profitEurosPerKm: null,
    });
  });
  it("deniega empresa ajena y perfiles desconocidos", async () => {
    await expect(control("status", {}, foreign)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      control("prepare", { profile: "admin", query: "Todo", document_ids: [] }),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("resuelve el documento elegido sin exponer rutas privadas", async () => {
    const c = await control("prepare", {
      profile: "documents",
      query: "Lee",
      document_ids: [document],
    });
    expect(c.documents).toHaveLength(1);
    expect(c.documents[0]).toMatchObject({
      reference: "D1",
      id: document,
      title: "Documento ficticio.pdf",
    });
    expect(JSON.stringify(c)).not.toContain("object_path");
    expect(JSON.stringify(c)).not.toContain("/document.pdf");
  });
  it("rechaza documento ajeno, duplicado y archivo en perfil diferente", async () => {
    await expect(
      control("prepare", {
        profile: "documents",
        query: "Lee",
        document_ids: [foreignTruck],
      }),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      control("prepare", {
        profile: "documents",
        query: "Lee",
        document_ids: [document, document],
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      control("prepare", {
        profile: "fuel",
        query: "Lee",
        document_ids: [document],
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("no acepta una fuente de otra empresa aunque llegue desde servidor", async () => {
    const c = await control("prepare", {
      profile: "general",
      query: "Estado",
      document_ids: [],
    });
    c.catalog[0].id = foreignTruck;
    await expect(
      server("begin", {
        request_id: randomUUID(),
        profile: "general",
        context: c,
      }),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("resuelve citas del catálogo y conserva resultado inmutable al repetir finish", async () => {
    const { id, context } = await start();
    const a = await finish(id);
    expect(a.sources[0]).toEqual(context.catalog[0]);
    const b = await finish(id, {
      reply: "Otra respuesta",
      citations: [],
      uncertainties: ["No procede"],
    });
    expect(b).toEqual(a);
  });
  it("rechaza referencias no proporcionadas sin preparar escrituras", async () => {
    const { id } = await start();
    await expect(
      finish(id, { citations: ["R-empresa-ajena"] }),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (await db.query("select count(*) n from private.tc_copilot_actions"))
        .rows[0].n,
    ).toBe(0);
  });
  it("rechaza propuestas fuera del perfil aunque el usuario tenga el módulo", async () => {
    const { id } = await start("fuel");
    await expect(
      finish(id, {
        items: [
          {
            entity: "customers",
            mode: "create",
            record_id: null,
            expected_version: null,
            fields: {
              name: "DEMO",
              taxId: "DEMO",
              email: "",
              phone: "",
              address: "",
              notes: "",
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("retirada de consentimiento impide recuperar respuestas anteriores", async () => {
    const { id } = await start();
    await finish(id);
    await db.query(
      "update private.tc_customers set ai_opt_in=false where user_id=$1",
      [owner],
    );
    await expect(control("result", { request_id: id })).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("no concede DML directo ni acceso al RPC de servidor a usuarios", async () => {
    await expect(
      as(owner, () => db.query("select * from private.tc_specialist_turns")),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      as(owner, () =>
        db.query(
          "select public.company_specialists_server($1,$2,'begin','{}')",
          [org, owner],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
describe("avisos opt-in sin llamadas de pago", () => {
  const pref = {
    profile: "general",
    enabled: true,
    cadence: "daily",
    expected_version: 0,
  };
  it("parte desactivado y no ejecuta avisos antes del consentimiento específico", async () => {
    expect(
      (await control("jobs_status", { profile: "general" })).preference,
    ).toMatchObject({ enabled: false, version: 0 });
    await expect(
      control("jobs_run", { profile: "general" }),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("ejecuta una vez por día y no consume cuota ni presupuesto del modelo", async () => {
    await control("jobs_save", pref);
    const a = await control("jobs_run", { profile: "general" });
    expect(a.jobs).toHaveLength(1);
    expect(a.jobs[0]).toMatchObject({ state: "complete", attempts: 1 });
    expect(a.jobs[0].summary.paid_model_calls).toBe(0);
    const b = await control("jobs_run", { profile: "general" });
    expect(b.jobs[0].id).toBe(a.jobs[0].id);
    expect(
      (await db.query("select count(*) n from private.tc_ai_calls")).rows[0].n,
    ).toBe(0);
  });
  it("conserva cambios de otro dispositivo con versión esperada", async () => {
    await control("jobs_save", pref);
    await expect(
      control("jobs_save", { ...pref, cadence: "weekly" }),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("no expone avisos de otro usuario de la misma empresa", async () => {
    await control("jobs_save", pref);
    await control("jobs_run", { profile: "general" });
    const v = await control("jobs_status", { profile: "general" }, org, viewer);
    expect(v.jobs).toEqual([]);
    expect(v.preference.enabled).toBe(false);
  });
  it("desactiva la preferencia al perder consentimiento antes del tick", async () => {
    await control("jobs_save", pref);
    await db.query(
      "update private.tc_customers set ai_opt_in=false where user_id=$1",
      [owner],
    );
    await db.exec("select private.tc_specialist_tick()");
    expect(
      (await db.query("select enabled from private.tc_specialist_preferences"))
        .rows[0].enabled,
    ).toBe(false);
    expect(
      (await db.query("select count(*) n from private.tc_specialist_jobs"))
        .rows[0].n,
    ).toBe(0);
  });
  it("limita reintentos a tres ante fallo temporal del cálculo", async () => {
    await control("jobs_save", pref);
    await db.exec(
      "select private.tc_specialist_enqueue();create or replace function private.tc_specialist_statistics(p_org uuid,p_user uuid,p text) returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'Synthetic temporary failure' using errcode='XX000';end;$$;",
    );
    for (let n = 1; n <= 3; n++) {
      await db.exec(
        "update private.tc_specialist_jobs set run_after=now()-interval '1 minute';select private.tc_specialist_process()",
      );
      expect(
        (await db.query("select attempts from private.tc_specialist_jobs"))
          .rows[0].attempts,
      ).toBe(n);
    }
    expect(
      (await db.query("select state from private.tc_specialist_jobs")).rows[0]
        .state,
    ).toBe("failed");
    await db.exec("select private.tc_specialist_process()");
    expect(
      (await db.query("select attempts from private.tc_specialist_jobs"))
        .rows[0].attempts,
    ).toBe(3);
  });
});
