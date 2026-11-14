import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  financialDatabase,
  financialPayment,
  incidentOriginalSnapshot,
  withDbRole,
  incidentAccount,
  incidentAdmin,
  incidentAdminSid,
  type Json,
} from "./helpers/subscription-financial-db";
import { riskObservation } from "./helpers/stripe-risk-fixtures";

let db: PGlite;
beforeAll(async () => {
  db = await financialDatabase();
}, 120000);
afterAll(async () => {
  await db?.close();
});
const record = async (
  data: unknown,
  account = incidentAccount,
  mode = "test",
) =>
  withDbRole(
    db,
    "service_role",
    async () =>
      (
        await db.query<{ result: Json }>(
          "select public.tc_subscription_risk_record($1,$2,$3::jsonb) result",
          [account, mode, JSON.stringify(data)],
        )
      ).rows[0].result,
  );
async function admin(
  action: string,
  id: string | null = null,
  expected: number | null = null,
  operation: string | null = null,
  data: Json = {},
  user = incidentAdmin,
  sid: string | null = incidentAdminSid,
  after: string | null = null,
) {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [
      user,
      JSON.stringify({
        sub: user,
        ...(sid ? { session_id: sid } : {}),
        user_metadata: { is_admin: true },
      }),
    ],
  );
  return withDbRole(
    db,
    "authenticated",
    async () =>
      (
        await db.query<{ result: Json }>(
          "select public.tc_admin_subscription_risk($1,$2::uuid,$3::bigint,$4::uuid,$5::jsonb,$6::uuid) result",
          [action, id, expected, operation, JSON.stringify(data), after],
        )
      ).rows[0].result,
  );
}
const detail = async (id: string) =>
  (await admin("detail", id)).items as Json[];
