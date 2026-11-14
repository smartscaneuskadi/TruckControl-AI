> 14/11/2026: Published safely in Sites43/incidents7, with native schema70 and private Root review. The provider receiver switch remains OFF; no live EFW/provider acceptance is claimed. [Final receipt](verification/commercial-safe-update43-20261114.json).

# Native schema checkpoint · 2026-11-14

Migration70 is now applied once as `20261114083944_subscription_early_fraud_signals.sql`, with exactly the CLI candidate SQL hash. New ledger is empty, private and RLS protected; the receiver acceptance switch remains OFF. The integrated PostgreSQL run43576215731 passed250checks including28real contention checks and two logical restores. This does not establish provider delivery or commercial acceptance. [Native receipt](verification/supabase-migrations-70-71-20261114.json). The child-candidate history below retains its original timestamps.

# Early fraud warning observations (candidate, OFF)

This change adds a real implementation path for Radar warnings to the existing
`truckcontrol-stripe-incidents` worker. It does **not** demonstrate that a Stripe
receiver delivered an event, enable commercial collection, change a licence,
issue a fiscal invoice, refund a payment, or establish that fraud/loss occurred.

The eight IA acceptances, monthly IA budget (10 USD), per-company quota (100),
69 applied migrations, Sites42, rollback41 and demo6 are outside this change.
No paid provider call, purchase, credential creation or remote write was made.
The accumulated EUR200 budget remains unreconciled; no remaining balance is assumed.

## Provider evidence and pinned version

The runtime remains on `2025-03-31.basil`; it was not upgraded.

