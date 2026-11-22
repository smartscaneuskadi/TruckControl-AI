import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import {
  CompanyFullError,
  companyFullErrorMessage,
  listCompanyFull,
  setCompanyFull,
  companyFullHistory,
} from "../src/integrations/supabase/company-full";
import {
  assertCompanyFullPlan,
  fullExpiryDeadline,
  fullExpiryFromInput,
  manualFullSchema,
  readManualFullAccess,
  watchFullExpiry,
} from "../src/domain/company-full";
import type {
  ManualFullState,
  CompanyFullCommand,
} from "../src/domain/company-full";
import { offlinePayload } from "../src/data/offline-vault";
import { createDemo } from "../src/data/demo";
import { demoFeatures } from "../src/domain/subscriptions";
import type { SubscriptionAccess } from "../src/domain/subscriptions";
const root = "10000000-0000-4000-8000-000000000201",
  member = "10000000-0000-4000-8000-000000000204",
  org = "20000000-0000-4000-8000-000000000201";
const stamp = () => new Date().toISOString();
const empty: ManualFullState = {
  schema_version: 1,
  configured: false,
  status: "unconfigured",
  enabled: null,
  expires_at: null,
  revision: 0,
  updated_at: null,
};
const active = (): ManualFullState => ({
  schema_version: 1,
  configured: true,
  status: "active",
  enabled: true,
  expires_at: null,
  revision: 1,
  updated_at: stamp(),
});
const jwt = (id: string) =>
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      aud: "authenticated",
      role: "authenticated",
      session_id: "synthetic-native-session",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url") +
  ".c3ludGhldGlj";
