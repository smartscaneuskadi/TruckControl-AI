import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const admin = "fbe10000-0000-4000-8000-000000000001";
const viewer = "fbe10000-0000-4000-8000-000000000002";
const adminSession = "fbe20000-0000-4000-8000-000000000001";
const viewerSession = "fbe20000-0000-4000-8000-000000000002";
let db: PGlite;
let routineBefore: Array<{ name: string; oid: string; acl: string | null }>;
async function attempt<T>(body: () => Promise<T>): Promise<T> {
  await db.exec("savepoint admin_freshness_attempt");
  try {
    const result = await body();
    await db.exec("release savepoint admin_freshness_attempt");
    return result;
  } catch (error) {
    await db.exec("rollback to savepoint admin_freshness_attempt; release savepoint admin_freshness_attempt");
    throw error;
  }
}
async function actorQuery<T>(
  query: string, params: unknown[] = [],
  actor: string = admin, sid: string | null = adminSession,
) {
  return attempt(async () => {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [actor, JSON.stringify({ sub: actor, role: "authenticated",
        ...(sid ? { session_id: sid } : {}),
        user_metadata: { role: "admin", is_admin: true },
        app_metadata: { role: "admin" },
      })],
    );
    await db.exec("set local role authenticated");
    const result = await db.query<T>(query, params);
    await db.exec("reset role");
    return result.rows;
  });
}
async function isAdmin(actor = admin, sid: string | null = adminSession) {
  return (await actorQuery<{ allowed: boolean }>("select private.tc_is_admin() allowed", [], actor, sid))[0].allowed;
}
async function control(action: string, data: Record<string, unknown> = {}) {
  return (await actorQuery<{ result: Record<string, unknown> }>(
    "select public.tc_admin_control($1,$2::jsonb) result", [action, JSON.stringify(data)],
  ))[0].result;
}
async function state() {
  return (await db.query<{ state: unknown }>(
    "select jsonb_build_object('modules',(select jsonb_agg(to_jsonb(m) order by id) from private.tc_modules m)," +
    "'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from private.tc_admin_audit a)) state",
  )).rows[0].state;
}
const routineMetadata = () => db.query<{ name: string; oid: string; acl: string | null }>(
  "select p.proname as name,p.oid::text,p.proacl::text as acl from pg_proc p " +
  "where p.oid in ('private.tc_is_admin()'::regprocedure,'private.tc_admin_control(text,jsonb)'::regprocedure) order by p.proname",
);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon nologin; create role authenticated nologin; create schema auth;" +
    "create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz," +
    "phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz," +
    "raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}');" +
    "create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);" +
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;" +
    "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;" +
    "grant usage on schema public,auth to anon,authenticated;",
  );
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    // Capture the original routines immediately before the first verifier
    // installation, even when it is already part of the real migration chain.
    const legacy = (await db.query<{ present: boolean }>(
      "select to_regprocedure('private.tc_actor_verified(uuid,boolean)') is null " +
      "and to_regprocedure('private.tc_is_admin()') is not null " +
      "and to_regprocedure('private.tc_admin_control(text,jsonb)') is not null present",
    )).rows[0].present;
    if (legacy) routineBefore = (await routineMetadata()).rows;
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  if (!routineBefore) throw Error("missing original admin routine metadata");
  // Standalone proposal branch has only schema62. After composite63 lands,
  // exercise the real migrated routines instead of patching over a regression.
  const installed = (await db.query<{ present: boolean }>(
    "select to_regprocedure('private.tc_actor_verified(uuid,boolean)') is not null present",
  )).rows[0].present;
  if (!installed) await db.exec(readFileSync("docs/verification/admin-session-freshness.proposal.sql", "utf8"));
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin-freshness@example.invalid',now()),($2,'viewer-freshness@example.invalid',now())",
    [admin, viewer],
  );
  await db.query("insert into private.tc_admins(user_id) values($1) on conflict do nothing", [admin]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)", [adminSession, admin, viewerSession, viewer]);
}, 60000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("reset role; rollback"); });
afterAll(async () => { await db?.close(); });

