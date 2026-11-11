import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
let sequence = 0;
interface Company {
  user: string;
  sid: string;
  org: string;
}
let a: Company, b: Company;
const ids = {
  primary: "de330000-0000-4000-8000-000000000001",
  second: "de330000-0000-4000-8000-000000000002",
  other: "de330000-0000-4000-8000-000000000003",
  foreign: "de330000-0000-4000-8000-000000000004",
  truck: "de440000-0000-4000-8000-000000000001",
  otherTruck: "de440000-0000-4000-8000-000000000002",
  foreignTruck: "de440000-0000-4000-8000-000000000003",
};
async function actor(company: Company) {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      company.user,
      JSON.stringify({
        sub: company.user,
        role: "authenticated",
        session_id: company.sid,
      }),
    ],
  );
  await db.exec("set local role authenticated");
}
async function company(): Promise<Company> {
  const n = ++sequence,
    suffix = String(n).padStart(12, "0");
  const user = "de110000-0000-4000-8000-" + suffix,
    sid = "de220000-0000-4000-8000-" + suffix;
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)",
    [
      user,
      "truck-team-" + n + "@example.invalid",
      JSON.stringify({
        truckcontrol_registration: {
          contact_name: "Persona ficticia",
          company_name: "Empresa aislada " + n,
          tax_id: "DEMO-CREW-" + n,
          address: "Direccion ficticia 123",
          phone: "+1202555" + String(7000 + n),
          requested_plan: "limited",
        },
      }),
    ],
  );
  await db.query(
    "insert into private.tc_auth_legal_consents(user_id,legal_version,source) values($1,'2026-11-02','authenticated_profile')",
    [user],
  );
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    user,
  ]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
    sid,
    user,
  ]);
  await actor({ user, sid, org: "" });
  await db.query("select public.tc_finish_registration()");
  await db.exec("reset role");
  const org = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [user],
    )
  ).rows[0].id;
  return { user, sid, org };
}
async function rejected(statement: string, params: unknown[], message: string) {
  await db.exec("savepoint rejected_write");
  try {
    await expect(db.query(statement, params)).rejects.toThrow(message);
  } finally {
    await db.exec(
      "rollback to savepoint rejected_write;release savepoint rejected_write",
    );
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
      phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
      raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(
    "update private.tc_settings set registration_open=true,enforce_access=true,sms_ready=false where id",
  );
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
  a = await company();
  b = await company();
  await db.query(
    `insert into public.drivers(id,organization_id,name,license,license_expires_on)
    values($1,$5,'Principal ficticio','CE','2028-01-01'),($2,$5,'Segundo ficticio','CE','2028-01-01'),
    ($3,$5,'Disponible ficticio','CE','2028-01-01'),($4,$6,'Persona de otra empresa','CE','2028-01-01')`,
    [ids.primary, ids.second, ids.other, ids.foreign, a.org, b.org],
  );
  await db.query(
    `insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on,driver_id)
    values($1,$4,'1111 TEST','MAN','Synthetic',2025,'2028-01-01',$6),
    ($2,$4,'2222 TEST','MAN','Synthetic',2025,'2028-01-01',null),
    ($3,$5,'3333 TEST','MAN','Synthetic',2025,'2028-01-01',null)`,
    [ids.truck, ids.otherTruck, ids.foreignTruck, a.org, b.org, ids.primary],
  );
  await actor(a);
});
afterEach(async () => {
  await db.exec("reset role;rollback");
});
afterAll(async () => {
  await db?.close();
});

