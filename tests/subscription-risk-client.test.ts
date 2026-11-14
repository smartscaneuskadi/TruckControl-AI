import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import { createRiskSignalClient } from "../src/integrations/supabase/subscription-risk-signals";
import {
  riskCapabilitiesSchema,
  riskEntrySchema,
  riskSignalCaseSchema,
} from "../src/domain/subscription-risk-signals";
import {
  riskUiRow,
  riskUiActor as actor,
  riskUiStamp as stamp,
} from "./helpers/risk-ui-fixture";
const contract = "subscription-risk-v1",
  operation = "ab660000-0000-4000-8000-000000000001";
function fixture() {
  const state = {
    token: "synthetic-token-v1",
    user: actor,
    verified: true,
    code: "",
    throwing: false,
    beforeReply: null as (() => void) | null,
    corrupt: null as ((value: unknown) => unknown) | null,
    row: riskUiRow(),
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
        error: state.verified ? null : { message: "private-revoked" },
      })),
    },
    rpc: vi.fn((name: string, params: Record<string, unknown>) => {
      const call = { name, params, authorization: "" };
      calls.push(call);
      const query = {
        setHeader(_key: string, value: string) {
          call.authorization = value;
          return query;
        },
        abortSignal() {
          return query;
        },
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          return Promise.resolve()
            .then(() => {
              if (state.throwing) throw Error("private-transport-detail");
              if (state.code)
                return {
                  data: null,
                  error: {
                    code: state.code,
                    message: "PRIVATE-DO-NOT-DISPLAY",
                  },
                };
              let value: unknown;
              if (params.p_action === "capabilities")
                value = {
                  contract,
                  available: true,
                  informational_only: true,
                  refunds_available: false,
                  license_changes_available: false,
                  fiscal_emission_available: false,
                };
              else if (
                params.p_action === "list" ||
                params.p_action === "detail"
              )
                value = { contract, items: [state.row], next_cursor: null };
              else if (params.p_action === "history")
                value = {
                  contract,
                  case_id: state.row.id,
                  items: state.row.last_review
                    ? [state.row.last_review, state.row.latest_provider]
                    : [state.row.latest_provider],
                  next_before_version: null,
                };
              else {
                const note = (params.p_data as { note: string }).note;
                const review = riskEntrySchema.parse({
                  id: "ab770000-0000-4000-8000-000000000001",
                  row_version: 3,
                  kind: "review",
                  actor_id: actor,
                  created_at: stamp,
                  provider: null,
                  note,
                });
                value = {
                  contract,
                  case: {
                    ...state.row,
                    row_version: 3,
                    review_state: "reviewed",
                    last_review: review,
                  },
                  replayed: false,
                  operation: {
                    id: params.p_operation_id,
                    actor_id: actor,
                    expected_version: params.p_expected,
                    applied_version: 3,
                    note,
                  },
                };
              }
              state.beforeReply?.();
              return {
                data: state.corrupt ? state.corrupt(value) : value,
                error: null,
              };
            })
            .then(resolve, reject);
        },
      };
      return query;
    }),
  };
  return {
    state,
    calls,
    client: client as unknown as SupabaseClient<Database>,
  };
}
describe("token-bound Root early fraud warning client", () => {
  it("opens only the explicitly informational contract and pins the verified bearer", async () => {
    const f = fixture(),
      api = await createRiskSignalClient(f.client, actor);
    expect(await api.capabilities()).toMatchObject({
      informational_only: true,
      refunds_available: false,
    });
    expect((await api.list()).items[0]).toEqual(f.state.row);
    expect(
      f.calls.every(
        (c) =>
          c.name === "tc_admin_subscription_risk" &&
          c.authorization === "Bearer synthetic-token-v1",
      ),
    ).toBe(true);
  });
  it("refuses listings before the schema capability is accepted", async () => {
    const f = fixture(),
      api = await createRiskSignalClient(f.client, actor);
    await expect(api.list()).rejects.toMatchObject({ kind: "unavailable" });
    expect(f.calls).toHaveLength(0);
  });
  it.each(["token", "user", "verified"])(
    "rejects a changed %s before any RPC",
    async (key) => {
      const f = fixture(),
        api = await createRiskSignalClient(f.client, actor);
      await api.capabilities();
      f.calls.length = 0;
      if (key === "token") f.state.token = "replacement-token";
      if (key === "user") f.state.user = "ab110000-0000-4000-8000-000000000002";
      if (key === "verified") f.state.verified = false;
      await expect(api.list()).rejects.toMatchObject({ kind: "denied" });
      expect(f.calls).toHaveLength(0);
    },
  );
  it.each(["token", "closed", "abort"])(
    "discards delayed responses after %s",
    async (how) => {
      const f = fixture(),
        controller = new AbortController(),
        api = await createRiskSignalClient(f.client, actor, controller.signal);
      await api.capabilities();
      f.state.beforeReply = () => {
        if (how === "token") f.state.token = "changed";
        if (how === "closed") api.close();
        if (how === "abort") controller.abort();
      };
      await expect(api.list()).rejects.toMatchObject({
        kind: how === "token" ? "denied" : "cancelled",
      });
    },
  );
  it.each(["42501", "PGRST202", "40001", "22023"])(
    "maps %s to a safe fixed error",
    async (code) => {
      const f = fixture(),
        api = await createRiskSignalClient(f.client, actor);
      await api.capabilities();
      f.state.code = code;
      await expect(api.list()).rejects.toMatchObject({
        kind:
          code === "42501"
            ? "denied"
            : code === "PGRST202"
              ? "unavailable"
              : code === "40001"
                ? "conflict"
                : "invalid",
      });
      try {
        await api.list();
      } catch (e) {
        expect(String(e)).not.toContain("PRIVATE");
      }
    },
  );
  it("rejects another warning/tenant in a detail response instead of displaying a mismatched case", async () => {
    const f = fixture(),
      api = await createRiskSignalClient(f.client, actor);
    await api.capabilities();
    const before = structuredClone(f.state.row);
    f.state.row.buyer_company_id = "ab440000-0000-4000-8000-000000000002";
    await expect(api.detail(before)).rejects.toMatchObject({ kind: "invalid" });
  });
  it("rejects duplicate or unordered page identifiers and malformed risk semantics", async () => {
    const f = fixture(),
      api = await createRiskSignalClient(f.client, actor);
    await api.capabilities();
    f.state.corrupt = (value) => {
      const v = value as { items: unknown[] };
      return { ...v, items: [f.state.row, f.state.row] };
    };
    await expect(api.list()).rejects.toMatchObject({ kind: "invalid" });
    expect(
      riskCapabilitiesSchema.safeParse({
        contract,
        available: true,
        informational_only: false,
        refunds_available: true,
        license_changes_available: false,
        fiscal_emission_available: false,
      }).success,
    ).toBe(false);
    expect(
      riskSignalCaseSchema.safeParse({ ...f.state.row, amount_cents: 999 })
        .success,
    ).toBe(false);
  });
  it("rejects crossed audit pages, reverse ordering and foreign warning references", async () => {
    const f = fixture(),
      api = await createRiskSignalClient(f.client, actor);
    await api.capabilities();
    for (const mutate of [
      (v: Record<string, unknown>) => ({ ...v, case_id: operation }),
      (v: Record<string, unknown>) => ({
        ...v,
        items: [f.state.row.latest_provider, f.state.row.latest_provider],
      }),
      (v: Record<string, unknown>) => ({
        ...v,
        items: [
          {
            ...f.state.row.latest_provider,
            provider: {
              ...f.state.row.latest_provider.provider,
              warning_id: "issfr_Foreign",
            },
          },
        ],
      }),
    ]) {
      f.state.corrupt = (value) => mutate(value as Record<string, unknown>);
      await expect(api.history(f.state.row)).rejects.toMatchObject({
        kind: "invalid",
      });
    }
  });
  it("verifies the exact review operation, actor, CAS and original owned payment binding", async () => {
    const f = fixture(),
      api = await createRiskSignalClient(f.client, actor);
    await api.capabilities();
    expect(
      await api.review(f.state.row, { note: "Synthetic review" }, operation),
    ).toMatchObject({
      replayed: false,
      operation: {
        id: operation,
        actor_id: actor,
        expected_version: 2,
        applied_version: 3,
        note: "Synthetic review",
      },
    });
    for (const mutate of [
      (v: Record<string, unknown>) => ({
        ...v,
        case: { ...(v.case as object), buyer_company_id: operation },
      }),
      (v: Record<string, unknown>) => ({
        ...v,
        operation: { ...(v.operation as object), actor_id: operation },
      }),
      (v: Record<string, unknown>) => ({
        ...v,
        operation: { ...(v.operation as object), expected_version: 3 },
      }),
      (v: Record<string, unknown>) => ({
        ...v,
        operation: { ...(v.operation as object), note: "Different review" },
      }),
    ]) {
      f.state.corrupt = (value) => mutate(value as Record<string, unknown>);
      await expect(
        api.review(f.state.row, { note: "Synthetic review" }, operation),
      ).rejects.toMatchObject({ kind: "uncertain" });
    }
  });
  it("keeps transport failures uncertain for explicit same-operation retry, with no automatic retry", async () => {
    const f = fixture(),
      api = await createRiskSignalClient(f.client, actor);
    await api.capabilities();
    f.state.throwing = true;
    const count = f.calls.length;
    await expect(
      api.review(f.state.row, { note: "Synthetic review" }, operation),
    ).rejects.toMatchObject({ kind: "uncertain" });
    expect(f.calls).toHaveLength(count + 1);
  });
});
