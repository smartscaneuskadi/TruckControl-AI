import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

// New schema63 contract only. The historical schema62 receipt and its fixtures
// are not patched or re-executed by this test. No provider, model or Storage
// transport is exercised: the SQL artifact is explicit about those boundaries.
it("verifica sesiones reales, aislamiento, CAS y pipeline fiscal cerrado con rollback íntegro", async () => {
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
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}'
      );
      create table auth.sessions(
        id uuid primary key,user_id uuid not null references auth.users(id),
        not_after timestamptz
      );
      create function auth.uid() returns uuid language sql stable as $uid$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $uid$;
      create function auth.jwt() returns jsonb language sql stable as $jwt$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
      $jwt$;
      grant usage on schema auth,public to anon,authenticated,service_role;
    `);
    let originalOperator: Array<Record<string, unknown>> | undefined;
    const operatorMetadata = () => db.query<Record<string, unknown>>(
      "select oid::text,proacl::text,provolatile::text,prosecdef,proconfig from pg_proc " +
      "where oid=to_regprocedure('private.tc_manual_subscription_operator()')",
    );
    for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
      const original = (await db.query<{ present: boolean }>(
        "select to_regprocedure('private.tc_manual_subscription_operator()') is not null " +
        "and to_regprocedure('private.tc_actor_verified(uuid,boolean)') is null present",
      )).rows[0].present;
      if (original) originalOperator = (await operatorMetadata()).rows;
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    }
    expect(originalOperator).toHaveLength(1);
    expect((await operatorMetadata()).rows).toEqual(originalOperator);
    // Ephemeral database preconditions only. The reviewed native SQL changes no
    // flags and refuses to execute against an unexpectedly enabled deployment.
    await db.exec(
      "update private.tc_settings set registration_open=true,enforce_access=true,payments_enabled=false,sms_ready=false",
    );
    const applied62 = readFileSync("supabase/migrations/20261108013000_manual_subscription_invoice_intake.sql");
    expect(createHash("sha1").update("blob " + applied62.byteLength + "\0").update(applied62).digest("hex"))
      .toBe("7504aca678710771ce550430cab5ab2b5f76068a");
    const results = await db.exec(readFileSync(
      "docs/verification/session-fiscal-pipeline-rollback-20261108.sql", "utf8",
    ));
    const rows = results.flatMap((r) => r.rows) as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.contract === "session-fiscal-pipeline-rollback-v1")).toEqual({
      contract: "session-fiscal-pipeline-rollback-v1", result: "passed",
      synthetic_companies: 2, synthetic_auth_sessions: 4,
      provider_calls: 0, real_emails_sent: 0, model_calls: 0,
      stripe_settlement_proven: false, ticketbai_issuance_proven: false,
      document_transport_proven: false, real_email_delivery_proven: false,
      concurrency_scope: "stale_writer_cas_only",
    });
    const cleanup = rows.find((r) => r.contract === "session-fiscal-pipeline-cleanup-v1");
    expect(cleanup).toEqual({
      contract: "session-fiscal-pipeline-cleanup-v1",
      fixture_users_remaining: 0, fixture_sessions_remaining: 0,
      fixture_admins_remaining: 0, fixture_requests_remaining: 0,
      fixture_tasks_remaining: 0, fixture_events_remaining: 0,
      fixture_actions_remaining: 0, fixture_channels_remaining: 0,
      fixture_bridge_receipts_remaining: 0, fixture_notices_remaining: 0,
    });
    expect((await db.query(
      "select payments_enabled from private.tc_settings where id",
    )).rows).toEqual([{ payments_enabled: false }]);
    expect((await db.query(
      "select uploads_enabled,downloads_enabled from private.tc_manual_subscription_document_runtime where id",
    )).rows).toEqual([{ uploads_enabled: false, downloads_enabled: false }]);
    expect((await db.query(
      "select enabled from private.tc_manual_invoice_notice_settings where id",
    )).rows).toEqual([{ enabled: false }]);
  } finally {
    await db.close();
  }
}, 120000);
