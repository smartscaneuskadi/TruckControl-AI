import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  financialDatabase,
  incidentAdmin,
  incidentAdminSid,
  incidentObservation,
  incidentOriginalSnapshot,
  withDbRole,
} from "./helpers/subscription-financial-db";
import {
  commitPreviouslyReconciledPayment,
  ingestUnlinked,
  ownedBinding,
  pendingNativePayment,
  unlinkedAdmin,
} from "./helpers/unlinked-financial-fixtures";
import {
  unlinkedCapabilitiesSchema,
  unlinkedHistorySchema,
  unlinkedIncidentSchema,
  unlinkedMutationSchema,
} from "../src/domain/subscription-unlinked-incidents";

let db: PGlite;
beforeAll(async () => {
  db = await financialDatabase();
}, 120000);
afterAll(async () => {
  await db?.close();
});
const declaration = {
  reason: "Documented external financial review",
  evidence_reference: "Synthetic isolated evidence reference",
};
async function counts(request: string) {
  return (
    await db.query<{ result: { cases: number; entries: number } }>(
      `select jsonb_build_object(
    'cases',(select count(*) from private.tc_subscription_unlinked_cases where request_id=$1),
    'entries',(select count(*) from private.tc_subscription_unlinked_entries e join private.tc_subscription_unlinked_cases c on c.id=e.case_id where c.request_id=$1)) result`,
      [request],
    )
  ).rows[0].result;
}
async function detail(id: string) {
  return unlinkedIncidentSchema.parse(
    ((await unlinkedAdmin(db, "detail", id)).items as unknown[])[0],
  );
}

