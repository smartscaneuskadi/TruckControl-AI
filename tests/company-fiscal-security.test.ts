import { installAuthSessionFixture, bindFixtureActor, seedFixtureSessions } from "./helpers/auth-session-fixture";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type {
  CompanyFiscalState,
  FiscalPolicyInput,
  FiscalProfileInput,
  CompanyFiscalPage,
} from "../src/domain/company-fiscal";
import { companyFiscalStateSchema } from "../src/domain/company-fiscal";

let db: PGlite, org: string, foreign: string;
const admin = "fb100000-0000-4000-8000-000000000001",
  owner = "fb100000-0000-4000-8000-000000000002",
  other = "fb100000-0000-4000-8000-000000000003",
  member = "fb100000-0000-4000-8000-000000000004";
const allowed: FiscalPolicyInput = {
  enabled: true,
  options: {
    ticketbai: true,
    verifactu: true,
    no_verifactu: true,
    external: true,
    facturae: true,
  },
};
const ticket: FiscalProfileInput = {
  regime: "ticketbai",
  territory: "gipuzkoa",
  document_format: "pdf",
};
const external: FiscalProfileInput = {
  regime: "external",
  territory: null,
  document_format: "pdf",
};
async function as<T>(
  actor: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await bindFixtureActor(db, actor);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function call(
  actor: string | null,
  action = "status",
  data: unknown = {},
  company: string | null = org,
  expected: number | null = null,
  after: string | null = null,
) {
  return as(
    actor,
    async () =>
      (
        await db.query<{ v: CompanyFiscalState | CompanyFiscalPage }>(
          "select public.tc_company_fiscal_control($1,$2,$3::jsonb,$4,$5) v",
          [company, action, JSON.stringify(data), expected, after],
        )
      ).rows[0].v,
  );
}
async function policy(
  data: FiscalPolicyInput = allowed,
  company = org,
  expected: number | null = null,
) {
  return (await call(
    admin,
    "admin_set",
    data,
    company,
    expected,
  )) as CompanyFiscalState;
}
async function save(
  data: unknown = ticket,
  expected: number | null = null,
  actor = owner,
  company = org,
) {
  return (await call(
    actor,
    "save",
    data,
    company,
    expected,
  )) as CompanyFiscalState;
}
async function auditCount(action = "fiscal_profile_update") {
  return (
    await db.query<{ n: number }>(
      "select count(*)::int n from private.tc_admin_audit where action=$1",
      [action],
    )
  ).rows[0].n;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;`);
  await installAuthSessionFixture(db);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [i, id] of [admin, owner, other, member].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        id,
        i === 0
          ? "pedidos@smartscaneuskadi.com"
          : `fiscal-${i}@example.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Fiscal ficticia ${i}`,
            tax_id: `DEMO-FISCAL-${i}`,
            address: "Direccion ficticia 1",
            phone: `+1202555010${i}`,
            requested_plan: "limited",
          },
          is_admin: true,
        },
      ],
    );
  await db.query(
    "insert into private.tc_admins(user_id) values($1) on conflict do nothing",
    [admin],
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
  await db.query(
    "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'admin','active',$3)",
    [org, member, owner],
  );
  await seedFixtureSessions(db);
}, 30000);
beforeEach(async () => {
  await db.exec(
    "truncate private.tc_fiscal_profiles,private.tc_fiscal_policies;delete from private.tc_admin_audit where action like 'fiscal_%';update auth.users set email_confirmed_at=now(),banned_until=null,deleted_at=null;update private.tc_customers set status='trial',trial_started_at=now(),trial_ends_at=now()+interval '10 days';update private.tc_modules set enabled=true where id='income';update private.tc_memberships set role='admin',status='active'",
  );
});
afterAll(async () => {
  await db?.close();
});

describe("preparación fiscal multiempresa bajo control de la plataforma", () => {
  it("parte desactivada y sin emisión, sin elegir un régimen por el domicilio", async () => {
    const state = (await call(owner)) as CompanyFiscalState;
    expect(companyFiscalStateSchema.safeParse(state).success).toBe(true);
    expect(state.policy).toMatchObject({
      enabled: false,
      version: null,
      options: {
        ticketbai: false,
        verifactu: false,
        no_verifactu: false,
        external: false,
        facturae: false,
      },
    });
    expect(state.profile).toBeNull();
    expect(state.emission_available).toBe(false);
    await expect(save()).rejects.toThrow();
  });
  it("solo el administrador global verificado puede conceder opciones, nunca los metadatos del cliente", async () => {
    for (const user of [owner, other, member]) {
      await expect(call(user, "admin_set", allowed)).rejects.toThrow();
      await expect(call(user, "admin_list", {}, null)).rejects.toThrow();
    }
    const state = await policy();
    expect(state.policy.version).toBe(1);
    expect(state.emission_available).toBe(false);
    expect(await auditCount("fiscal_policy_update")).toBe(1);
  });
  it("anónimos no ejecutan la API ni leen directamente las tablas", async () => {
    await expect(
      as(
        null,
        () =>
          db.query("select public.tc_company_fiscal_control($1,'status')", [
            org,
          ]),
        "anon",
      ),
    ).rejects.toThrow();
    await expect(
      as(
        null,
        () => db.query("select * from private.tc_fiscal_policies"),
        "anon",
      ),
    ).rejects.toThrow();
  });
  it("aísla perfiles y políticas entre empresas tanto en RPC como en RLS", async () => {
    await policy();
    await policy(allowed, foreign);
    await save();
    await save(external, null, other, foreign);
    await expect(call(owner, "status", {}, foreign)).rejects.toThrow();
    await expect(save(external, null, owner, foreign)).rejects.toThrow();
    const rows = await as(owner, () =>
      db.query<{ organization_id: string }>(
        "select organization_id from private.tc_fiscal_profiles",
      ),
    );
    expect(rows.rows.map((r) => r.organization_id)).toEqual([org]);
    const policies = await as(owner, () =>
      db.query<{ organization_id: string }>(
        "select organization_id from private.tc_fiscal_policies",
      ),
    );
    expect(policies.rows.map((r) => r.organization_id)).toEqual([org]);
  });
  it("la habilitación corresponde a cada empresa aunque compartan propietario", async () => {
    const second = "fb200000-0000-4000-8000-000000000001";
    await db.query(
      "insert into public.organizations(id,owner_id,name) values($1,$2,'Segunda fiscal ficticia') on conflict do nothing",
      [second, owner],
    );
    await policy();
    await save();
    expect(
      ((await call(owner, "status", {}, second)) as CompanyFiscalState).policy
        .enabled,
    ).toBe(false);
    await expect(save(external, null, owner, second)).rejects.toThrow();
  });
  it("permite al administrador de empresa elegir su perfil, pero no modificar su autorización", async () => {
    await policy();
    const state = await save(ticket, null, member);
    expect(state.profile).toMatchObject(ticket);
    await expect(
      call(member, "admin_set", { ...allowed, enabled: false }),
    ).rejects.toThrow();
  });
  it.each(["operator", "viewer", "revoked"])(
    "no concede configuración al rol/estado %s",
    async (role) => {
      await policy();
      await db.query(
        role === "revoked"
          ? "update private.tc_memberships set status='revoked' where user_id=$1"
          : "update private.tc_memberships set role=$2 where user_id=$1",
        role === "revoked" ? [member] : [member, role],
      );
      await expect(call(member)).rejects.toThrow();
      await expect(save(ticket, null, member)).rejects.toThrow();
    },
  );
  it.each([admin, owner])(
    "una sesión antigua no conserva acceso de una cuenta sin verificar, bloqueada o eliminada (%s)",
    async (user) => {
      await policy();
      const probe = () =>
        user === admin ? call(admin, "admin_list", {}, null) : call(owner);
      await db.query(
        "update auth.users set email_confirmed_at=null where id=$1",
        [user],
      );
      await expect(probe()).rejects.toThrow();
      await db.query(
        "update auth.users set email_confirmed_at=now(),banned_until=now()+interval '1 day' where id=$1",
        [user],
      );
      await expect(probe()).rejects.toThrow();
      await db.query(
        "update auth.users set banned_until=null,deleted_at=now() where id=$1",
        [user],
      );
      await expect(probe()).rejects.toThrow();
    },
  );
  it("suspensión, caducidad o módulo de ingresos apagado impiden configurar", async () => {
    await policy();
    await db.query(
      "update private.tc_customers set status='suspended' where user_id=$1",
      [owner],
    );
    await expect(save()).rejects.toThrow();
    await db.query(
      "update private.tc_customers set status='trial',trial_started_at=now()-interval '11 days',trial_ends_at=now()-interval '1 day' where user_id=$1",
      [owner],
    );
    await expect(call(owner)).rejects.toThrow();
    await db.query(
      "update private.tc_customers set trial_started_at=now(),trial_ends_at=now()+interval '10 days' where user_id=$1",
      [owner],
    );
    await db.exec(
      "update private.tc_modules set enabled=false where id='income'",
    );
    await expect(save()).rejects.toThrow();
  });
  it("no admite una opción ni Facturae que no estén permitidos por la administración", async () => {
    await policy({
      enabled: true,
      options: {
        ticketbai: false,
        external: true,
        verifactu: false,
        no_verifactu: false,
        facturae: false,
      },
    });
    await expect(save()).rejects.toThrow();
    await expect(save({ ...external, regime: "verifactu" })).rejects.toThrow();
    await expect(
      save({ ...external, document_format: "facturae" }),
    ).rejects.toThrow();
    const state = await save(external);
    expect(state.profile).toMatchObject(external);
  });
  it("valida territorio y esquema y rechaza claves, declaraciones de emisión y certificados", async () => {
    await policy();
    for (const data of [
      { regime: "ticketbai", document_format: "pdf" },
      { ...ticket, territory: null },
      { ...ticket, territory: "navarra" },
      { ...external, territory: "gipuzkoa" },
      { ...external, document_format: "html" },
      { ...ticket, emission_available: true },
      { ...ticket, api_key: "synthetic-never-store" },
      { ...ticket, certificate: "synthetic-never-store" },
    ])
      await expect(save(data)).rejects.toThrow();
    expect(await auditCount()).toBe(0);
  });
  it("no acepta políticas incompletas, tipos falsos ni habilitación sin un régimen permitido", async () => {
    for (const data of [
      { enabled: true, options: { facturae: true } },
      {
        enabled: true,
        options: {
          ticketbai: false,
          external: false,
          verifactu: false,
          no_verifactu: false,
          facturae: true,
        },
      },
      { ...allowed, enabled: "true" },
      { ...allowed, options: { ...allowed.options, production: true } },
      { ...allowed, emission_available: true },
      null,
      { ...allowed, padding: "x".repeat(1100) },
    ])
      await expect(call(admin, "admin_set", data)).rejects.toThrow();
    expect(await auditCount("fiscal_policy_update")).toBe(0);
  });
  it("repetir una petición confirmada no duplica versiones ni auditoría; los cambios obsoletos fallan", async () => {
    await policy();
    await policy();
    expect(await auditCount("fiscal_policy_update")).toBe(1);
    const first = await save();
    await save();
    expect(await auditCount()).toBe(1);
    const second = await save(external, first.profile!.version);
    expect(second.profile!.version).toBe(2);
    await expect(save({ ...ticket, territory: "araba" }, 1)).rejects.toThrow();
    expect(((await call(owner)) as CompanyFiscalState).profile).toMatchObject(
      external,
    );
    await policy({ ...allowed, enabled: false }, org, 1);
    await expect(
      policy(
        { ...allowed, options: { ...allowed.options, external: false } },
        org,
        1,
      ),
    ).rejects.toThrow();
  });
  it("revocar conserva el perfil y lo bloquea inmediatamente; rehabilitar no activa envíos", async () => {
    await policy();
    await save();
    await policy({ ...allowed, enabled: false }, org, 1);
    const disabled = (await call(owner)) as CompanyFiscalState;
    expect(disabled.profile).toMatchObject(ticket);
    expect(disabled.configured_option_allowed).toBe(false);
    await expect(save(external, 1)).rejects.toThrow();
    await policy(allowed, org, 2);
    const enabled = (await call(owner)) as CompanyFiscalState;
    expect(enabled.configured_option_allowed).toBe(true);
    expect(enabled.emission_available).toBe(false);
  });
  it("ningún cliente, tampoco un administrador global, puede omitir el controlador auditado mediante DML directo", async () => {
    await policy();
    await save();
    for (const user of [owner, admin]) {
      await expect(
        as(user, () =>
          db.query("update private.tc_fiscal_policies set payload='{}'"),
        ),
      ).rejects.toThrow();
      await expect(
        as(user, () => db.query("delete from private.tc_fiscal_profiles")),
      ).rejects.toThrow();
      await expect(
        as(user, () =>
          db.query(
            "update private.tc_admin_audit set details='{}' where action like 'fiscal_%'",
          ),
        ),
      ).rejects.toThrow();
    }
  });
  it("pagina más de cincuenta empresas sin omitir ni duplicar y no entrega credenciales", async () => {
    for (let n = 1; n <= 55; n++)
      await db.query(
        "insert into public.organizations(id,owner_id,name) values($1,$2,$3) on conflict do nothing",
        [
          `fc200000-0000-4000-8000-${String(n).padStart(12, "0")}`,
          other,
          `Empresa fiscal de prueba ${n}`,
        ],
      );
    const first = (await call(
      admin,
      "admin_list",
      {},
      null,
    )) as CompanyFiscalPage;
    expect(first.items).toHaveLength(50);
    expect(first.next_cursor).not.toBeNull();
    const second = (await call(
      admin,
      "admin_list",
      {},
      null,
      null,
      first.next_cursor,
    )) as CompanyFiscalPage;
    expect(second.next_cursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((r) => r.organization_id))
        .size,
    ).toBe(first.items.length + second.items.length);
    for (const item of [...first.items, ...second.items])
      expect(companyFiscalStateSchema.safeParse(item).success).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(
      /email|api_key|certificate|service_role|stripe/,
    );
  });
});
