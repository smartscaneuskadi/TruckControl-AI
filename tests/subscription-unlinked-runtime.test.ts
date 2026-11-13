import { describe, expect, it, vi } from "vitest";
import { createStripeIncidentHandler } from "../supabase/functions/truckcontrol-stripe-incidents/handler";
import { reconcileStripeFinancialIncident } from "../supabase/functions/_shared/subscription-financial-incidents";
import { reconcileStripeOwnedCheckout } from "../supabase/functions/_shared/subscription-unlinked-ownership";
import { ingestStripeFinancialIncident } from "../supabase/functions/_shared/subscription-unlinked-persistence";
import {
  financialConfig,
  financialStamp,
} from "./helpers/stripe-financial-fixtures";
import {
  incidentAccount,
  type PaidFixture,
} from "./helpers/subscription-financial-db";
import { ownedProviderFixture } from "./helpers/unlinked-financial-fixtures";

const config = {
  ...financialConfig,
  expectedAccountId: incidentAccount,
  enabled: true,
  schemaAccepted: true,
  unlinkedReview: true,
};
function provider(monthly = false, type = "refund.created") {
  const payment: PaidFixture = {
    user: "cb110000-0000-4000-8000-000000000001",
    request: "cb220000-0000-4000-8000-000000000001",
    company: "cb330000-0000-4000-8000-000000000001",
    checkout: "cs_test_UnlinkedProof",
    customer: "cus_UnlinkedProof",
    pi: "pi_UnlinkedProof",
    charge: "ch_UnlinkedProof",
    invoice: monthly ? "in_UnlinkedProof" : null,
    subscription: monthly ? "sub_UnlinkedProof" : null,
    task: "cb440000-0000-4000-8000-000000000001",
    event: "evt_PaidUnlinkedProof",
    kind: monthly ? "subscription_invoice" : "initial_payment",
    proof: {},
    periodStart: monthly ? financialStamp - 30 * 86400 : null,
    periodEnd: monthly ? financialStamp : null,
  };
  return ownedProviderFixture(payment, type);
}
function request(fixture: ReturnType<typeof provider>) {
  return new Request("https://isolated.invalid/incidents", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": fixture.signature(),
    },
    body: fixture.raw(),
  });
}
const gateway = () => ({
  record: vi.fn(async () => {}),
  ingest: vi.fn(async (_account, _mode, _data, binding) =>
    binding === null ? ("ownership_required" as const) : ("recorded" as const),
  ),
});

