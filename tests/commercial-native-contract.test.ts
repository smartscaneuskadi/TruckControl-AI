import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
it("ensaya el contrato nativo comercial completo y revierte todos los datos sintéticos", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated,service_role;",
    );
    for (const f of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
    await db.exec(
      "update private.tc_settings set registration_open=true,enforce_access=true,payments_enabled=false,sms_ready=false;",
    );
    const result = await db.exec(
      readFileSync("docs/verification/commercial-records-session-rollback-20261108.sql", "utf8"),
    );
    expect(
      result.some((r) =>
        r.rows.some((v) => (v as { result?: string }).result === "passed"),
      ),
    ).toBe(true);
    expect(
      (
        await db.query(
          "select count(*)::int n from auth.users where id::text like 'fcf10000-%'",
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (await db.query("select count(*)::int n from private.company_suppliers"))
        .rows,
    ).toEqual([{ n: 0 }]);
  } finally {
    await db.close();
  }
}, 30000);
