import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { SubscriptionIncidentError as Failure } from "./subscription-incidents";
import {
  unlinkedCapabilitiesSchema,
  unlinkedDeclarationSchema,
  unlinkedHistorySchema,
  unlinkedMutationSchema,
  unlinkedPageSchema,
} from "../../domain/subscription-unlinked-incidents";
import type {
  UnlinkedAction,
  UnlinkedDeclaration,
  UnlinkedIncident,
} from "../../domain/subscription-unlinked-incidents";

/** No cache/storage; authorization is pinned to a verified human token and SID. */
export async function createUnlinkedIncidentClient(
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
        verified = await client.auth.getUser(token);
      const after = await client.auth.getSession();
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
    const writing = action === "review" || action === "dismiss";
    if (closed || signal?.aborted) throw new Failure("cancelled");
    if (action !== "capabilities" && !available)
      throw new Failure("unavailable");
    await live();
    try {
      const query = client
        .rpc("tc_admin_subscription_unlinked", {
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
                : code === "23514" || code === "22023"
                  ? "invalid"
                  : writing
                    ? "uncertain"
                    : "unavailable",
        );
      }
      await live();
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
      const parsed = unlinkedCapabilitiesSchema.safeParse(
        await request("capabilities"),
      );
      if (!parsed.success) throw new Failure("unavailable");
      available = parsed.data.available;
      return parsed.data;
    },
    async list(after: string | null = null) {
      if (after !== null) z.uuid().parse(after);
      const parsed = unlinkedPageSchema.safeParse(
        await request("list", null, null, null, {}, after),
      );
      if (!parsed.success) throw new Failure("invalid");
      const ids = parsed.data.items.map((item) => item.id);
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id, n) =>
          n ? id <= ids[n - 1] : after !== null && id <= after,
        ) ||
        (parsed.data.next_cursor !== null &&
          parsed.data.next_cursor !== ids.at(-1))
      )
        throw new Failure("invalid");
      return parsed.data;
    },
    async detail(id: string) {
      z.uuid().parse(id);
      const parsed = unlinkedPageSchema.safeParse(await request("detail", id));
      if (
        !parsed.success ||
        parsed.data.items.length !== 1 ||
        parsed.data.items[0].id !== id ||
        parsed.data.next_cursor !== null
      )
        throw new Failure("invalid");
      return parsed.data.items[0];
    },
    async history(id: string, before: number | null = null) {
      z.uuid().parse(id);
      if (before !== null)
        z.number()
          .int()
          .min(2)
          .max(Number.MAX_SAFE_INTEGER - 1)
          .parse(before);
      const parsed = unlinkedHistorySchema.safeParse(
        await request(
          "history",
          id,
          null,
          null,
          before === null ? {} : { before_version: before },
        ),
      );
      if (!parsed.success || parsed.data.case_id !== id)
        throw new Failure("invalid");
      const items = parsed.data.items;
      if (
        new Set(items.map((item) => item.id)).size !== items.length ||
        items.some(
          (item, n) =>
            (before !== null && item.row_version >= before) ||
            (n > 0 && item.row_version >= items[n - 1].row_version),
        ) ||
        (parsed.data.next_before_version !== null &&
          parsed.data.next_before_version !== items.at(-1)?.row_version)
      )
        throw new Failure("invalid");
      return parsed.data;
    },
    async mutate(
      before: UnlinkedIncident,
      action: UnlinkedAction,
      input: UnlinkedDeclaration,
      operationId: string,
    ) {
      z.enum(["review", "dismiss"]).parse(action);
      z.uuid().parse(operationId);
      const data = unlinkedDeclarationSchema.parse(input);
      const parsed = unlinkedMutationSchema.safeParse(
        await request(action, before.id, before.row_version, operationId, data),
      );
      if (!parsed.success) throw new Failure("uncertain");
      const result = parsed.data,
        op = result.operation;
      if (
        result.case.id !== before.id ||
        result.case.request_id !== before.request_id ||
        result.case.buyer_company_id !== before.buyer_company_id ||
        result.case.payment_intent_id !== before.payment_intent_id ||
        result.case.checkout_id !== before.checkout_id ||
        result.case.charge_id !== before.charge_id ||
        result.case.invoice_id !== before.invoice_id ||
        result.case.subscription_id !== before.subscription_id ||
        result.case.period_start !== before.period_start ||
        result.case.period_end !== before.period_end ||
        result.case.amount_cents !== before.amount_cents ||
        result.case.row_version < op.applied_version ||
        op.id !== operationId ||
        op.action !== action ||
        op.actor_id !== userId ||
        op.expected_version !== before.row_version ||
        op.applied_version !== before.row_version + 1 ||
        op.reason !== data.reason ||
        op.evidence_reference !== data.evidence_reference
      )
        throw new Failure("uncertain");
      return result;
    },
  };
}
export type UnlinkedIncidentClient = Awaited<
  ReturnType<typeof createUnlinkedIncidentClient>
>;
