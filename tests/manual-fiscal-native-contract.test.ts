import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

// Exercise the exact reviewed native SQL artifact against all migrations.
// Fixtures and DDL below belong only to this ephemeral PGlite instance.
it("ensaya el contrato fiscal nativo exacto y revierte usuarios, roles, pagos y ledger", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(
        id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
        phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
        raw_user_meta_data jsonb not null default '{}'
      );
      create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));
      create function auth.uid() returns uuid language sql stable as $uid$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $uid$;
      create function auth.jwt() returns jsonb language sql stable as $jwt$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
      $jwt$;
      grant usage on schema auth,public to anon,authenticated,service_role;
    `);
    for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    }
    // Test-only local settings; the native contract never changes global flags.
    await db.exec(
      "update private.tc_settings set registration_open=true,enforce_access=true,payments_enabled=false,sms_ready=false",
    );
    const result = await db.exec(
      readFileSync("docs/verification/manual-fiscal-rollback.sql", "utf8"),
    );
    const rows = result.flatMap((entry) => entry.rows) as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.contract === "manual-fiscal-rollback-v1")).toMatchObject({
      result: "passed",
      synthetic_companies: 2,
      provider_calls: 0,
      real_emails_sent: 0,
      stripe_settlement_proven: false,
      ticketbai_issuance_proven: false,
      document_delivery_proven: false,
      concurrency_scope: "stale_writer_cas_only",
    });
    expect(rows.find((row) => row.contract === "manual-fiscal-rollback-cleanup-v1")).toEqual({
      contract: "manual-fiscal-rollback-cleanup-v1",
      fixture_users_remaining: 0,
      fixture_sessions_remaining: 0,
      fixture_admins_remaining: 0,
      fixture_requests_remaining: 0,
      fixture_tasks_remaining: 0,
      fixture_events_remaining: 0,
      fixture_actions_remaining: 0,
      fixture_subscriptions_remaining: 0,
      fixture_invoices_remaining: 0,
    });
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_invoice_tasks")).rows)
      .toEqual([{ n: 0 }]);
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_invoice_actions")).rows)
      .toEqual([{ n: 0 }]);
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_invoice_documents")).rows)
      .toEqual([{ n: 0 }]);
    expect((await db.query("select payments_enabled from private.tc_settings where id")).rows)
      .toEqual([{ payments_enabled: false }]);
  } finally {
    await db.close();
  }
}, 120000);