describe("signed canonical unlinked incidents: no external network", () => {
  it.each([false, true])(
    "uses bounded exact Checkout ownership before ACK for monthly=%s",
    async (monthly) => {
      const fixture = provider(monthly),
        store = gateway();
      const result = await createStripeIncidentHandler(
        store,
        config,
        fixture.fetcher,
      )(request(fixture));
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ received: true });
      expect(store.record).not.toHaveBeenCalled();
      expect(store.ingest).toHaveBeenCalledTimes(2);
      expect(store.ingest.mock.calls[1][3]).toEqual({
        request_id: fixture.session.metadata.tc_request_id,
        user_id: fixture.session.metadata.tc_user_id,
        checkout_id: fixture.session.id,
        mode: monthly ? "subscription" : "payment",
      });
      expect(
        fixture.fetcher.mock.calls.filter(([url]) =>
          String(url).includes("checkout/sessions?"),
        ),
      ).toHaveLength(1);
      for (const [url, init] of fixture.fetcher.mock.calls) {
        expect(String(url)).toMatch(/^https:\/\/api\.stripe\.com\/v1\//);
        expect(init).toMatchObject({ method: "GET", redirect: "error" });
      }
    },
  );
  it("does not fetch Checkout or quarantine a payment already linked by the old verified ledger", async () => {
    const fixture = provider(),
      store = gateway();
    store.ingest.mockResolvedValue("recorded");
    expect(
      (
        await createStripeIncidentHandler(
          store,
          config,
          fixture.fetcher,
        )(request(fixture))
      ).status,
    ).toBe(200);
    expect(store.ingest).toHaveBeenCalledOnce();
    expect(
      fixture.fetcher.mock.calls.some(([url]) =>
        String(url).includes("checkout/sessions?"),
      ),
    ).toBe(false);
  });
  it("leaves the existing financial pipeline unchanged while the additive capability is OFF", async () => {
    const fixture = provider(),
      store = gateway();
    expect(
      (
        await createStripeIncidentHandler(
          store,
          { ...config, unlinkedReview: false },
          fixture.fetcher,
        )(request(fixture))
      ).status,
    ).toBe(200);
    expect(store.record).toHaveBeenCalledOnce();
    expect(store.ingest).not.toHaveBeenCalled();
  });
  it.each([
    "missing",
    "two",
    "more",
    "foreign_pi",
    "foreign_customer",
    "no_app_metadata",
    "incomplete",
    "different_mode",
    "different_amount",
  ])(
    "keeps %s Checkout ownership unacknowledged and never asks to persist a quarantine",
    async (attack) => {
      const fixture = provider(),
        store = gateway(),
        list = fixture.records[fixture.checkoutQuery];
      if (attack === "missing") list.data = [];
      if (attack === "two")
        list.data = [fixture.session, structuredClone(fixture.session)];
      if (attack === "more") list.has_more = true;
      if (attack === "foreign_pi")
        fixture.session.payment_intent = "pi_Foreign";
      if (attack === "foreign_customer")
        fixture.session.customer = "cus_Foreign";
      if (attack === "no_app_metadata")
        fixture.session.metadata = {} as typeof fixture.session.metadata;
      if (attack === "incomplete") fixture.session.status = "open";
      if (attack === "different_mode") fixture.session.mode = "subscription";
      if (attack === "different_amount") fixture.session.amount_total = 100;
      const result = await createStripeIncidentHandler(
        store,
        config,
        fixture.fetcher,
      )(request(fixture));
      expect(result.status).toBe(503);
      expect(store.ingest).toHaveBeenCalledOnce();
      expect(store.ingest.mock.calls[0][3]).toBeNull();
    },
  );
  it("rejects recurring Checkout metadata that disagrees with the immutable invoice snapshot", async () => {
    const fixture = provider(true),
      store = gateway();
    fixture.session.metadata.tc_request_id =
      "cb220000-0000-4000-8000-000000000099";
    expect(
      (
        await createStripeIncidentHandler(
          store,
          config,
          fixture.fetcher,
        )(request(fixture))
      ).status,
    ).toBe(503);
    expect(store.ingest).toHaveBeenCalledOnce();
  });
  it.each(["signature", "merchant", "mode"])(
    "rejects %s before any persistence",
    async (attack) => {
      const fixture = provider(),
        store = gateway();
      if (attack === "mode") fixture.event.livemode = true;
      const req = request(fixture);
      if (attack === "signature")
        req.headers.set("stripe-signature", "t=1,v1=invalid");
      if (attack === "merchant") fixture.records.account.id = "acct_Foreign";
      const result = await createStripeIncidentHandler(
        store,
        config,
        fixture.fetcher,
      )(req);
      expect(result.status).toBe(400);
      expect(store.ingest).not.toHaveBeenCalled();
      expect(store.record).not.toHaveBeenCalled();
      if (attack === "signature" || attack === "mode")
        expect(fixture.fetcher).not.toHaveBeenCalled();
    },
  );
  it("never acknowledges failed persistence or discloses its private error", async () => {
    const fixture = provider(),
      store = gateway();
    store.ingest.mockImplementation(async (_a, _m, _d, binding) => {
      if (!binding) return "ownership_required";
      throw Error("private-token/customer-data");
    });
    const response = await createStripeIncidentHandler(
      store,
      config,
      fixture.fetcher,
    )(request(fixture));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "subscription_incident_pipeline_unavailable",
    });
  });
  it("waits for a durable receipt before its HTTP success acknowledgement", async () => {
    const fixture = provider(),
      store = gateway();
    let release: (() => void) | undefined,
      started = false,
      done = false;
    store.ingest.mockImplementation(async (_a, _m, _d, binding) => {
      if (!binding) return "ownership_required";
      started = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "recorded";
    });
    const pending = createStripeIncidentHandler(
      store,
      config,
      fixture.fetcher,
    )(request(fixture)).then((value) => {
      done = true;
      return value;
    });
    await vi.waitFor(() => expect(started).toBe(true));
    expect(done).toBe(false);
    release!();
    expect((await pending).status).toBe(200);
  });
  it("bounds Checkout responses and does not follow an ambiguous next page", async () => {
    const fixture = provider(),
      original = fixture.fetcher.getMockImplementation()!;
    fixture.fetcher.mockImplementation((url, init) =>
      String(url).includes("checkout/sessions?")
        ? Promise.resolve(new Response(" ".repeat(524289)))
        : original(url, init),
    );
    const store = gateway(),
      result = await createStripeIncidentHandler(
        store,
        config,
        fixture.fetcher,
      )(request(fixture));
    expect(result.status).toBe(503);
    expect(store.ingest).toHaveBeenCalledOnce();
  });
  it("does not allow a different canonical event projection to borrow the ownership helper", async () => {
    const fixture = provider();
    const reconciled = await reconcileStripeFinancialIncident(
      fixture.raw(),
      fixture.signature(),
      config,
      fixture.fetcher,
    );
    if (reconciled.kind !== "incident")
      throw Error("Expected synthetic incident");
    await expect(
      reconcileStripeOwnedCheckout(
        fixture.raw(),
        fixture.signature(),
        config,
        { ...reconciled.data, object_id: "re_Foreign" },
        fixture.fetcher,
      ),
    ).rejects.toMatchObject({ code: "financial_mapping_unavailable" });
  });
});