describe("durable unlinked review: actual migrated SQL, ephemeral owned orders", () => {
  it("advertises declaration-only capabilities behind fresh global administration", async () => {
    expect(
      unlinkedCapabilitiesSchema.parse(await unlinkedAdmin(db, "capabilities")),
    ).toMatchObject({
      available: true,
      payment_changes_available: false,
      license_changes_available: false,
      fiscal_emission_available: false,
    });
  });
  it.each([false, true])(
    "records a refund before the native paid commit for monthly=%s without changing business state",
    async (monthly) => {
      const payment = await pendingNativePayment(db, monthly),
        observation = incidentObservation(payment);
      const before = await incidentOriginalSnapshot(db, payment);
      expect(await ingestUnlinked(db, observation)).toEqual({
        contract: "subscription-incident-ingest-v1",
        recorded: false,
        ownership_required: true,
      });
      expect(await counts(payment.request)).toEqual({ cases: 0, entries: 0 });
      const result = await ingestUnlinked(
          db,
          observation,
          ownedBinding(payment),
        ),
        id = String(result.case_id);
      expect(result).toMatchObject({
        recorded: true,
        target: "quarantined",
        duplicate: false,
      });
      expect(await detail(id)).toMatchObject({
        request_id: payment.request,
        buyer_company_id: payment.company,
        checkout_id: payment.checkout,
        payment_intent_id: payment.pi,
        reason: "payment_task_missing",
        link_state: "unlinked",
        review_state: "pending",
        row_version: 2,
        last_action: null,
        link: null,
      });
      expect(await counts(payment.request)).toEqual({ cases: 1, entries: 1 });
      expect(await incidentOriginalSnapshot(db, payment)).toEqual(before);
      const stored = JSON.stringify(
        (
          await db.query(
            "select to_jsonb(c) c,to_jsonb(e) e from private.tc_subscription_unlinked_cases c join private.tc_subscription_unlinked_entries e on e.case_id=c.id where c.id=$1",
            [id],
          )
        ).rows,
      );
      for (const forbidden of [
        "@example.invalid",
        "Synthetic Pending Buyer",
        "Synthetic private test address",
        "customer_id",
        "customer_email",
        "metadata",
        "evidence",
      ])
        expect(stored).not.toContain(forbidden);
    },
  );
  it("records a canonical dp_ dispute without asserting a refund or creating a fiscal document", async () => {
    const payment = await pendingNativePayment(db, true),
      before = await incidentOriginalSnapshot(db, payment);
    const data = incidentObservation(payment, {
      event_type: "charge.dispute.created",
      object_type: "dispute",
      object_id: "dp_" + payment.pi.slice(3),
      status_at_event: "needs_response",
      current_status: "needs_response",
      charge_amount_refunded_cents: 0,
    });
    const result = await ingestUnlinked(db, data, ownedBinding(payment));
    expect(await detail(String(result.case_id))).toMatchObject({
      latest_provider: {
        object_type: "dispute",
        charge_amount_refunded_cents: 0,
      },
    });
    expect(await incidentOriginalSnapshot(db, payment)).toEqual(before);
  });
  it.each(["36300", 36300.5, null])(
    "rejects malformed invoice_amount_cents=%s before quarantine",
    async (value) => {
      const payment = await pendingNativePayment(db, true);
      const observation = {
        ...incidentObservation(payment),
        invoice_amount_cents: value as unknown as number,
      };
      await expect(
        ingestUnlinked(db, observation, ownedBinding(payment)),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await counts(payment.request)).toEqual({ cases: 0, entries: 0 });
    },
  );
  it.each([
    "unknown_request",
    "foreign_owner",
    "foreign_checkout",
    "quote",
    "ambiguous_company",
    "merchant",
  ])("rejects %s ownership with zero quarantine rows", async (attack) => {
    const payment = await pendingNativePayment(db),
      other = await pendingNativePayment(db);
    const binding = ownedBinding(payment),
      data = incidentObservation(payment);
    if (attack === "unknown_request") binding.request_id = randomUUID();
    if (attack === "foreign_owner") binding.user_id = other.user;
    if (attack === "foreign_checkout") binding.checkout_id = other.checkout;
    if (attack === "quote") data.charge_amount_cents += 100;
    if (attack === "ambiguous_company")
      await db.query(
        "insert into public.organizations(id,owner_id,name) values($1,$2,'Synthetic extra company')",
        [randomUUID(), payment.user],
      );
    await expect(
      ingestUnlinked(
        db,
        data,
        binding,
        attack === "merchant" ? "acct_OtherMerchant" : undefined,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(await counts(payment.request)).toEqual({ cases: 0, entries: 0 });
  });
  it("retains exact replay despite changed current status, and rejects conflicting immutable observations", async () => {
    const payment = await pendingNativePayment(db),
      data = incidentObservation(payment);
    const first = await ingestUnlinked(db, data, ownedBinding(payment));
    expect(
      await ingestUnlinked(db, {
        ...data,
        current_status: "pending",
        current_amount_cents: data.current_amount_cents,
      }),
    ).toMatchObject({
      recorded: true,
      target: "quarantined",
      duplicate: true,
      case_id: first.case_id,
    });
    await expect(
      ingestUnlinked(
        db,
        { ...data, status_at_event: "failed" },
        ownedBinding(payment),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: "unlinked_incident_conflicting_replay",
    });
    expect(await counts(payment.request)).toEqual({ cases: 1, entries: 1 });
    expect(
      (await detail(String(first.case_id))).latest_provider.current_status,
    ).toBe("succeeded");
  });
  it("cannot reuse a receipt for a foreign owned purchase", async () => {
    const payment = await pendingNativePayment(db),
      other = await pendingNativePayment(db);
    const data = incidentObservation(payment);
    await ingestUnlinked(db, data, ownedBinding(payment));
    await expect(
      ingestUnlinked(
        db,
        { ...incidentObservation(other), event_id: data.event_id },
        ownedBinding(other),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: "unlinked_incident_conflicting_replay",
    });
    expect(await counts(other.request)).toEqual({ cases: 0, entries: 0 });
  });
  it("rolls back case and receipt atomically when append persistence fails", async () => {
    const payment = await pendingNativePayment(db);
    await db.exec(`create function private.unlinked_test_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_unlinked_failure';end;$$;
      create trigger unlinked_test_failure before insert on private.tc_subscription_unlinked_entries for each row execute function private.unlinked_test_failure()`);
    try {
      await expect(
        ingestUnlinked(db, incidentObservation(payment), ownedBinding(payment)),
      ).rejects.toThrow("synthetic_unlinked_failure");
    } finally {
      await db.exec(
        "drop trigger unlinked_test_failure on private.tc_subscription_unlinked_entries;drop function private.unlinked_test_failure()",
      );
    }
    expect(await counts(payment.request)).toEqual({ cases: 0, entries: 0 });
  });
  it("CAS and actor-bound replay preserve declarations; a later event reopens review", async () => {
    const payment = await pendingNativePayment(db),
      data = incidentObservation(payment);
    const id = String(
        (await ingestUnlinked(db, data, ownedBinding(payment))).case_id,
      ),
      operation = randomUUID();
    const first = unlinkedMutationSchema.parse(
      await unlinkedAdmin(db, "review", id, 2, operation, declaration),
    );
    expect(first.case).toMatchObject({
      review_state: "reviewed",
      row_version: 3,
      link_state: "unlinked",
    });
    expect(
      await unlinkedAdmin(db, "review", id, 2, operation, declaration),
    ).toEqual(first);
    await expect(
      unlinkedAdmin(db, "review", id, 2, randomUUID(), declaration),
    ).rejects.toMatchObject({ code: "40001" });
    await expect(
      unlinkedAdmin(db, "dismiss", id, 2, operation, declaration),
    ).rejects.toMatchObject({ code: "23514" });
    await ingestUnlinked(
      db,
      {
        ...data,
        event_id: data.event_id + "Updated",
        event_type: "refund.updated",
      },
      ownedBinding(payment),
    );
    expect(await detail(id)).toMatchObject({
      row_version: 4,
      review_state: "pending",
      last_action: { row_version: 3 },
    });
    const dismissed = unlinkedMutationSchema.parse(
      await unlinkedAdmin(db, "dismiss", id, 4, randomUUID(), declaration),
    );
    expect(dismissed.case).toMatchObject({
      review_state: "dismissed",
      row_version: 5,
      link_state: "unlinked",
    });
    expect(
      unlinkedHistorySchema
        .parse(await unlinkedAdmin(db, "history", id))
        .items.map((item) => item.row_version),
    ).toEqual([5, 4, 3, 2]);
  });
  it.each([false, true])(
    "links only after an actual delayed paid commit, reopening review for monthly=%s",
    async (monthly) => {
      const payment = await pendingNativePayment(db, monthly),
        data = incidentObservation(payment);
      const id = String(
        (await ingestUnlinked(db, data, ownedBinding(payment))).case_id,
      );
      await unlinkedAdmin(db, "dismiss", id, 2, randomUUID(), declaration);
      // Represents a paid handler that had already reconciled the charge and
      // commits later. The quarantine itself never calls this existing bridge.
      await commitPreviouslyReconciledPayment(db, payment);
      const before = await incidentOriginalSnapshot(db, payment);
      // The real receipt INSERT attaches the existing queued evidence even
      // though its HTTP200 prevented any later Stripe incident retry.
      const linked = await detail(id);
      expect(linked).toMatchObject({
        row_version: 4,
        review_state: "pending",
        link_state: "linked_to_existing_payment",
        link: {
          task_id: payment.task,
          receipt_event_id: payment.event,
          queued_event_id: data.event_id,
          row_version: 4,
        },
        last_action: { kind: "dismiss", row_version: 3 },
      });
      expect(await ingestUnlinked(db, data)).toMatchObject({
        recorded: true,
        target: "linked",
        duplicate: false,
      });
      expect(await ingestUnlinked(db, data)).toMatchObject({
        target: "linked",
        duplicate: true,
      });
      expect(await detail(id)).toEqual(linked);
      expect(await incidentOriginalSnapshot(db, payment)).toEqual(before);
      expect(await counts(payment.request)).toEqual({ cases: 1, entries: 3 });
    },
  );
  it("never quarantines a malformed linked payment mismatch", async () => {
    const payment = await pendingNativePayment(db);
    await commitPreviouslyReconciledPayment(db, payment);
    await expect(
      ingestUnlinked(
        db,
        incidentObservation(payment, { charge_amount_cents: 36400 }),
        ownedBinding(payment),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: "subscription_incident_payment_mismatch",
    });
    expect(await counts(payment.request)).toEqual({ cases: 0, entries: 0 });
  });
  it("leaves ambiguous canonical-payment candidates pending while a real receipt commits", async () => {
    const payment = await pendingNativePayment(db, true),
      data = incidentObservation(payment);
    const first = String(
      (await ingestUnlinked(db, data, ownedBinding(payment))).case_id,
    );
    const secondData = {
      ...data,
      event_id: data.event_id + "Alternate",
      object_id: data.object_id + "Alternate",
      payment_intent_id: payment.pi + "Alternate",
      charge_id: payment.charge + "Alternate",
      invoice_payment_id: data.invoice_payment_id + "Alternate",
    };
    const second = String(
      (await ingestUnlinked(db, secondData, ownedBinding(payment))).case_id,
    );
    await commitPreviouslyReconciledPayment(db, payment);
    for (const id of [first, second])
      expect(await detail(id)).toMatchObject({
        link_state: "unlinked",
        review_state: "pending",
        row_version: 2,
        link: null,
      });
    expect(await counts(payment.request)).toEqual({ cases: 2, entries: 2 });
  });
  it("does not automatically link a contradictory native monthly period", async () => {
    const payment = await pendingNativePayment(db, true),
      data = incidentObservation(payment);
    const id = String(
      (await ingestUnlinked(db, data, ownedBinding(payment))).case_id,
    );
    payment.proof.invoice_period_start =
      Number(payment.proof.invoice_period_start) + 86400;
    payment.proof.invoice_period_end =
      Number(payment.proof.invoice_period_end) + 86400;
    payment.proof.subscription_current_period_end =
      payment.proof.invoice_period_end;
    await commitPreviouslyReconciledPayment(db, payment);
    expect(await detail(id)).toMatchObject({
      link_state: "unlinked",
      review_state: "pending",
      row_version: 2,
      link: null,
    });
    expect(await counts(payment.request)).toEqual({ cases: 1, entries: 1 });
  });
  it("denies customer tenants and direct service access; history remains append-only", async () => {
    const payment = await pendingNativePayment(db),
      other = await pendingNativePayment(db);
    const id = String(
      (
        await ingestUnlinked(
          db,
          incidentObservation(payment),
          ownedBinding(payment),
        )
      ).case_id,
    );
    for (const user of [payment.user, other.user]) {
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
        "dismiss",
      ])
        await expect(
          unlinkedAdmin(
            db,
            action,
            id,
            2,
            randomUUID(),
            declaration,
            user,
            sid,
          ),
        ).rejects.toMatchObject({ code: "42501" });
    }
    for (const role of ["anon", "authenticated", "service_role"])
      await expect(
        withDbRole(db, role, () =>
          db.query("select * from private.tc_subscription_unlinked_entries"),
        ),
      ).rejects.toThrow();
    for (const statement of [
      "update private.tc_subscription_unlinked_entries set data=data",
      "delete from private.tc_subscription_unlinked_entries",
      "truncate private.tc_subscription_unlinked_entries",
      "update private.tc_subscription_unlinked_cases set reason=reason",
      "delete from private.tc_subscription_unlinked_cases",
      "truncate private.tc_subscription_unlinked_cases,private.tc_subscription_unlinked_entries",
    ])
      await expect(db.exec(statement)).rejects.toMatchObject({
        code: "23514",
        message: "manual_invoice_intake_immutable",
      });
    for (const role of ["anon", "authenticated"])
      await expect(
        withDbRole(db, role, () =>
          db.query(
            "select public.tc_subscription_incident_ingest('acct_Forbidden','test','{}',null)",
          ),
        ),
      ).rejects.toThrow();
    await expect(
      withDbRole(db, "service_role", () =>
        db.query(
          "select private.tc_subscription_unlinked_link_receipt(null::private.tc_manual_stripe_bridge_receipts)",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("requires the live global role and verified SID on every action, including an exact operation replay", async () => {
    const payment = await pendingNativePayment(db),
      id = String(
        (
          await ingestUnlinked(
            db,
            incidentObservation(payment),
            ownedBinding(payment),
          )
        ).case_id,
      );
    const operation = randomUUID();
    await unlinkedAdmin(db, "review", id, 2, operation, declaration);
    await db.query("delete from auth.sessions where id=$1", [incidentAdminSid]);
    try {
      for (const action of [
        "capabilities",
        "list",
        "detail",
        "history",
        "review",
        "dismiss",
      ])
        await expect(
          unlinkedAdmin(db, action, id, 2, operation, declaration),
        ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
        incidentAdminSid,
        incidentAdmin,
      ]);
    }
    await db.query("delete from private.tc_admins where user_id=$1", [
      incidentAdmin,
    ]);
    try {
      await expect(
        unlinkedAdmin(db, "review", id, 2, operation, declaration),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.query("insert into private.tc_admins(user_id) values($1)", [
        incidentAdmin,
      ]);
    }
    expect((await detail(id)).row_version).toBe(3);
  });
});
