import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  financialFixture,
  financialQuery,
  type FinancialObject,
} from "./stripe-financial-fixtures";
import {
  incidentAccount,
  incidentAdmin,
  incidentAdminSid,
  incidentNow,
  withDbRole,
  type Json,
  type PaidFixture,
} from "./subscription-financial-db";
import type { StripeFinancialIncident } from "../../supabase/functions/_shared/subscription-financial-incidents";
import type { StripeOwnedCheckout } from "../../supabase/functions/_shared/subscription-unlinked-ownership";

let sequence = 0;
export async function pendingNativePayment(
  db: PGlite,
  monthly = false,
): Promise<PaidFixture> {
  const suffix = "Unlinked" + ++sequence,
    user = randomUUID(),
    request = randomUUID(),
    checkout = "cs_test_" + suffix;
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
    [
      user,
      suffix + "@example.invalid",
      JSON.stringify({
        truckcontrol_registration: {
          contact_name: "Synthetic Pending Buyer",
          company_name: "Synthetic Pending Company",
          tax_id: "SYNTHETIC-PENDING-" + sequence,
          address: "Synthetic private test address 123",
          phone: "+1202555" + String(10000 + sequence),
          requested_plan: "limited",
        },
      }),
    ],
  );
  const company = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [user],
    )
  ).rows[0].id;
  await db.query(
    "insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents) select $1,$2,id,36300,revision,'checkout',$3,30000,2100,6300 from private.tc_plans where id='limited'",
    [request, user, checkout],
  );
  const invoice = monthly ? "in_" + suffix : null,
    subscription = monthly ? "sub_" + suffix : null;
  const customer = "cus_" + suffix,
    pi = "pi_" + suffix,
    charge = "ch_" + suffix;
  const periodStart = monthly ? incidentNow - 30 * 86400 : null,
    periodEnd = monthly ? incidentNow : null;
  const event = "evt_Paid" + suffix,
    kind = monthly ? "subscription_invoice" : "initial_payment";
  const proof: Json = {
    provider_event_id: event,
    provider_event_type: monthly
      ? "invoice.paid"
      : "checkout.session.completed",
    provider_event_created: incidentNow - 10,
    provider_payment_id: invoice ?? pi,
    request_id: request,
    user_id: user,
    company_id: company,
    amount_cents: 36300,
    currency: "EUR",
    paid_at: new Date((incidentNow - 15) * 1000).toISOString(),
    livemode: false,
    checkout_id: checkout,
    customer_id: customer,
  };
  if (monthly) {
    await db.query(
      "insert into private.tc_subscription_orders(user_id,request_id,checkout_id,terms_version) values($1,$2,$3,'synthetic-v1')",
      [user, request, checkout],
    );
    Object.assign(proof, {
      invoice_id: invoice,
      subscription_id: subscription,
      invoice_period_start: periodStart,
      invoice_period_end: periodEnd,
      subscription_current_period_end: periodEnd,
      unit_amount: 36300,
      subscription_state: "active",
      cancel_at_period_end: false,
      billing_reason: "subscription_create",
    });
  }
  return {
    user,
    request,
    company,
    checkout,
    customer,
    pi,
    charge,
    invoice,
    subscription,
    event,
    kind,
    proof,
    task: randomUUID(),
    periodStart,
    periodEnd,
  };
}
export const ownedBinding = (payment: PaidFixture): StripeOwnedCheckout => ({
  request_id: payment.request,
  user_id: payment.user,
  checkout_id: payment.checkout,
  mode: payment.invoice ? "subscription" : "payment",
});
export async function ingestUnlinked(
  db: PGlite,
  data: StripeFinancialIncident,
  binding: StripeOwnedCheckout | null = null,
  account = incidentAccount,
) {
  return withDbRole(
    db,
    "service_role",
    async () =>
      (
        await db.query<{ result: Json }>(
          "select public.tc_subscription_incident_ingest($1,'test',$2::jsonb,$3::jsonb) result",
          [
            account,
            JSON.stringify(data),
            binding === null ? null : JSON.stringify(binding),
          ],
        )
      ).rows[0].result,
  );
}
export async function commitPreviouslyReconciledPayment(
  db: PGlite,
  payment: PaidFixture,
) {
  const result = await withDbRole(
    db,
    "service_role",
    async () =>
      (
        await db.query<{ result: Json }>(
          "select public.tc_manual_subscription_apply_payment($1,$2,$3::jsonb) result",
          [payment.kind, incidentAccount, JSON.stringify(payment.proof)],
        )
      ).rows[0].result,
  );
  payment.task = String(result.task_id);
}
export async function unlinkedAdmin(
  db: PGlite,
  action: string,
  id: string | null = null,
  expected: number | null = null,
  operation: string | null = null,
  data: Json = {},
  user = incidentAdmin,
  sid: string | null = incidentAdminSid,
) {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [
      user,
      JSON.stringify({
        sub: user,
        role: "authenticated",
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
          "select public.tc_admin_subscription_unlinked($1,$2::uuid,$3::bigint,$4::uuid,$5::jsonb,null::uuid) result",
          [action, id, expected, operation, JSON.stringify(data)],
        )
      ).rows[0].result,
  );
}
export function ownedProviderFixture(
  payment: PaidFixture,
  type = "refund.created",
) {
  const fixture = financialFixture(type),
    suffix = payment.pi.slice(3);
  const mapped = JSON.parse(
    JSON.stringify({
      event: fixture.event,
      records: fixture.records,
    }).replaceAll("FinancialOriginal", suffix),
  ) as {
    event: FinancialObject;
    records: Record<string, FinancialObject>;
  };
  for (const key of Object.keys(fixture.records)) delete fixture.records[key];
  Object.assign(fixture.records, mapped.records);
  Object.assign(fixture.event, mapped.event);
  fixture.records["events/" + fixture.event.id] = fixture.event;
  fixture.records.account.id = incidentAccount;
  const query = financialQuery.replaceAll("FinancialOriginal", suffix);
  if (!payment.invoice) fixture.records[query].data = [];
  else {
    const invoice = fixture.records["invoices/" + payment.invoice];
    const details = (
      invoice.parent as { subscription_details: { metadata: FinancialObject } }
    ).subscription_details;
    details.metadata = {
      tc_request_id: payment.request,
      tc_user_id: payment.user,
    };
    const line = (invoice.lines as { data: FinancialObject[] }).data[0];
    line.period = { start: payment.periodStart, end: payment.periodEnd };
  }
  const session = {
    id: payment.checkout,
    object: "checkout.session",
    livemode: false,
    currency: "eur",
    status: "complete",
    mode: payment.invoice ? "subscription" : "payment",
    payment_status: payment.invoice ? "no_payment_required" : "paid",
    amount_total: payment.invoice ? 0 : 36300,
    payment_intent: payment.invoice ? null : payment.pi,
    subscription: payment.subscription,
    customer: payment.customer,
    metadata: { tc_user_id: payment.user, tc_request_id: payment.request },
  };
  const checkoutQuery =
    "checkout/sessions?" +
    (payment.invoice
      ? "subscription=" + payment.subscription
      : "payment_intent=" + payment.pi) +
    "&limit=2";
  fixture.records[checkoutQuery] = {
    object: "list",
    has_more: false,
    data: [session],
  };
  return { ...fixture, checkoutQuery, session };
}
