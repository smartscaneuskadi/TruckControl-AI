import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { reconcileStripeFinancialIncident } from "../supabase/functions/_shared/subscription-financial-incidents";
import { subscriptionIncidentSchema } from "../src/domain/subscription-incidents";
import {
  financialConfig,
  financialFixture,
  type FinancialObject,
} from "./helpers/stripe-financial-fixtures";
import {
  financialDatabase,
  financialPayment,
  incidentAccount,
  incidentAdminCall,
  incidentObservation,
  incidentOriginalSnapshot,
  recordObservation,
  type PaidFixture,
} from "./helpers/subscription-financial-db";

const migrationPath =
  "supabase/migrations/20261113064846_subscription_dispute_id_prefix.sql";
const priorMigrationPath =
  "supabase/migrations/20261108134217_subscription_payment_incidents.sql";
const dispute = (
  payment: PaidFixture,
  objectId = "dp_" + payment.pi.slice(3),
) =>
  incidentObservation(payment, {
    event_id: "evt_Dispute" + payment.pi.slice(3),
    event_type: "charge.dispute.created",
    object_type: "dispute",
    object_id: objectId,
    status_at_event: "needs_response",
    current_status: "needs_response",
    event_amount_cents: 10000,
    current_amount_cents: 10000,
    charge_amount_refunded_cents: 0,
  });

describe("Stripe canonical dp_ dispute identity", () => {
  it.each([
    "charge.dispute.created",
    "charge.dispute.updated",
    "charge.dispute.closed",
  ])(
    "reconciles %s with an ID the administrative DTO accepts",
    async (type) => {
      const fixture = financialFixture(type);
      const result = await reconcileStripeFinancialIncident(
        fixture.raw(),
        fixture.signature(),
        financialConfig,
        fixture.fetcher,
      );
      expect(result).toMatchObject({
        kind: "incident",
        data: {
          object_type: "dispute",
          object_id: "dp_FinancialOriginal",
        },
      });
      expect(JSON.stringify(result)).not.toContain("evidence");
    },
  );

  it("rejects a noncanonical du_ ID before fetching any dispute or persisting it", async () => {
    const fixture = financialFixture("charge.dispute.created");
    ((fixture.event.data as FinancialObject).object as FinancialObject).id =
      "du_FinancialOriginal";
    await expect(
      reconcileStripeFinancialIncident(
        fixture.raw(),
        fixture.signature(),
        financialConfig,
        fixture.fetcher,
      ),
    ).rejects.toMatchObject({ code: "financial_event_invalid" });
    expect(fixture.fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.stripe.com/v1/account",
      "https://api.stripe.com/v1/events/evt_FinancialOriginal",
    ]);
  });
});

let db: PGlite;
beforeAll(async () => {
  db = await financialDatabase();
}, 120000);
afterAll(async () => {
  await db?.close();
});