describe("early fraud signal append-only SQL in isolated migrated PGlite", () => {
  it("advertises informational-only controls and no economic or access actions", async () => {
    expect(await admin("capabilities")).toEqual({
      contract: "subscription-risk-v1",
      available: true,
      informational_only: true,
      refunds_available: false,
      license_changes_available: false,
      fiscal_emission_available: false,
    });
  });
  it.each([false, true])(
    "binds an actual paid task (monthly=%s) without changing money, licences, tasks or notices",
    async (monthly) => {
      const p = await financialPayment(db, monthly),
        before = await incidentOriginalSnapshot(db, p);
      const result = await record(riskObservation(p));
      expect(result).toMatchObject({
        contract: "subscription-risk-record-v1",
        received: true,
        duplicate: false,
      });
      expect((await detail(String(result.case_id)))[0]).toMatchObject({
        task_id: p.task,
        buyer_company_id: p.company,
        amount_cents: 36300,
        currency: "EUR",
        invoice_id: p.invoice,
        row_version: 2,
        review_state: "pending",
      });
      expect(await incidentOriginalSnapshot(db, p)).toEqual(before);
    },
  );
  it("denies both customer tenants and forged role metadata for all admin actions", async () => {
    const p = await financialPayment(db),
      q = await financialPayment(db),
      id = String((await record(riskObservation(p))).case_id);
    for (const user of [p.user, q.user]) {
      const sid = randomUUID();
      await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
        sid,
        user,
      ]);
      for (const action of [
        "capabilities",
        "list",
        "detail",
        "history",
        "review",
      ])
        await expect(
          admin(
            action,
            id,
            2,
            randomUUID(),
            { note: "Unauthorised review" },
            user,
            sid,
          ),
        ).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("uses a live Root SID for reads, writes and duplicate replays", async () => {
    const p = await financialPayment(db),
      id = String((await record(riskObservation(p))).case_id),
      op = randomUUID();
    await admin("review", id, 2, op, { note: "Synthetic review" });
    for (const sid of [null, randomUUID()])
      for (const action of [
        "capabilities",
        "list",
        "detail",
        "history",
        "review",
      ])
        await expect(
          admin(
            action,
            id,
            2,
            op,
            { note: "Synthetic review" },
            incidentAdmin,
            sid,
          ),
        ).rejects.toMatchObject({ code: "42501" });
  });
  it("restricts service-role to the guarded recorder, with direct tables and admin RPC denied", async () => {
    const p = await financialPayment(db),
      observation = riskObservation(p);
    for (const role of ["anon", "authenticated", "service_role"])
      await expect(
        withDbRole(db, role, () =>
          db.query("select * from private.tc_subscription_risk_entries"),
        ),
      ).rejects.toThrow();
    for (const role of ["anon", "authenticated"])
      await expect(
        withDbRole(db, role, () =>
          db.query(
            "select public.tc_subscription_risk_record($1,'test',$2::jsonb)",
            [incidentAccount, JSON.stringify(observation)],
          ),
        ),
      ).rejects.toThrow();
    await expect(
      withDbRole(db, "service_role", () =>
        db.query("select public.tc_admin_subscription_risk('capabilities')"),
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "select private.tc_subscription_risk_record($1,'test',$2::jsonb)",
        [incidentAccount, JSON.stringify(observation)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it.each([
    "account",
    "mode",
    "missing_payment",
    "foreign_invoice",
    "customer",
    "period",
    "amount",
    "tenant_input",
  ])("rejects %s mapping atomically", async (mismatch) => {
    const p = await financialPayment(db, true),
      q = await financialPayment(db, true),
      observation = riskObservation(p),
      before = await incidentOriginalSnapshot(db, p);
    if (mismatch === "missing_payment") observation.invoice_id = "in_Unmapped";
    if (mismatch === "foreign_invoice") observation.invoice_id = q.invoice;
    if (mismatch === "customer") observation.customer_id = q.customer;
    if (mismatch === "period") observation.invoice_period_start!++;
    if (mismatch === "amount") observation.charge_amount_cents = 1;
    if (mismatch === "tenant_input")
      Object.assign(observation, { company_id: q.company });
    await expect(
      record(
        observation,
        mismatch === "account" ? "acct_Foreign" : incidentAccount,
        mismatch === "mode" ? "live" : "test",
      ),
    ).rejects.toThrow();
    expect(await incidentOriginalSnapshot(db, p)).toEqual(before);
    expect(
      (
        await db.query(
          "select id from private.tc_subscription_risk_entries where task_id=$1",
          [p.task],
        )
      ).rows,
    ).toEqual([]);
  });
  it("deduplicates immutable events while ignoring later mutable actionable GET state", async () => {
    const p = await financialPayment(db),
      observation = riskObservation(p),
      first = await record(observation);
    expect(
      await record({ ...observation, actionable_now: false }),
    ).toMatchObject({ duplicate: true, case_id: first.case_id });
    expect((await admin("history", String(first.case_id))).items).toHaveLength(
      1,
    );
  });
  it("rejects conflicting event replay across firms or changed immutable warning fields", async () => {
    const p = await financialPayment(db),
      q = await financialPayment(db),
      observation = riskObservation(p);
    await record(observation);
    await expect(
      record(riskObservation(q, { event_id: observation.event_id })),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      record({ ...observation, actionable_at_event: false }),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("appends provider updates and review declarations using CAS, never overwriting an older review", async () => {
    const p = await financialPayment(db),
      observation = riskObservation(p),
      id = String((await record(observation)).case_id),
      op = randomUUID();
    const response = await admin("review", id, 2, op, {
      note: "Reviewed in isolated fixture",
    });
    expect(response).toMatchObject({
      replayed: false,
      case: { review_state: "reviewed", row_version: 3 },
    });
    expect(
      await admin("review", id, 2, op, {
        note: "Reviewed in isolated fixture",
      }),
    ).toMatchObject({ replayed: true });
    await expect(
      admin("review", id, 2, randomUUID(), { note: "Stale version" }),
    ).rejects.toMatchObject({ code: "40001" });
    await expect(
      admin("review", id, 2, op, { note: "Changed replay" }),
    ).rejects.toMatchObject({ code: "23514" });
    await record({
      ...observation,
      event_id: observation.event_id + "Next",
      event_type: "radar.early_fraud_warning.updated",
      actionable_at_event: false,
      actionable_now: false,
    });
    expect((await detail(id))[0]).toMatchObject({
      review_state: "pending",
      row_version: 4,
      last_review: { row_version: 3 },
    });
    expect(
      ((await admin("history", id)).items as Json[]).map((x) => x.row_version),
    ).toEqual([4, 3, 2]);
  });
  it.each(["update", "delete", "truncate"])(
    "prevents %s of audit data even for owner",
    async (operation) => {
      const statement =
        operation === "update"
          ? "update private.tc_subscription_risk_entries set data='{}'"
          : operation === "delete"
            ? "delete from private.tc_subscription_risk_entries"
            : "truncate private.tc_subscription_risk_entries";
      await expect(db.exec(statement)).rejects.toThrow();
    },
  );
  it("enforces restrictive RLS and empty-search-path definer wrappers", async () => {
    expect(
      (
        await db.query<{ relrowsecurity: boolean }>(
          "select relrowsecurity from pg_class where oid='private.tc_subscription_risk_entries'::regclass",
        )
      ).rows[0].relrowsecurity,
    ).toBe(true);
    const result = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
      "select prosecdef,proconfig from pg_proc where oid='public.tc_admin_subscription_risk(text,uuid,bigint,uuid,jsonb,uuid)'::regprocedure",
    );
    expect(result.rows[0]).toMatchObject({ prosecdef: false });
    expect(result.rows[0].proconfig).toContain('search_path=""');
  });
  it("rolls back the candidate in an isolated transaction without touching original fiscal state", async () => {
    const p = await financialPayment(db),
      before = await incidentOriginalSnapshot(db, p),
      observation = riskObservation(p);
    await db.exec("begin");
    await record(observation);
    await db.exec("rollback");
    expect(
      (
        await db.query(
          "select id from private.tc_subscription_risk_entries where task_id=$1",
          [p.task],
        )
      ).rows,
    ).toEqual([]);
    expect(await incidentOriginalSnapshot(db, p)).toEqual(before);
  });
});
