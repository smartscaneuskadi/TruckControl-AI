import { describe, expect, it, vi } from "vitest";
import { createStripeIncidentHandler } from "../supabase/functions/truckcontrol-stripe-incidents/handler";
import { persistStripeRiskSignal } from "../supabase/functions/_shared/subscription-risk-persistence";
import { reconcileStripeRiskSignal } from "../supabase/functions/_shared/subscription-risk-signals";
import {
  financialConfig,
  financialQuery,
  financialFixture,
} from "./helpers/stripe-financial-fixtures";
import { riskFixture } from "./helpers/stripe-risk-fixtures";
const enabled = {
  ...financialConfig,
  enabled: true,
  schemaAccepted: true,
  riskSignalsAccepted: true,
};
const request = (f: ReturnType<typeof riskFixture>) =>
  new Request("https://isolated.invalid/incidents", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": f.signature(),
    },
    body: f.raw(),
  });
describe("early fraud warnings via the existing incidents webhook", () => {
  it.each(["omitted", "off", "missing_gateway"])(
    "keeps %s separate acceptance closed before provider/database I/O",
    async (state) => {
      const f = riskFixture(),
        record = vi.fn(),
        riskSignal = state === "missing_gateway" ? undefined : vi.fn();
      const config = {
        ...enabled,
        riskSignalsAccepted:
          state === "off" ? false : state === "omitted" ? undefined : true,
      };
      const result = await createStripeIncidentHandler(
        { record, riskSignal },
        config,
        f.fetcher,
      )(request(f));
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({
        error: "subscription_risk_signals_disabled",
      });
      expect(record).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );
  it("awaits committed observation before acknowledging and never invokes financial record/ingest", async () => {
    const f = riskFixture(),
      record = vi.fn(),
      ingest = vi.fn();
    let done = false,
      finish: (() => void) | undefined;
    const riskSignal = vi.fn(async () => {
      await new Promise<void>((yes) => {
        finish = yes;
      });
    });
    const pending = createStripeIncidentHandler(
      { record, ingest, riskSignal },
      enabled,
      f.fetcher,
    )(request(f)).then((r) => {
      done = true;
      return r;
    });
    await vi.waitFor(() => expect(riskSignal).toHaveBeenCalledOnce());
    expect(done).toBe(false);
    finish!();
    expect((await pending).status).toBe(200);
    expect(record).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });
  it.each(["bad_signature", "origin", "method", "oversize"])(
    "rejects %s without provider or persistence calls",
    async (reason) => {
      const f = riskFixture(),
        record = vi.fn(),
        riskSignal = vi.fn();
      let req = request(f),
        status = 400;
      if (reason === "bad_signature")
        req.headers.set("stripe-signature", "t=1,v1=invalid");
      if (reason === "origin") {
        req.headers.set("origin", "https://truckcontrolai.com");
        status = 403;
      }
      if (reason === "method") {
        req = new Request("https://isolated.invalid/incidents");
        status = 405;
      }
      if (reason === "oversize") {
        req = new Request("https://isolated.invalid/incidents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "x".repeat(65537),
        });
        status = 413;
      }
      expect(
        (
          await createStripeIncidentHandler(
            { record, riskSignal },
            enabled,
            f.fetcher,
          )(req)
        ).status,
      ).toBe(status);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(riskSignal).not.toHaveBeenCalled();
    },
  );
  it("never ACKs a missing or ambiguous native mapping or persistence failure, and hides private errors", async () => {
    const f = riskFixture(),
      riskSignal = vi.fn(async () => {
        throw Error("PRIVATE-KEY-AND-ADDRESS");
      });
    const result = await createStripeIncidentHandler(
      { record: vi.fn(), riskSignal },
      enabled,
      f.fetcher,
    )(request(f));
    expect(result.status).toBe(503);
    expect(await result.text()).toBe(
      '{"error":"subscription_incident_pipeline_unavailable"}',
    );
    f.records[financialQuery].has_more = true;
    riskSignal.mockClear();
    const ambiguous = await createStripeIncidentHandler(
      { record: vi.fn(), riskSignal },
      enabled,
      f.fetcher,
    )(request(f));
    expect(ambiguous.status).toBe(503);
    expect(await ambiguous.json()).toEqual({
      error: "risk_signal_mapping_unavailable",
    });
    expect(riskSignal).not.toHaveBeenCalled();
  });
  it("keeps the old refund path and DTO compatible when the new acceptance is absent", async () => {
    const f = financialFixture(),
      record = vi.fn(),
      riskSignal = vi.fn();
    const req = new Request("https://isolated.invalid/incidents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": f.signature(),
      },
      body: f.raw(),
    });
    expect(
      (
        await createStripeIncidentHandler(
          { record, riskSignal },
          { ...enabled, riskSignalsAccepted: false },
          f.fetcher,
        )(req)
      ).status,
    ).toBe(200);
    expect(record).toHaveBeenCalledWith(
      financialConfig.expectedAccountId,
      "test",
      expect.objectContaining({ object_type: "refund" }),
    );
    expect(riskSignal).not.toHaveBeenCalled();
  });
  it("validates the durable native reply instead of treating any RPC response as received", async () => {
    const f = riskFixture(),
      value = await reconcileStripeRiskSignal(
        f.raw(),
        f.signature(),
        financialConfig,
        f.fetcher,
      );
    if (value.kind !== "risk_signal") throw Error("fixture");
    const success = {
      contract: "subscription-risk-record-v1",
      received: true,
      duplicate: false,
      case_id: "aa110000-0000-4000-8000-000000000001",
    };
    const rpc = vi.fn(async () => ({ data: success, error: null }));
    await persistStripeRiskSignal(rpc, value.account, value.mode, value.data);
    expect(rpc).toHaveBeenCalledWith("tc_subscription_risk_record", {
      p_account: value.account,
      p_mode: value.mode,
      p_data: value.data,
    });
    for (const data of [
      {},
      { ...success, received: false },
      { ...success, duplicate: "true" },
      { ...success, case_id: "foreign" },
    ])
      await expect(
        persistStripeRiskSignal(
          async () => ({ data, error: null }),
          value.account,
          value.mode,
          value.data,
        ),
      ).rejects.toThrow("subscription_risk_persistence_unavailable");
    await expect(
      persistStripeRiskSignal(
        async () => ({ data: success, error: { message: "private" } }),
        value.account,
        value.mode,
        value.data,
      ),
    ).rejects.toThrow("subscription_risk_persistence_unavailable");
  });
});