describe("dispute validation upgrade on actual migrated SQL", () => {
  it.each([false, true])(
    "persists and replays dp_ observations for monthly=%s without business changes",
    async (monthly) => {
      const payment = await financialPayment(db, monthly);
      const original = await incidentOriginalSnapshot(db, payment);
      const data = dispute(payment);
      const first = await recordObservation(db, data);
      const caseId = String(first.case_id);
      expect(first).toMatchObject({ received: true, duplicate: false });
      expect(await recordObservation(db, data)).toMatchObject({
        case_id: caseId,
        duplicate: true,
      });
      await recordObservation(db, {
        ...data,
        event_id: data.event_id + "Updated",
        event_type: "charge.dispute.updated",
        status_at_event: "under_review",
        current_status: "under_review",
      });
      await recordObservation(db, {
        ...data,
        event_id: data.event_id + "Closed",
        event_type: "charge.dispute.closed",
        status_at_event: "won",
        current_status: "won",
      });
      const detail = await incidentAdminCall(db, "detail", caseId);
      expect(
        subscriptionIncidentSchema.parse((detail.items as unknown[])[0]),
      ).toMatchObject({
        task_id: payment.task,
        buyer_company_id: payment.company,
        row_version: 4,
        latest_provider: {
          object_id: data.object_id,
          object_type: "dispute",
          current_status: "won",
        },
      });
      const history = await incidentAdminCall(db, "history", caseId);
      expect(
        (history.items as { row_version: number }[]).map(
          (entry) => entry.row_version,
        ),
      ).toEqual([4, 3, 2]);
      expect(await incidentOriginalSnapshot(db, payment)).toEqual(original);
    },
  );

  it("rejects du_ ingestion and leaves its payment without an incident", async () => {
    const payment = await financialPayment(db);
    const original = await incidentOriginalSnapshot(db, payment);
    await expect(
      recordObservation(db, dispute(payment, "du_" + payment.pi.slice(3))),
    ).rejects.toMatchObject({
      code: "23514",
      message: "subscription_incident_invalid",
    });
    expect(
      (
        await db.query(
          "select id from private.tc_subscription_financial_cases where task_id=$1",
          [payment.task],
        )
      ).rows,
    ).toEqual([]);
    expect(await incidentOriginalSnapshot(db, payment)).toEqual(original);
  });

  it("rejects a foreign merchant and a dispute event reused for another company atomically", async () => {
    const payment = await financialPayment(db, true);
    const other = await financialPayment(db, true);
    const before = await incidentOriginalSnapshot(db, other);
    const data = dispute(payment);
    await expect(
      recordObservation(db, data, "acct_ForeignMerchant"),
    ).rejects.toMatchObject({ code: "23514" });
    await recordObservation(db, data);
    await expect(
      recordObservation(db, { ...dispute(other), event_id: data.event_id }),
    ).rejects.toMatchObject({
      code: "23514",
      message: "subscription_incident_conflicting_replay",
    });
    expect(
      (
        await db.query(
          "select id from private.tc_subscription_financial_cases where task_id=$1",
          [other.task],
        )
      ).rows,
    ).toEqual([]);
    expect(await incidentOriginalSnapshot(db, other)).toEqual(before);
    await expect(
      recordObservation(db, { ...data, company_id: other.company }),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("preserves the function identity, privileges and immutable pre-upgrade du_ evidence", async () => {
    const source = readFileSync(priorMigrationPath, "utf8");
    const start = source.indexOf(
      "create function private.tc_manual_subscription_record_incident(",
    );
    const end = source.indexOf("end;$record$;", start) + "end;$record$;".length;
    // Install the exact frozen64 body only in this ephemeral database to seed
    // evidence accepted before the fix. The historical SQL file stays unchanged.
    await db.exec(
      source
        .slice(start, end)
        .replace("create function ", "create or replace function "),
    );
    try {
      const payment = await financialPayment(db);
      const oldData = dispute(payment, "du_" + payment.pi.slice(3));
      const first = await recordObservation(db, oldData);
      const caseId = String(first.case_id);
      const identity = async () =>
        (
          await db.query(
            "select oid::text,proacl::text,prosecdef,proconfig from pg_proc where oid='private.tc_manual_subscription_record_incident(text,text,jsonb)'::regprocedure",
          )
        ).rows;
      const evidence = async () =>
        (
          await db.query(
            "select to_jsonb(e) evidence from private.tc_subscription_financial_entries e where case_id=$1 order by row_version",
            [caseId],
          )
        ).rows;
      const beforeIdentity = await identity(),
        beforeEvidence = await evidence();
      await db.exec(readFileSync(migrationPath, "utf8"));
      expect(await identity()).toEqual(beforeIdentity);
      expect(await evidence()).toEqual(beforeEvidence);
      await expect(recordObservation(db, oldData)).rejects.toMatchObject({
        code: "23514",
      });
      expect(await evidence()).toEqual(beforeEvidence);
      await recordObservation(db, {
        ...dispute(payment),
        event_id: oldData.event_id + "Canonical",
      });
      expect((await evidence())[0]).toEqual(beforeEvidence[0]);
      const detail = await incidentAdminCall(db, "detail", caseId);
      expect(
        subscriptionIncidentSchema.parse((detail.items as unknown[])[0]),
      ).toMatchObject({
        row_version: 3,
        latest_provider: { object_id: "dp_" + payment.pi.slice(3) },
      });
      await expect(
        db.exec(
          "update private.tc_subscription_financial_entries set data=data",
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: "manual_invoice_intake_immutable",
      });
    } finally {
      await db.exec(readFileSync(migrationPath, "utf8"));
    }
    // The migrated function retains its guarded service-only role contract.
    await expect(
      db.query(
        "select private.tc_manual_subscription_record_incident($1,'test','{}')",
        [incidentAccount],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