- [Early Fraud Warning object, Basil](https://docs.stripe.com/api/radar/early_fraud_warnings/object?api-version=2025-03-31.basil): `issfr_`, object `radar.early_fraud_warning`, `charge`, nullable `payment_intent`, `created`, `fraud_type`, `actionable`, `livemode`.
- [Event types, Basil](https://docs.stripe.com/api/events/types?api-version=2025-03-31.basil): both `radar.early_fraud_warning.created` and `radar.early_fraud_warning.updated` are documented.
- [Early fraud warnings](https://docs.stripe.com/disputes/how-disputes-work#early-fraud-warnings): a warning does not require a response and is distinct from a dispute. It can arrive after a dispute/refund. We never interpret `actionable=false` as a monetary outcome.
- [Subscription risk events](https://docs.stripe.com/billing/subscriptions/webhooks#refund-events).

The official Stripe documentation search was used first. Its object/event searches
returned unrelated pages, so the two exact public Basil references were read over
verified HTTPS on 2026-11-14. SHA256 of the captured HTML (not secret/account data):
object `38233bee923482e3a47a83430a66b24c8c50a2384849372a0d49b12797946a41`;
events `36caa358221a78d469c52da20d335d0d7ee6a6779e990c4e67f350417a583b1e`.

## Bounded authenticated path

1. The existing endpoint rejects browser Origin, non-POST, oversized/non-JSON requests and disabled controls.
2. The untrusted input type only chooses a verifier. The verifier checks HMAC, key mode, expected account, signed event mode/account and the canonically fetched immutable Event before processing any warning object.
3. Fixed-origin GETs retrieve warning, Charge, PaymentIntent, paid InvoicePayment and (when recurring) the exact historical invoice and subscription. Redirects are forbidden, response/body/time limits remain in place. At most eight GETs; no list pagination, polling, provider mutation, latest-invoice ownership or metadata authority.
4. Only captured, succeeded, full EUR payments using the existing supported charge graph can be observed. Ambiguous InvoicePayments, foreign identity and unresolvable graphs fail closed. Broader payment graphs are not silently treated as supported.
5. The service-only SQL recorder matches an immutable native paid receipt and its actual fiscal task, original buyer/request/company, account/mode, quote, customer and historical monthly period. No client can choose a company/task, and a warning cannot be rebound to another genuine payment.
6. Missing paid receipts/tasks or failed SQL transactions return retriable HTTP503, never a successful acknowledgement. Stripe retries are bounded by Stripe's policy; exhausted deliveries require operator reconciliation/resend through the provider, not a fabricated local payment.

## One append-only ledger, separate from refunds/disputes

CLI3 generated `20261114075854_subscription_early_fraud_signals.sql`. It is a
**new unapplied candidate**; no previous migration or financial DTO was edited.
One private table stores provider/review entries, with a self-referencing first
observation as the stable case anchor. Every row retains the actual task/receipt.
RLS is restrictive deny-all; table access is revoked for clients and service_role.
Only the guarded service RPC may record and only a live verified Root SID may
read/review through the invoker wrapper. Definers have an empty search path.

The task lock serializes provider deliveries; the first immutable entry lock
serializes reviews. Immutable event proofs deduplicate replays and exclude only
mutable current GET fields. Root notes use expected-version CAS and an exact
actor-bound operation UUID. New provider observations reopen review. Update,
delete and truncate are forbidden, including for the owner. Prior refund/dispute
ledgers remain unchanged; there is no warning loss total or rectification action.

Admin → Incidencias de pagos shows a separate informational section, original
payment amount explicitly **not a loss**, observed-at timestamps, exact provider
IDs, audit and review notes. Replies are bound to the verified browser token;
logout, token change, close, denied access and offline transitions discard private
data. Nothing enters WebStorage or the offline queue. An uncertain review retries
only the same UUID/version/note after an explicit action.

Translations are supplied separately in
`docs/i18n/stripe-risk-signals-20261114.json` for integration with concurrent locale
edits. The isolated child branch has not modified shared locale dictionaries.

## Acceptance and rollout

The additive switch `TRUCKCONTROL_STRIPE_RISK_SIGNALS_SCHEMA_ACCEPTED` defaults to
false/absent and is independent of `TRUCKCONTROL_STRIPE_INCIDENTS_ENABLED` and its
existing schema gate. The branch **does not set any flag** or modify a Stripe
event destination. Before enabling in an authorized isolated instance:

1. Integrate/review both the code and locale additions, run composite CI and the real PostgreSQL contract/restore harness.
2. Confirm remote history, review the exact new SQL bytes, obtain any required official platform approval, and apply only this new migration once in the exclusive TruckControl project. Never repeat migrations68/69.
3. Deploy the existing incidents worker with the additional dependencies; use the current server-side key/Vault/signing secret, never a connector OAuth credential. A restricted key needs only the required read privileges, including Radar early fraud warnings.
4. Configure only the two acted-on warning events on the authorized incident receiver, with Basil snapshot semantics, expected account/mode and a matching signing secret. No new public endpoint.
5. Run an authorized sandbox provider delivery through the actual receiver, native receipt mapping and Root UI, including duplicate/unmapped/persistence failure checks. Fixtures cannot substitute for this acceptance.
6. Enable the separate acceptance switch only after those checks, with commercial collection still governed by its independent approvals. Record a sanitized receipt.

If recovery is necessary, turn the new switch OFF and restore the existing worker
source (incidents6 before this candidate). Preserve every ledger row and all old
versions; **do not drop tables or undo applied data**. The new frontend handles a
missing schema as unavailable without exposing private errors.

Fiscal/tax treatment is unchanged: existing EUR quotes retain approved VAT21%
and manual GDTaller/TicketBAI invoicing. This informational feature does not enable
Stripe Tax, fiscal emission, or replace the pending commercial fiscal acceptance.

## Verification limits

Focal Vitest/PGlite and browser results are recorded in
`docs/verification/stripe-risk-signals-candidate-20261114.json`. Browser QA uses
the real Supabase SDK with a private synthetic transport and blocked unhandled
provider requests, Windows/Android browser emulation, both themes and axe checks.
It is not a physical-device or real-Stripe acceptance. The PostgreSQL module
`tests/postgres/risk_signal_contracts.py` exports `run(pg, financial)` for the
existing isolated harness before dump/restore; IDs90–94 avoid concurrent work.
This child has not executed Docker or a remote migration/deployment.
