import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import { createUnlinkedIncidentClient } from "../src/integrations/supabase/subscription-unlinked-incidents";
import { unlinkedIncidentSchema } from "../src/domain/subscription-unlinked-incidents";

const user = "ab110000-0000-4000-8000-000000000001",
  caseId = "ab220000-0000-4000-8000-000000000001";
const operation = "ab330000-0000-4000-8000-000000000001",
  stamp = "2026-11-13T07:00:00Z";
const contract = "subscription-unlinked-incidents-v1",
  declaration = {
    reason: "External evidence checked",
    evidence_reference: "Synthetic reference",
  };
function row() {
  return unlinkedIncidentSchema.parse({
    id: caseId,
    request_id: "ab440000-0000-4000-8000-000000000001",
    buyer_company_id: "ab550000-0000-4000-8000-000000000001",
    checkout_id: "cs_test_Owned",
    payment_intent_id: "pi_Owned",
    charge_id: "ch_Owned",
    invoice_id: null,
    subscription_id: null,
    period_start: null,
    period_end: null,
    amount_cents: 36300,
    currency: "EUR",
    reason: "payment_task_missing",
    row_version: 2,
    created_at: stamp,
    review_state: "pending",
    link_state: "unlinked",
    last_action: null,
    link: null,
    latest_provider: {
      event_id: "evt_Owned",
      event_type: "refund.created",
      event_created: stamp,
      object_type: "refund",
      object_id: "re_Owned",
      status_at_event: "succeeded",
      current_status: "succeeded",
      event_amount_cents: 5000,
      current_amount_cents: 5000,
      charge_amount_refunded_cents: 5000,
    },
  });
}
function fixture() {
  const state = {
    token: "synthetic-token-v1",
    user,
    verified: true,
    code: "",
    corrupt: false,
    beforeReply: null as (() => void) | null,
    data: row(),
  };
  const calls: {
    name: string;
    params: Record<string, unknown>;
    authorization: string;
  }[] = [];
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: { access_token: state.token, user: { id: state.user } },
        },
        error: null,
      })),
      getUser: vi.fn(async () => ({
        data: { user: state.verified ? { id: state.user } : null },
        error: state.verified ? null : { message: "revoked" },
      })),
    },
    rpc: vi.fn((name: string, params: Record<string, unknown>) => {
      const call = { name, params, authorization: "" };
      calls.push(call);
      const query = {
        setHeader(_name: string, value: string) {
          call.authorization = value;
          return query;
        },
        abortSignal() {
          return query;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve()
            .then(() => {
              let data: unknown;
              if (state.code)
                return { data: null, error: { code: state.code } };
              if (params.p_action === "capabilities")
                data = {
                  contract,
                  available: true,
                  payment_changes_available: false,
                  license_changes_available: false,
                  fiscal_emission_available: false,
                };
              else if (
                params.p_action === "list" ||
                params.p_action === "detail"
              )
                data = { contract, items: [state.data], next_cursor: null };
              else if (params.p_action === "history")
                data = {
                  contract,
                  case_id: caseId,
                  items: [],
                  next_before_version: null,
                };
              else
                data = {
                  contract,
                  case: {
                    ...state.data,
                    row_version: 3,
                    review_state:
                      params.p_action === "dismiss" ? "dismissed" : "reviewed",
                    last_action: {
                      ...declaration,
                      kind: params.p_action,
                      actor_id: user,
                      row_version: 3,
                      created_at: stamp,
                    },
                  },
                  operation: {
                    ...declaration,
                    id: params.p_operation_id,
                    action: params.p_action,
                    actor_id: state.corrupt ? caseId : user,
                    expected_version: params.p_expected,
                    applied_version: 3,
                  },
                };
              state.beforeReply?.();
              return { data, error: null };
            })
            .then(resolve, reject);
        },
      };
      return query;
    }),
  } as unknown as SupabaseClient<Database>;
  return { state, client, calls };
}