describe("segundo conductor: SQL real con RLS y sesiones", () => {
  it("conserva principal, acepta null por defecto y guarda un segundo conductor con row_version", async () => {
    const before = (
      await db.query<{
        driver_id: string;
        co_driver_id: string | null;
        row_version: number;
      }>(
        "select driver_id,co_driver_id,row_version from public.trucks where id=$1",
        [ids.truck],
      )
    ).rows[0];
    expect(before.co_driver_id).toBeNull();
    const changed = (
      await db.query<{
        driver_id: string;
        co_driver_id: string;
        row_version: number;
      }>(
        "update public.trucks set co_driver_id=$1 where id=$2 and row_version=$3 returning driver_id,co_driver_id,row_version",
        [ids.second, ids.truck, before.row_version],
      )
    ).rows[0];
    expect(changed.driver_id).toBe(ids.primary);
    expect(changed.co_driver_id).toBe(ids.second);
    expect(Number(changed.row_version)).toBe(Number(before.row_version) + 1);
    expect(
      (
        await db.query(
          "update public.trucks set co_driver_id=null where id=$1 and row_version=$2 returning id",
          [ids.truck, before.row_version],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rechaza la misma persona en los dos puestos y conserva la fila", async () => {
    await rejected(
      "update public.trucks set co_driver_id=$1 where id=$2",
      [ids.primary, ids.truck],
      "deben ser distintos",
    );
    expect(
      (
        await db.query<{ co_driver_id: null }>(
          "select co_driver_id from public.trucks where id=$1",
          [ids.truck],
        )
      ).rows[0].co_driver_id,
    ).toBeNull();
  });
  it("rechaza un segundo conductor de otra empresa sin revelar sus datos", async () => {
    expect(
      (
        await db.query("select name from public.drivers where id=$1", [
          ids.foreign,
        ])
      ).rows,
    ).toHaveLength(0);
    await rejected(
      "update public.trucks set co_driver_id=$1 where id=$2",
      [ids.foreign, ids.truck],
      "debe pertenecer a esta empresa",
    );
  });
  it("un usuario de otra empresa no puede leer ni asignar el segundo conductor", async () => {
    await actor(b);
    expect(
      (await db.query("select * from public.trucks where id=$1", [ids.truck]))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update public.trucks set co_driver_id=$1 where id=$2 returning id",
          [ids.foreign, ids.truck],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("mantiene exclusividad al intentar usar como segundo un principal de otro camión", async () => {
    await rejected(
      "update public.trucks set co_driver_id=$1 where id=$2",
      [ids.primary, ids.otherTruck],
      "asignado a otro camión",
    );
  });
  it("mantiene exclusividad al intentar usar como principal un segundo de otro camión", async () => {
    await db.query("update public.trucks set co_driver_id=$1 where id=$2", [
      ids.second,
      ids.truck,
    ]);
    await rejected(
      "update public.trucks set driver_id=$1 where id=$2",
      [ids.second, ids.otherTruck],
      "asignado a otro camión",
    );
    await rejected(
      "update public.trucks set co_driver_id=$1 where id=$2",
      [ids.second, ids.otherTruck],
      "asignado a otro camión",
    );
  });
  it("un UPDATE antiguo de otros campos preserva ambos puestos", async () => {
    await db.query("update public.trucks set co_driver_id=$1 where id=$2", [
      ids.second,
      ids.truck,
    ]);
    await db.query(
      "update public.trucks set route='Ruta ficticia legacy' where id=$1",
      [ids.truck],
    );
    expect(
      (
        await db.query(
          "select driver_id,co_driver_id from public.trucks where id=$1",
          [ids.truck],
        )
      ).rows[0],
    ).toEqual({ driver_id: ids.primary, co_driver_id: ids.second });
  });
  it("permite intercambiar los dos puestos del mismo camión de forma atómica", async () => {
    await db.query("update public.trucks set co_driver_id=$1 where id=$2", [
      ids.second,
      ids.truck,
    ]);
    await db.query(
      "update public.trucks set driver_id=$1,co_driver_id=$2 where id=$3",
      [ids.second, ids.primary, ids.truck],
    );
    expect(
      (
        await db.query(
          "select driver_id,co_driver_id from public.trucks where id=$1",
          [ids.truck],
        )
      ).rows[0],
    ).toEqual({ driver_id: ids.second, co_driver_id: ids.primary });
  });
  it("bloquea permiso/borrado del segundo asignado y permite desasignación explícita", async () => {
    await db.query("update public.trucks set co_driver_id=$1 where id=$2", [
      ids.second,
      ids.truck,
    ]);
    await rejected(
      "update public.drivers set status='leave' where id=$1",
      [ids.second],
      "Desasigna",
    );
    await rejected(
      "delete from public.drivers where id=$1",
      [ids.second],
      "trucks_co_driver_organization_fk",
    );
    await db.query("update public.trucks set co_driver_id=null where id=$1", [
      ids.truck,
    ]);
    await db.query("update public.drivers set status='leave' where id=$1", [
      ids.second,
    ]);
    await rejected(
      "update public.trucks set co_driver_id=$1 where id=$2",
      [ids.second, ids.truck],
      "Desasigna",
    );
  });
  it("un rol de consulta no puede cambiar la asignación", async () => {
    await db.exec("reset role");
    await db.query(
      "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'viewer','active',$3)",
      [a.org, b.user, a.user],
    );
    await actor(b);
    expect(
      (await db.query("select id from public.trucks where id=$1", [ids.truck]))
        .rows,
    ).toHaveLength(1);
    await db.exec("savepoint viewer_write");
    try {
      const result = await db.query(
        "update public.trucks set co_driver_id=$1 where id=$2 returning id",
        [ids.second, ids.truck],
      );
      expect(result.rows).toHaveLength(0);
    } catch (error) {
      expect(String(error)).toMatch(/policy|permission|permiso/i);
    } finally {
      await db.exec(
        "rollback to savepoint viewer_write;release savepoint viewer_write",
      );
    }
  });
  it("una sesión revocada tampoco puede escribir el nuevo campo", async () => {
    await db.exec("reset role");
    await db.query("delete from auth.sessions where id=$1", [a.sid]);
    await actor(a);
    expect(
      (
        await db.query("select co_driver_id from public.trucks where id=$1", [
          ids.truck,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update public.trucks set co_driver_id=$1 where id=$2 returning id",
          [ids.second, ids.truck],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("no concede a anónimos acceso nuevo al esquema ni funciones de trigger", async () => {
    await db.exec("set local role anon");
    await rejected(
      "select co_driver_id from public.trucks",
      [],
      "permission denied",
    );
    await db.exec("reset role");
    const result = await db.query<{ rls: boolean; executable: boolean }>(`select
      (select relrowsecurity from pg_class where oid='public.trucks'::regclass) as rls,
      has_function_privilege('anon','private.tc_check_truck_driver_team()','EXECUTE') as executable`);
    expect(result.rows[0]).toEqual({ rls: true, executable: false });
  });
});
