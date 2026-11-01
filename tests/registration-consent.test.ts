import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const user = "e4000000-0000-4000-8000-000000000001",
  other = "e4000000-0000-4000-8000-000000000002",
  attempt = "e4000000-0000-4000-8000-000000000003",
  version = "2026-11-01";
const profile = {
  truckcontrol_registration: {
    contact_name: "Persona ficticia",
    company_name: "Empresa ficticia",
    tax_id: "DEMO-01",
    address: "Calle ficticia 1",
    phone: "+34600000001",
    requested_plan: "full",
  },
  truckcontrol_legal: { version, accepted: true },
};
async function as<T>(role: string, fn: () => Promise<T>) {
  await db.exec("set role " + role);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function seed(id = user, verified = false) {
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4::jsonb)",
    [
      id,
      (id === user ? "first" : "second") + "@company.invalid",
      verified ? new Date().toISOString() : null,
      JSON.stringify(profile),
    ],
  );
}
async function receipt() {
  await db.query(
    "insert into private.tc_auth_mail_attempts(id,email_hash,ip_hash,action,legal_version) values($1,encode(extensions.hmac('auth-email-v1:first@company.invalid','unused','sha256'),'hex'),repeat('b',64),'signup',$2)",
    [attempt, version],
  );
}
async function consent(
  id = user,
  request: string | null = attempt,
  authenticated = false,
  legal = version,
) {
  return as("service_role", async () => {
    const r = await db.query<{ accepted: boolean }>(
      "select public.company_auth_mail_consent($1,$2,$3,$4) accepted",
      [id, request, legal, authenticated],
    );
    return r.rows[0].accepted;
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(
    `create schema if not exists extensions;create schema vault;create table vault.secrets(name text,secret text);insert into vault.secrets values('truckcontrol_auth_mail_signing_key','fictitious-secret');create view vault.decrypted_secrets as select name,secret decrypted_secret from vault.secrets;create function extensions.hmac(value text,key text,algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value),'hex')$$;`,
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "reset role;truncate auth.users cascade;truncate private.tc_auth_mail_attempts cascade;update private.tc_settings set registration_open=true,sms_ready=false,enforce_access=true;update private.tc_auth_mail_settings set enabled=true,legal_ready=true,legal_version='2026-11-01';",
  );
});
afterAll(async () => {
  await db.close();
});
describe("consentimiento inmutable antes de crear empresas", () => {
  it("los metadatos editables por el usuario no sustituyen el recibo", async () => {
    await seed(user, true);
    expect(
      (await db.query("select * from private.tc_customers")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.organizations")).rows,
    ).toHaveLength(0);
  });
  it("acepta el recibo ligado al correo y activa diez días tras confirmación", async () => {
    await seed();
    await receipt();
    expect(await consent()).toBe(true);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [user],
    );
    const r = await db.query<{ days: number }>(
      "select extract(epoch from(trial_ends_at-trial_started_at))/86400 days from private.tc_customers",
    );
    expect(Number(r.rows[0].days)).toBe(10);
    expect(
      (await db.query("select * from public.organizations")).rows,
    ).toHaveLength(1);
  });
  it("no atribuye un recibo de un correo a otra cuenta", async () => {
    await seed();
    await seed(other);
    await receipt();
    expect(await consent(other)).toBe(false);
  });
  it("no acepta una versión anterior ni un aviso legal sin preparar", async () => {
    await seed();
    await receipt();
    expect(await consent(user, attempt, false, "old")).toBe(false);
    await db.exec("update private.tc_auth_mail_settings set legal_ready=false");
    expect(await consent()).toBe(false);
  });
  it("la finalización autenticada exige una cuenta verificada", async () => {
    await seed();
    expect(await consent(user, null, true)).toBe(false);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [user],
    );
    expect(await consent(user, null, true)).toBe(true);
    await db.query("select private.tc_provision($1)", [user]);
    expect(
      (await db.query("select * from private.tc_customers")).rows,
    ).toHaveLength(1);
  });
  it.each(["anon", "authenticated"])(
    "%s no puede insertar ni aceptar recibos",
    async (role) => {
      await seed();
      await receipt();
      await as(role, async () => {
        await expect(
          db.query("select * from private.tc_auth_legal_consents"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("select public.company_auth_mail_consent($1,$2,$3,false)", [
            user,
            attempt,
            version,
          ]),
        ).rejects.toThrow(/permission denied/);
      });
    },
  );
  it("repetir el consentimiento no cambia fecha ni prolonga la prueba", async () => {
    await seed();
    await receipt();
    expect(await consent()).toBe(true);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [user],
    );
    const first = await db.query(
      "select accepted_at from private.tc_auth_legal_consents",
    );
    expect(await consent(user, null, true)).toBe(true);
    expect(
      (await db.query("select accepted_at from private.tc_auth_legal_consents"))
        .rows,
    ).toEqual(first.rows);
    await db.query("select private.tc_provision($1)", [user]);
    expect(
      (await db.query("select * from public.organizations")).rows,
    ).toHaveLength(1);
  });
});