describe("RAM-only verified unlinked incident client", () => {
  it("pins every RPC to the verified token and accepts the separate no-money capability", async () => {
    const f = fixture(),
      client = await createUnlinkedIncidentClient(f.client, user);
    expect(await client.capabilities()).toMatchObject({
      payment_changes_available: false,
      license_changes_available: false,
    });
    expect((await client.list()).items[0]).toEqual(row());
    expect(
      f.calls.every(
        (call) =>
          call.name === "tc_admin_subscription_unlinked" &&
          call.authorization === "Bearer synthetic-token-v1",
      ),
    ).toBe(true);
  });
  it.each(["PGRST202", "42501"])(
    "does not fabricate availability for %s",
    async (code) => {
      const f = fixture();
      f.state.code = code;
      const client = await createUnlinkedIncidentClient(f.client, user);
      await expect(client.capabilities()).rejects.toMatchObject({
        kind: code === "42501" ? "denied" : "unavailable",
      });
      await expect(client.list()).rejects.toMatchObject({
        kind: "unavailable",
      });
      expect(f.calls).toHaveLength(1);
    },
  );
  it.each(["token", "user", "verification"])(
    "discards a late response after %s revocation",
    async (change) => {
      const f = fixture(),
        client = await createUnlinkedIncidentClient(f.client, user);
      await client.capabilities();
      f.state.beforeReply = () => {
        if (change === "token") f.state.token = "synthetic-token-v2";
        if (change === "user") f.state.user = caseId;
        if (change === "verification") f.state.verified = false;
      };
      await expect(client.list()).rejects.toMatchObject({ kind: "denied" });
    },
  );
  it("reuses an explicit operation UUID and validates the administrative actor/ACK", async () => {
    const f = fixture(),
      client = await createUnlinkedIncidentClient(f.client, user);
    await client.capabilities();
    expect(
      (await client.mutate(row(), "review", declaration, operation)).case
        .review_state,
    ).toBe("reviewed");
    expect(
      (await client.mutate(row(), "review", declaration, operation)).operation
        .id,
    ).toBe(operation);
    const writes = f.calls.filter((call) => call.params.p_action === "review");
    expect(writes[0].params).toEqual(writes[1].params);
    f.state.corrupt = true;
    await expect(
      client.mutate(row(), "review", declaration, operation),
    ).rejects.toMatchObject({ kind: "uncertain" });
  });
  it("blocks a stale declaration and a revoked role rather than claiming success", async () => {
    const f = fixture(),
      client = await createUnlinkedIncidentClient(f.client, user);
    await client.capabilities();
    f.state.code = "40001";
    await expect(
      client.mutate(row(), "dismiss", declaration, operation),
    ).rejects.toMatchObject({ kind: "conflict" });
    f.state.code = "42501";
    await expect(
      client.mutate(row(), "dismiss", declaration, operation),
    ).rejects.toMatchObject({ kind: "denied" });
  });
  it("requires reason/evidence and rejects a fabricated native link in DTOs", async () => {
    const f = fixture(),
      client = await createUnlinkedIncidentClient(f.client, user);
    await client.capabilities();
    await expect(
      client.mutate(
        row(),
        "review",
        { reason: "", evidence_reference: "" },
        operation,
      ),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
    expect(
      unlinkedIncidentSchema.safeParse({
        ...row(),
        link_state: "linked_to_existing_payment",
        link: null,
      }).success,
    ).toBe(false);
  });
  it("discards closed or aborted contexts without another RPC", async () => {
    const f = fixture(),
      controller = new AbortController(),
      client = await createUnlinkedIncidentClient(
        f.client,
        user,
        controller.signal,
      );
    await client.capabilities();
    controller.abort();
    await expect(client.list()).rejects.toMatchObject({ kind: "cancelled" });
    client.close();
    await expect(client.detail(caseId)).rejects.toMatchObject({
      kind: "cancelled",
    });
    expect(f.calls).toHaveLength(1);
  });
});