async function fixture(actor = root) {
  const issuedToken = jwt(actor);
  const state = {
    manual: structuredClone(empty),
    cap: true,
    version: 1,
    capError: false,
    lost: false,
    conflict: false,
    wrongOrg: false,
    holdUser: false,
    userPending: false,
    holdSet: false,
  };
  let releaseUser = () => {},
    releaseSet = () => {};
  const calls: {
      action: string;
      body: Record<string, unknown>;
      token: string | null;
    }[] = [],
    unmatched: string[] = [];
  const operations = new Map<string, number>();
  let writes = 0;
  const item = () => ({
    organization_id: state.wrongOrg
      ? "20000000-0000-4000-8000-000000000299"
      : org,
    company_name: "Empresa ficticia",
    owner_id: member,
    owner_email: "owner@example.com",
    manual_full: state.manual,
    effective_active: state.manual.status === "active",
    effective_plan: "full",
  });
  const user = () => ({
    id: actor,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.com",
    user_metadata: { is_admin: true, paid_plan: "full" },
    app_metadata: {},
    created_at: stamp(),
  });
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (url.origin !== "http://127.0.0.1:9999") {
      unmatched.push(request.url);
      throw Error("Unmatched synthetic HTTP");
    }
    let data: unknown = null,
      status = 200;
    if (url.pathname === "/auth/v1/user") {
      if (state.holdUser) {
        state.userPending = true;
        await new Promise<void>((resolve) => {
          releaseUser = resolve;
        });
      }
      data = user();
    } else if (url.pathname === "/rest/v1/rpc/tc_admin_company_full") {
      const body = (await request.json()) as Record<string, unknown>,
        action = String(body.p_action);
      calls.push({ action, body, token: request.headers.get("authorization") });
      if (actor !== root) {
        status = 403;
        data = { code: "42501", message: "Private diagnostic" };
      } else if (action === "capabilities") {
        status = state.capError ? 503 : 200;
        data = {
          schema_version: state.version,
          manual_company_full: state.cap,
          observed_at: stamp(),
        };
      } else if (action === "list")
        data = {
          schema_version: 1,
          observed_at: stamp(),
          items: [item()],
          next_after: null,
        };
      else if (action === "history")
        data = {
          schema_version: 1,
          observed_at: stamp(),
          items: [],
          next_before_revision: null,
        };
      else if (action === "set") {
        const operation = String(body.p_operation),
          saved = operations.get(operation);
        if (
          state.conflict ||
          (saved === undefined && body.p_expected !== state.manual.revision)
        ) {
          status = 409;
          data = { code: "40001" };
        } else {
          if (saved === undefined) {
            ++writes;
            const input = body.p_data as {
              enabled: boolean;
              expires_at: string | null;
            };
            state.manual = {
              ...active(),
              enabled: input.enabled,
              status: input.enabled ? "active" : "disabled",
              expires_at: input.expires_at,
              revision: state.manual.revision + 1,
            };
            operations.set(operation, state.manual.revision);
          }
          if (state.lost) {
            state.lost = false;
            throw new Error("Synthetic acknowledgement lost");
          }
          if (state.holdSet)
            await new Promise<void>((resolve) => {
              releaseSet = resolve;
            });
          data = {
            schema_version: 1,
            observed_at: stamp(),
            item: item(),
            operation_id: operation,
            replayed: saved !== undefined,
            applied_revision: operations.get(operation),
          };
        }
      } else {
        unmatched.push(request.url);
        throw Error("Unmatched synthetic action");
      }
    } else {
      unmatched.push(request.url);
      throw Error("Unmatched synthetic HTTP");
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json",
        "x-supabase-api-version": "2024-01-01",
      },
    });
  };
  const client = createClient<Database>(
    "http://127.0.0.1:9999",
    "sb_publishable_synthetic_manual_full",
    {
      auth: {
        persistSession: false,
        detectSessionInUrl: false,
        autoRefreshToken: false,
      },
      global: { fetch: fetcher },
    },
  );
  expect(
    (
      await client.auth.setSession({
        access_token: issuedToken,
        refresh_token: "synthetic-refresh",
      })
    ).error,
  ).toBeNull();
  return {
    client,
    issuedToken,
    calls,
    state,
    unmatched,
    writes: () => writes,
    releaseUser: () => releaseUser(),
    releaseSet: () => releaseSet(),
  };
}
const command = (): CompanyFullCommand => ({
  organizationId: org,
  expected: 0,
  operationId: crypto.randomUUID(),
  enabled: true,
  expiresAt: null,
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("company Full contract with the real native SDK", () => {
  for (const mode of ["false", "version", "unavailable"] as const)
    it(`fails closed on ${mode} capability before any mutation`, async () => {
      const f = await fixture();
      if (mode === "false") f.state.cap = false;
      if (mode === "version") f.state.version = 2;
      if (mode === "unavailable") f.state.capError = true;
      await expect(
        setCompanyFull(f.client, root, () => true, command()),
      ).rejects.toMatchObject({ reason: "capability" });
      expect(f.calls.some((c) => c.action === "set")).toBe(false);
      expect(f.writes()).toBe(0);
      expect(f.unmatched).toEqual([]);
    });
  it("does not elevate a company administrator through editable metadata", async () => {
    const f = await fixture(member);
    await expect(
      listCompanyFull(f.client, member, () => true, ""),
    ).rejects.toMatchObject({ reason: "denied" });
    expect(f.writes()).toBe(0);
    expect(f.unmatched).toEqual([]);
  });
  it("pins the validated native JWT and sends exact CAS/idempotency arguments", async () => {
    const f = await fixture(),
      request = command();
    // Crossing an iat second must not regenerate the expected issued capability.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1_100);
    expect(jwt(root)).not.toBe(f.issuedToken);
    const result = await setCompanyFull(f.client, root, () => true, request);
    expect(result.item.organization_id).toBe(org);
    expect(result.item.manual_full.status).toBe("active");
    expect(f.calls.find((c) => c.action === "set")?.body).toEqual({
      p_action: "set",
      p_org: org,
      p_expected: 0,
      p_operation: request.operationId,
      p_data: { enabled: true, expires_at: null },
    });
    expect(f.calls.every((c) => c.token === "Bearer " + f.issuedToken)).toBe(true);
    expect(f.unmatched).toEqual([]);
  });
  it("retries a lost acknowledgement with the same operation and one server write", async () => {
    const f = await fixture(),
      request = command();
    f.state.lost = true;
    await expect(
      setCompanyFull(f.client, root, () => true, request),
    ).rejects.toMatchObject({ reason: "uncertain" });
    const result = await setCompanyFull(f.client, root, () => true, request);
    expect(result.replayed).toBe(true);
    expect(f.writes()).toBe(1);
    expect(
      f.calls.filter((c) => c.action === "set").map((c) => c.body.p_operation),
    ).toEqual([request.operationId, request.operationId]);
    expect(f.unmatched).toEqual([]);
  });
  it("a stalled native identity check times out and cannot start a later write", async () => {
    const f = await fixture(),
      request = command();
    f.state.holdUser = true;
    vi.useFakeTimers();
    const failed = expect(
      setCompanyFull(f.client, root, () => true, request),
    ).rejects.toMatchObject({ reason: "capability" });
    await vi.waitFor(() => expect(f.state.userPending).toBe(true));
    await vi.advanceTimersByTimeAsync(12001);
    await failed;
    f.state.holdUser = false;
    f.releaseUser();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.writes()).toBe(0);
    expect(f.calls).toEqual([]);
    expect(f.unmatched).toEqual([]);
  });
  it("a never-returning acknowledgement after commit becomes uncertain and retries only its original UUID", async () => {
    const f = await fixture(),
      request = command(),
      original = structuredClone(request);
    f.state.holdSet = true;
    vi.useFakeTimers();
    const failed = expect(
      setCompanyFull(f.client, root, () => true, request),
    ).rejects.toMatchObject({ reason: "uncertain" });
    await vi.waitFor(() => expect(f.writes()).toBe(1));
    await vi.advanceTimersByTimeAsync(12001);
    await failed;
    f.state.holdSet = false;
    f.releaseSet();
    await vi.advanceTimersByTimeAsync(0);
    const result = await setCompanyFull(f.client, root, () => true, request);
    expect(result.replayed).toBe(true);
    expect(f.writes()).toBe(1);
    expect(request).toEqual(original);
    expect(
      f.calls.filter((c) => c.action === "set").map((c) => c.body.p_operation),
    ).toEqual([original.operationId, original.operationId]);
    expect(f.unmatched).toEqual([]);
  });
  it("keeps a stale CAS conflict distinct from an unknown result", async () => {
    const f = await fixture();
    f.state.conflict = true;
    await expect(
      setCompanyFull(f.client, root, () => true, command()),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(f.writes()).toBe(0);
    expect(f.unmatched).toEqual([]);
  });
  it("refuses confirmation for a different company and discards changed-scope callbacks", async () => {
    const f = await fixture();
    f.state.wrongOrg = true;
    await expect(
      setCompanyFull(f.client, root, () => true, command()),
    ).rejects.toMatchObject({ reason: "uncertain" });
    await expect(
      companyFullHistory(f.client, root, () => false, org),
    ).rejects.toMatchObject({ reason: "changed" });
    expect(f.unmatched).toEqual([]);
  });
  it("never presents provider diagnostics as user errors", () => {
    expect(
      companyFullErrorMessage({ message: "Private diagnostic" }),
    ).not.toContain("Private diagnostic");
    expect(companyFullErrorMessage(new CompanyFullError("conflict"))).toContain(
      "Otra persona",
    );
  });
});
describe("manual Full scope, expiry and bounded offline authorization", () => {
  it("preserves absent legacy metadata and rejects incompatible configured state", () => {
    expect(readManualFullAccess({}, org)).toBeUndefined();
    expect(manualFullSchema.parse(empty).configured).toBe(false);
    expect(() =>
      readManualFullAccess(
        {
          manual_full: active(),
          observed_at: stamp(),
          organization_id: "wrong",
        },
        org,
      ),
    ).toThrow();
    expect(() =>
      manualFullSchema.parse({ ...active(), enabled: false }),
    ).toThrow();
  });
  it("requires a matching manual company licence before trusting a Full tier", () => {
    const observed_at = stamp();
    const company = { organization_id: org, observed_at, manual_full: active(), plan: "full" };
    expect(assertCompanyFullPlan(company, org)?.status).toBe("active");
    expect(() => assertCompanyFullPlan({ ...company, plan: "limited" }, org)).toThrow("company_full_tier_mismatch");
    expect(() => assertCompanyFullPlan({ ...company, manual_full: { ...active(), enabled: false, status: "disabled" } }, org))
      .toThrow("company_full_tier_mismatch");
    expect(assertCompanyFullPlan({ ...company, manual_full: { ...active(), enabled: false, status: "disabled" }, plan: "limited" }, org)?.status)
      .toBe("disabled");
    expect(() => assertCompanyFullPlan({ ...company, manual_full: empty }, org)).toThrow("company_full_tier_mismatch");
    expect(() => assertCompanyFullPlan({ ...company, organization_id: "other" }, org)).toThrow();
    // Fail closed on unknown/legacy tier labels even when an unconfigured
    // company would otherwise be considered a harmless Limited fallback.
    for (const invalid of ["enterprise", "premium", "trial", "", "FULL"]) {
      expect(() => assertCompanyFullPlan({ ...company, plan: invalid, manual_full: empty }, org))
        .toThrow("company_full_unknown_tier");
    }
    expect(assertCompanyFullPlan({ ...company, plan: "limited", manual_full: empty }, org)?.status)
      .toBe("unconfigured");
    expect(() => assertCompanyFullPlan({ ...company, plan: "full", manual_full: empty }, org))
      .toThrow("company_full_tier_mismatch");
  });
  it("uses explicit UTC and rejects impossible dates", () => {
    expect(fullExpiryFromInput("")).toBeNull();
    expect(fullExpiryFromInput("2027-01-12T13:45")).toBe(
      "2027-01-12T13:45:00.000Z",
    );
    expect(() => fullExpiryFromInput("2027-02-30T13:45")).toThrow();
  });
  it("anchors a finite active lease to server observation without a timer loop for expired state", () => {
    const value = { ...active(), expires_at: "2026-11-15T12:00:05.000Z" };
    expect(fullExpiryDeadline(value, "2026-11-15T12:00:00.000Z", 123)).toBe(
      5123,
    );
    expect(
      fullExpiryDeadline(
        { ...value, status: "expired" },
        "2026-11-15T12:00:10.000Z",
        123,
      ),
    ).toBeNull();
  });
  it("reschedules long monotonic timers after the browser INT32 bound", () => {
    vi.useFakeTimers();
    const expire = vi.fn(),
      start = performance.now(),
      bound = 2147483647;
    const stop = watchFullExpiry(start + bound * 2 + 15, expire);
    vi.advanceTimersByTime(bound);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(bound);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15);
    expect(expire).toHaveBeenCalledTimes(1);
    stop();
  });
  it("canceling a timer prevents an old company deadline from affecting a new scope", () => {
    vi.useFakeTimers();
    const expire = vi.fn();
    const stop = watchFullExpiry(performance.now() + 1000, expire);
    stop();
    vi.advanceTimersByTime(2000);
    expect(expire).not.toHaveBeenCalled();
  });
  it("manual Full overrides an expired trial only for its own cached company and keeps a seven-day maximum", () => {
    const fleet = createDemo(),
      now = Date.now(),
      profile = {
        user_id: member,
        email: "owner@example.com",
        contact_name: "Ficticio",
        company_name: fleet.organization.name,
        tax_id: "DEMO",
        address: "Ficticio",
        phone: "+34600000000",
        requested_plan: "limited" as const,
        trial_plan_id: "limited" as const,
        paid_plan: null,
        status: "trial" as const,
        trial_started_at: new Date(now - 86400000 * 12).toISOString(),
        trial_ends_at: new Date(now - 86400000).toISOString(),
        paid_until: null,
        ai_allowed: false,
        ai_opt_in: false,
        module_overrides: {},
        created_at: stamp(),
        updated_at: stamp(),
      };
    const access: SubscriptionAccess = {
      is_admin: false,
      active: true,
      features: demoFeatures,
      plan: "full",
      max_trucks: 50,
      sms_ready: false,
      prices_are_examples: true,
      payments_enabled: false,
      profile,
      organization_id: fleet.organization.id,
      manual_full: active(),
      observed_at: new Date(now).toISOString(),
    };
    expect(Date.parse(offlinePayload(fleet, [], access).expiresAt) - now).toBe(
      7 * 86400000,
    );
    access.manual_full = {
      ...active(),
      expires_at: new Date(now + 3600000).toISOString(),
    };
    expect(Date.parse(offlinePayload(fleet, [], access).expiresAt) - now).toBe(
      3600000,
    );
    access.manual_full = { ...active(), enabled: false, status: "disabled" };
    // An old cached Full entitlement is never treated as an active Basic lease.
    expect(() => offlinePayload(fleet, [], access)).toThrow();
    access.plan = "limited";
    access.features = { ...demoFeatures, invoice_ai: false, document_ai: false };
    const basic = offlinePayload(fleet, [], access);
    expect(Date.parse(basic.expiresAt) - now).toBe(7 * 86400000);
    expect(basic.access.features.invoice_ai).toBe(false);
    expect(basic.access.features.document_ai).toBe(false);
    access.manual_full = {
      ...active(), status: "expired", expires_at: new Date(now - 3600000).toISOString(),
    };
    expect(Date.parse(offlinePayload(fleet, [], access).expiresAt) - now).toBe(7 * 86400000);
  });
});
