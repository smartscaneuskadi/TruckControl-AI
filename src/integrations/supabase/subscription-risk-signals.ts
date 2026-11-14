import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { SubscriptionIncidentError as Failure } from "./subscription-incidents";
import {
  riskCapabilitiesSchema,
  riskPageSchema,
  riskHistorySchema,
  riskMutationSchema,
  riskReviewInputSchema,
  sameRiskBinding,
} from "../../domain/subscription-risk-signals";
import type { RiskSignalCase } from "../../domain/subscription-risk-signals";

/** Human-token-bound, memory-only scope. No cross-user or offline cache. */
export async function createRiskSignalClient(
  client: SupabaseClient<Database>,
  userId: string,
  signal?: AbortSignal,
) {
  z.uuid().parse(userId);
  const initial = await client.auth.getSession().catch(() => {
    throw new Failure("unavailable");
  });
  const token = initial.data.session?.access_token;
  if (initial.error || initial.data.session?.user.id !== userId || !token)
    throw new Failure("denied");
  let closed = false,
    available = false;
  async function live() {
    if (closed || signal?.aborted) throw new Failure("cancelled");
    try {
      const before = await client.auth.getSession(),
        verified = await client.auth.getUser(token),
        after = await client.auth.getSession();
      if (
        before.error ||
        after.error ||
        verified.error ||
        verified.data.user?.id !== userId ||
        before.data.session?.user.id !== userId ||
        after.data.session?.user.id !== userId ||
        before.data.session.access_token !== token ||
        after.data.session.access_token !== token
      )
        throw new Failure("denied");
      if (closed || signal?.aborted) throw new Failure("cancelled");
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure("unavailable");
    }
  }
  await live();
  async function request(
    action: string,
    id: string | null = null,
    expected: number | null = null,
    operation: string | null = null,
    data: Json = {},
    after: string | null = null,
  ) {
    const writing = action === "review";
    if (closed || signal?.aborted) throw new Failure("cancelled");
    if (action !== "capabilities" && !available)
      throw new Failure("unavailable");
    await live();
    try {
      const query = client
        .rpc("tc_admin_subscription_risk", {
          p_action: action,
          p_case_id: id,
          p_expected: expected,
          p_operation_id: operation,
          p_data: data,
          p_after: after,
        })
        .setHeader("Authorization", "Bearer " + token);
      const result = await (signal ? query.abortSignal(signal) : query);
      if (result.error || result.data === null) {
        const code = result.error?.code;
        throw new Failure(
          code === "42501" || code === "PGRST301"
            ? "denied"
            : code === "PGRST202" || code === "42883"
              ? "unavailable"
              : code === "40001"
                ? "conflict"
                : code === "22023" || code === "23514"
                  ? "invalid"
                  : writing
                    ? "uncertain"
                    : "unavailable",
        );
      }
      try {
        await live();
      } catch (error) {
        if (writing && error instanceof Failure && error.kind === "unavailable")
          throw new Failure("uncertain");
        throw error;
      }
      return result.data;
    } catch (error) {
      if (error instanceof Failure) throw error;
      if (closed || signal?.aborted) throw new Failure("cancelled");
      throw new Failure(writing ? "uncertain" : "unavailable");
    }
  }
  return {
    close() {
      closed = true;
      available = false;
    },
    async capabilities() {
      const result = riskCapabilitiesSchema.safeParse(
        await request("capabilities"),
      );
      if (!result.success) throw new Failure("unavailable");
      available = result.data.available;
      return result.data;
    },
    async list(after: string | null = null) {
      if (after !== null) z.uuid().parse(after);
      const result = riskPageSchema.safeParse(
        await request("list", null, null, null, {}, after),
      );
      if (!result.success) throw new Failure("invalid");
      const page = result.data,
        ids = page.items.map((x) => x.id);
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id, n) =>
          n ? id <= ids[n - 1] : after !== null && id <= after,
        ) ||
        (page.next_cursor !== null && page.next_cursor !== ids.at(-1))
      )
        throw new Failure("invalid");
      return page;
    },
    async detail(before: RiskSignalCase) {
      const result = riskPageSchema.safeParse(
        await request("detail", before.id),
      );
      if (
        !result.success ||
        result.data.items.length !== 1 ||
        result.data.next_cursor !== null ||
        !sameRiskBinding(before, result.data.items[0])
      )
        throw new Failure("invalid");
      return result.data.items[0];
    },
    async history(before: RiskSignalCase, cursor: number | null = null) {
      if (cursor !== null)
        z.number()
          .int()
          .min(2)
          .max(Number.MAX_SAFE_INTEGER - 1)
          .parse(cursor);
      const result = riskHistorySchema.safeParse(
        await request(
          "history",
          before.id,
          null,
          null,
          cursor === null ? {} : { before_version: cursor },
        ),
      );
      if (!result.success || result.data.case_id !== before.id)
        throw new Failure("invalid");
      const page = result.data,
        rows = page.items;
      if (
        new Set(rows.map((x) => x.id)).size !== rows.length ||
        rows.some(
          (item, n) =>
            (cursor !== null && item.row_version >= cursor) ||
            (n > 0 && item.row_version >= rows[n - 1].row_version) ||
            (item.provider !== null &&
              (item.provider.warning_id !== before.warning_id ||
                item.provider.payment_intent_id !==
                  before.latest_provider.provider?.payment_intent_id ||
                item.provider.charge_id !==
                  before.latest_provider.provider?.charge_id)),
        ) ||
        (page.next_before_version !== null &&
          page.next_before_version !== rows.at(-1)?.row_version)
      )
        throw new Failure("invalid");
      return page;
    },
    async review(before: RiskSignalCase, input: unknown, operationId: string) {
      z.uuid().parse(operationId);
      const data = riskReviewInputSchema.parse(input);
      const result = riskMutationSchema.safeParse(
        await request(
          "review",
          before.id,
          before.row_version,
          operationId,
          data,
        ),
      );
      if (!result.success) throw new Failure("uncertain");
      const value = result.data,
        op = value.operation;
      if (
        !sameRiskBinding(before, value.case) ||
        value.case.row_version < op.applied_version ||
        op.id !== operationId ||
        op.actor_id !== userId ||
        op.expected_version !== before.row_version ||
        op.applied_version !== before.row_version + 1 ||
        op.note !== data.note
      )
        throw new Failure("uncertain");
      return value;
    },
  };
}
export type RiskSignalClient = Awaited<
  ReturnType<typeof createRiskSignalClient>
>;
