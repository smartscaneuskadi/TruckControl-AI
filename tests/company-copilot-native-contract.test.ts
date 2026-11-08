import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
it("el ensayo nativo de tareas pasa íntegro con rollback y conserva datos anteriores", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');
      create table auth.sessions(id uuid primary key,user_id uuid);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);
      insert into supabase_migrations.schema_migrations select s::text from generate_series(1,59) s;`);
    for (const name of readdirSync("supabase/migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
    await db.exec(
      "update private.tc_settings set enforce_access=true,sms_ready=false,prices_are_examples=true;update private.tc_modules set enabled=true;update private.tc_provider_settings set ai_enabled=true,ai_monthly_budget_cents=1000",
    );
    const results = await db.exec(
      readFileSync("docs/verification/company-copilot-session-acceptance-20261108.sql", "utf8"),
    );
    expect(results.at(-1)?.rows[0]).toMatchObject({
      migrations: 59,
      fixture_users_remaining: 0,
      fixture_companies_remaining: 0,
      copilot_turns: 0,
      copilot_actions: 0,
      payments_enabled: false,
      prices_are_examples: true,
    });
  } finally {
    await db.close();
  }
}, 30000);