describe("strict durable-ingest adapter ACK contract", () => {
  it("distinguishes a read-only ownership request from durable receipts", async () => {
    const fixture = provider();
    const result = await reconcileStripeFinancialIncident(
      fixture.raw(),
      fixture.signature(),
      config,
      fixture.fetcher,
    );
    if (result.kind !== "incident") throw Error("Expected synthetic incident");
    const rpc = vi.fn(async () => ({
      error: null,
      data: {
        contract: "subscription-incident-ingest-v1",
        recorded: false,
        ownership_required: true,
      },
    }));
    expect(
      await ingestStripeFinancialIncident(
        rpc,
        incidentAccount,
        "test",
        result.data,
        null,
      ),
    ).toBe("ownership_required");
    await expect(
      ingestStripeFinancialIncident(rpc, incidentAccount, "test", result.data, {
        request_id: "cb220000-0000-4000-8000-000000000001",
        user_id: "cb110000-0000-4000-8000-000000000001",
        checkout_id: "cs_test_UnlinkedProof",
        mode: "payment",
      }),
    ).rejects.toThrow("subscription_incident_persistence_unavailable");
  });
  it.each(["invalid_case", "missing_receipt", "sql_failure"])(
    "rejects %s rather than reporting a committed receipt",
    async (failure) => {
      const fixture = provider(),
        result = await reconcileStripeFinancialIncident(
          fixture.raw(),
          fixture.signature(),
          config,
          fixture.fetcher,
        );
      if (result.kind !== "incident")
        throw Error("Expected synthetic incident");
      const rpc = vi.fn(async () => ({
        error: failure === "sql_failure" ? { code: "23514" } : null,
        data: {
          contract: "subscription-incident-ingest-v1",
          recorded: failure !== "missing_receipt",
          target: "quarantined",
          duplicate: false,
          case_id:
            failure === "invalid_case"
              ? "wrong"
              : "cb440000-0000-4000-8000-000000000001",
        },
      }));
      await expect(
        ingestStripeFinancialIncident(
          rpc,
          incidentAccount,
          "test",
          result.data,
          null,
        ),
      ).rejects.toThrow("subscription_incident_persistence_unavailable");
    },
  );
});
