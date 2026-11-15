# Production health monitor — evidence boundaries

The script `scripts/production-health.mjs` performs five public, non-billable HTTP checks: the three allowed production release manifests, the public AI specialist contract, and a Supabase REST request **without an API key**.

## Important distinction

A 401 or 403 response from the REST gateway **without an API key** proves only that this particular no-key request was rejected. It does **not** establish that RLS is enabled, that anonymous requests **with** the publishable key cannot read private data, or that roles and tenant boundaries are correct. The check now reports `missing_api_key_denied` and `rls_verified: false` even when the health probe passes.

The monitor must not be presented as an RLS audit, a paid-provider acceptance, a managed restore, or an end-to-end customer transaction. It sends no user credentials and does not issue model calls.

For RLS acceptance, use independent tests with intentionally scoped **test users** and the normal publishable key against a disposable or approved non-production environment, plus database policy review and explicit cross-tenant denial cases. Never bypass RLS, use service-role keys in a public probe, or include secrets in CI logs.

A successful monitor result does not authorize commercial launch or enable billing. Continue to require real Stripe, fiscal issuance/delivery, Google public consent, managed recovery, device/signature, and legal approvals. Production Sites44 remains unchanged.