describe("administración global: identidad y sesión frescas en controlador y predicado RLS", () => {
  it("conserva los OID y permisos de ambas funciones sin renombrar ni crear una ruta antigua", async () => {
    expect((await routineMetadata()).rows).toEqual(routineBefore);
  });
  it("el predicado permanece STABLE y funciona dentro de una transacción de sólo lectura", async () => {
    await db.exec("set transaction read only");
    expect(await isAdmin()).toBe(true);
    const meta = await db.query<{ volatility: string; source: string }>(
      "select provolatile::text as volatility,prosrc as source from pg_proc where oid='private.tc_is_admin()'::regprocedure",
    );
    expect(meta.rows[0].volatility).toBe("s");
    expect(meta.rows[0].source).not.toMatch(/for\s+(?:update|share)/i);
  });
  it("una sesión administrativa válida conserva el snapshot global autorizado", async () => {
    expect(await isAdmin()).toBe(true);
    const snapshot = await control("snapshot");
    expect(snapshot).toHaveProperty("settings");
    expect(snapshot).toHaveProperty("plans");
    expect(snapshot).toHaveProperty("modules");
    expect(snapshot).toHaveProperty("customers");
  });
  it("una escritura válida conserva la modificación de módulo y la auditoría original", async () => {
    const previous = (await db.query<{ enabled: boolean }>("select enabled from private.tc_modules where id='dashboard'")).rows[0].enabled;
    await control("module", { id: "dashboard", enabled: !previous });
    expect((await db.query("select enabled from private.tc_modules where id='dashboard'")).rows)
      .toEqual([{ enabled: !previous }]);
    expect((await db.query("select actor_id,action,target_id from private.tc_admin_audit")).rows)
      .toMatchObject([{ actor_id: admin, action: "module", target_id: "dashboard" }]);
  });
  it("un JWT cuya sesión ya no existe no lee ni modifica administración aunque mantenga tc_admins", async () => {
    await db.query("delete from auth.sessions where id=$1", [adminSession]);
    const before = await state();
    expect(await isAdmin()).toBe(false);
    await expect(control("snapshot")).rejects.toThrow();
    await expect(control("module", { id: "dashboard", enabled: false })).rejects.toThrow();
    expect(await state()).toEqual(before);
    expect((await db.query("select user_id from private.tc_admins where user_id=$1", [admin])).rows).toHaveLength(1);
  });
  it("cerrar todas las sesiones bloquea también configuración de servicios y el acceso fiscal global", async () => {
    await db.query("delete from auth.sessions where user_id=$1", [admin]);
    await expect(actorQuery("select public.tc_provider_control('status','{}')")).rejects.toThrow();
    const fiscal = await actorQuery<{ allowed: boolean }>("select private.tc_fiscal_global_admin() allowed");
    expect(fiscal[0].allowed).toBe(false);
  });
  it("la pertenencia admin no valida un session_id de otra identidad", async () => {
    expect(await isAdmin(admin, viewerSession)).toBe(false);
    await expect(actorQuery("select public.tc_admin_control('snapshot','{}')", [], admin, viewerSession)).rejects.toThrow();
  });
  it("bloquear al administrador deniega lectura, escritura y el predicado RLS sin retirar su rol", async () => {
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [admin]);
    const before = await state();
    expect(await isAdmin()).toBe(false);
    await expect(control("snapshot")).rejects.toThrow();
    await expect(control("settings", { registration_open: false })).rejects.toThrow();
    expect(await state()).toEqual(before);
  });
  it("un usuario marcado como eliminado tampoco conserva facultades administrativas", async () => {
    await db.query("update auth.users set deleted_at=now() where id=$1", [admin]);
    expect(await isAdmin()).toBe(false);
    await expect(control("snapshot")).rejects.toThrow();
  });
  it("un correo ya no confirmado no autoriza administración aunque queden rol y sesión", async () => {
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [admin]);
    expect(await isAdmin()).toBe(false);
    await expect(control("snapshot")).rejects.toThrow();
  });
  it("retirar la fila administrativa es efectivo inmediatamente sin esperar renovación del JWT", async () => {
    await db.query("delete from private.tc_admins where user_id=$1", [admin]);
    expect(await isAdmin()).toBe(false);
    await expect(control("snapshot")).rejects.toThrow();
  });
  it("claims de usuario o aplicación no convierten a otro usuario confirmado en administrador", async () => {
    expect(await isAdmin(viewer, viewerSession)).toBe(false);
    await expect(actorQuery("select public.tc_admin_control('snapshot','{}')", [], viewer, viewerSession)).rejects.toThrow();
  });
  it("el rechazo de una sesión revocada conserva planes y precios sin efectos parciales", async () => {
    const plans = (await db.query("select to_jsonb(p) plan from private.tc_plans p order by id")).rows;
    await db.query("delete from auth.sessions where id=$1", [adminSession]);
    await expect(control("plan", {
      id: "limited", name: "NO DEBE GUARDARSE", monthly_cents: 100,
      max_trucks: 50, published: true, modules: {},
    })).rejects.toThrow();
    expect((await db.query("select to_jsonb(p) plan from private.tc_plans p order by id")).rows).toEqual(plans);
  });
  it("un contexto sin SID no equivale a una sesión administrativa válida", async () => {
    expect(await isAdmin(admin, null)).toBe(false);
    await expect(actorQuery("select public.tc_admin_control('snapshot','{}')", [], admin, null)).rejects.toThrow();
  });
  it("la verificación de usuario de background no exige sesión humana pero conserva los bloqueos Auth", async () => {
    await db.exec("delete from auth.sessions");
    expect((await db.query("select private.tc_actor_verified($1,false) allowed", [admin])).rows).toEqual([{ allowed: true }]);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [admin]);
    expect((await db.query("select private.tc_actor_verified($1,false) allowed", [admin])).rows).toEqual([{ allowed: false }]);
    await db.query("update auth.users set banned_until=null,deleted_at=now() where id=$1", [admin]);
    expect((await db.query("select private.tc_actor_verified($1,false) allowed", [admin])).rows).toEqual([{ allowed: false }]);
    await db.query("update auth.users set deleted_at=null,email_confirmed_at=null where id=$1", [admin]);
    expect((await db.query("select private.tc_actor_verified($1,false) allowed", [admin])).rows).toEqual([{ allowed: false }]);
  });
  it("el helper compartido no crea un endpoint privado invocable por clientes", async () => {
    await expect(actorQuery("select private.tc_actor_verified($1,false)", [viewer])).rejects.toThrow();
  });

  it("el RPC de sesión verifica tanto administrador como usuario confirmado aún sin perfil empresarial", async () => {
    expect((await actorQuery<{ valid: boolean }>("select public.tc_verified_session() valid"))[0].valid).toBe(true);
    expect((await actorQuery<{ valid: boolean }>("select public.tc_verified_session() valid", [], viewer, viewerSession))[0].valid).toBe(true);
    expect((await db.query("select count(*)::int n from private.tc_customers where user_id=$1", [viewer])).rows).toEqual([{ n: 0 }]);
  });
  it("el RPC de sesión devuelve false al revocarse el SID y no acepta anon", async () => {
    await db.query("delete from auth.sessions where id=$1", [adminSession]);
    expect((await actorQuery<{ valid: boolean }>("select public.tc_verified_session() valid"))[0].valid).toBe(false);
    await attempt(async () => {
      await db.exec("set local role anon");
      await expect(attempt(() => db.query("select public.tc_verified_session()"))).rejects.toThrow();
      await db.exec("reset role");
    });
  });
  it("un SID expirado por Auth.not_after tampoco autoriza RPC, RLS o administración", async () => {
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [adminSession]);
    expect(await isAdmin()).toBe(false);
    expect((await actorQuery<{ valid: boolean }>("select public.tc_verified_session() valid"))[0].valid).toBe(false);
    await expect(control("snapshot")).rejects.toThrow();
    // Background checks concern the live user, not a human session lifetime.
    expect((await db.query("select private.tc_actor_verified($1,false) allowed", [admin])).rows).toEqual([{ allowed: true }]);
  });
  it("un session_id malformado se deniega como booleano sin barrer sesiones ajenas", async () => {
    expect(await isAdmin(admin, "not-a-valid-session-uuid")).toBe(false);
  });

});
