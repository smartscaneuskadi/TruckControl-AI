import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";

const actor = "10000000-0000-4000-8000-000000000151";
const other = "10000000-0000-4000-8000-000000000152";
const first = "40000000-0000-4000-8000-000000000151";
const second = "40000000-0000-4000-8000-000000000152";
type Factor = {
  id: string;
  factor_type: "totp";
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
};
const factor = (id = first, status: Factor["status"] = "verified"): Factor => ({
  id,
  status,
  factor_type: "totp",
  created_at: "2026-11-15T00:00:00Z",
  updated_at: "2026-11-15T00:00:00Z",
});
const jwt = (id = actor, aal = "aal1") =>
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      aud: "authenticated",
      role: "authenticated",
      aal,
      session_id: "synthetic-session",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url") +
  ".c3ludGhldGlj";
async function fixture(factors: Factor[] = [], aal = "aal1") {
  const state = {
    factors,
    capability: { schema_version: 1, totp_enforcement: true } as unknown,
    capabilityStatus: 200,
    failUser: false,
    ignoreVerification: false,
    userId: actor,
    sessionBound: true,
    sessionStatus: 200,
  };
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
    authorization: string | null;
  }[] = [];
  const unmatched: string[] = [];
  const user = () => ({
    id: state.userId,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.com",
    app_metadata: {},
    user_metadata: { mfa_passed: true, aal: "aal2" },
    created_at: "2026-11-15T00:00:00Z",
    factors: state.factors,
  });
  const session = (level = "aal2") => ({
    access_token: jwt(state.userId, level),
    refresh_token: "synthetic-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: user(),
  });
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (url.origin !== "http://127.0.0.1:9999") {
      unmatched.push(request.url);
      throw new Error("Unmatched synthetic transport");
    }
    const path = url.pathname,
      raw = await request.text(),
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    calls.push({
      path,
      method: request.method,
      body,
      authorization: request.headers.get("authorization"),
    });
    let data: unknown,
      status = 200;
    if (path === "/auth/v1/user") {
      data = state.failUser
        ? {
            code: "unexpected_failure",
            message: "Never display this provider diagnostic",
          }
        : user();
      if (state.failUser) status = 500;
    } else if (path === "/rest/v1/rpc/tc_mfa_protection_status") {
      data = state.capability;
      status = state.capabilityStatus;
    } else if (path === "/rest/v1/rpc/tc_verified_session") {
      data = state.sessionBound;
      status = state.sessionStatus;
    } else if (path === "/auth/v1/factors" && request.method === "POST") {
      state.factors.push(factor(second, "unverified"));
      data = {
        id: second,
        type: "totp",
        totp: {
          secret: "SYNTHETICRAMONLY",
          qr_code:
            '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>',
          uri: "otpauth://totp/synthetic",
        },
      };
    } else if (/\/auth\/v1\/factors\/[^/]+\/challenge$/.test(path))
      data = {
        id: "synthetic-challenge",
        type: "totp",
        expires_at: 9999999999,
      };
    else if (/\/auth\/v1\/factors\/[^/]+\/verify$/.test(path)) {
      if (body?.code !== "123456") {
        data = {
          code: "mfa_verification_failed",
          message: "Private raw provider failure",
        };
        status = 422;
      } else {
        if (!state.ignoreVerification)
          state.factors.forEach((f) => {
            if (path.includes(f.id)) f.status = "verified";
          });
        data = session();
      }
    } else if (
      /\/auth\/v1\/factors\/[^/]+$/.test(path) &&
      request.method === "DELETE"
    ) {
      state.factors = state.factors.filter((f) => !path.includes(f.id));
      data = { id: path.split("/").at(-1) };
    } else if (
      path === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "refresh_token"
    )
      data = session(aal);
    else {
      unmatched.push(request.url);
      throw new Error("Unmatched synthetic transport");
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
    "sb_publishable_synthetic_mfa",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetcher },
    },
  );
  const initialized = await client.auth.setSession({
    access_token: jwt(actor, aal),
    refresh_token: "synthetic-refresh",
  });
  expect(initialized.error).toBeNull();
  return { state, client, calls, unmatched };
}
let mfa: typeof import("../src/integrations/supabase/mfa");
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_MFA_ENROLLMENT_ENABLED", "true");
  mfa = await import("../src/integrations/supabase/mfa");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("native MFA protocol candidate", () => {
  it("defaults enrollment off; metadata never substitutes for verified factors or native AAL", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_MFA_ENROLLMENT_ENABLED", undefined);
    const disabled = await import("../src/integrations/supabase/mfa");
    expect(disabled.mfaEnrollmentEnabled).toBe(false);
    const f = await fixture();
    expect((await disabled.readNativeMfa(f.client, actor)).needsChallenge).toBe(
      false,
    );
    await expect(
      disabled.beginTotp(f.client, actor, () => true),
    ).rejects.toMatchObject({ reason: "disabled" });
    f.state.factors = [factor()];
    expect((await disabled.readNativeMfa(f.client, actor)).needsChallenge).toBe(
      true,
    );
    expect(f.calls.filter((c) => c.path === "/auth/v1/factors")).toHaveLength(
      0,
    );
    expect(f.unmatched).toEqual([]);
  });
  for (const value of [
    null,
    {},
    { schema_version: 1, totp_enforcement: false },
    { schema_version: 2, totp_enforcement: true },
    { schema_version: 1, totp_enforcement: true, extra: true },
  ])
    it(`fails closed before enrollment for unavailable/mismatched capability ${JSON.stringify(value)}`, async () => {
      const f = await fixture();
      f.state.capability = value;
      await expect(
        mfa.beginTotp(f.client, actor, () => true),
      ).rejects.toMatchObject({ reason: "capability" });
      expect(f.calls.filter((c) => c.path === "/auth/v1/factors")).toHaveLength(
        0,
      );
      expect((await mfa.readNativeMfa(f.client, actor)).needsChallenge).toBe(
        false,
      );
      expect(f.unmatched).toEqual([]);
    });
  it("blocks provider failures and rechecks capability before NEW enrollment verification", async () => {
    const f = await fixture();
    const pending = await mfa.beginTotp(f.client, actor, () => true);
    expect(pending.secret).toBe("SYNTHETICRAMONLY");
    expect(pending.qrCode).toMatch(/^data:image\/svg\+xml;utf-8,/);
    f.state.capabilityStatus = 503;
    await expect(
      mfa.verifyTotp(f.client, actor, pending.id, "123456", () => true, true),
    ).rejects.toMatchObject({ reason: "capability" });
    expect(f.calls.filter((c) => c.path.endsWith("/verify"))).toHaveLength(0);
    expect(f.unmatched).toEqual([]);
  });
  it("uses challenge+verify, retries invalid codes, and confirms fresh factor and AAL before success", async () => {
    const f = await fixture();
    const pending = await mfa.beginTotp(f.client, actor, () => true);
    await expect(
      mfa.verifyTotp(f.client, actor, pending.id, "000000", () => true, true),
    ).rejects.toMatchObject({ reason: "code" });
    f.state.ignoreVerification = true;
    await expect(
      mfa.verifyTotp(f.client, actor, pending.id, "123456", () => true, true),
    ).rejects.toMatchObject({ reason: "verification" });
    f.state.ignoreVerification = false;
    const verified = await mfa.verifyTotp(
      f.client,
      actor,
      pending.id,
      "123456",
      () => true,
      true,
    );
    expect(verified.currentLevel).toBe("aal2");
    expect(verified.factors.map((f) => f.id)).toEqual([second]);
    expect(f.calls.filter((c) => c.path.endsWith("/challenge"))).toHaveLength(
      3,
    );
    expect(f.unmatched).toEqual([]);
  });
  it("challenges an existing factor independently of enrollment rollout and capability", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_MFA_ENROLLMENT_ENABLED", "false");
    const disabled = await import("../src/integrations/supabase/mfa");
    const f = await fixture([factor()]);
    f.state.capabilityStatus = 503;
    expect(
      (await disabled.verifyTotp(f.client, actor, first, "123456", () => true))
        .needsChallenge,
    ).toBe(false);
    expect(
      f.calls.some((c) => c.path.includes("tc_mfa_protection_status")),
    ).toBe(false);
    expect(f.unmatched).toEqual([]);
  });
  it("checks native AAL2 before removal, keeps backups and refreshes the native session", async () => {
    const f = await fixture([factor(), factor(second)]);
    await expect(
      mfa.removeTotp(f.client, actor, first, () => true),
    ).rejects.toMatchObject({ reason: "aal2" });
    await f.client.auth.setSession({
      access_token: jwt(actor, "aal2"),
      refresh_token: "synthetic-refresh",
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    await mfa.removeTotp(f.client, actor, first, () => true);
    expect(f.state.factors.map((f) => f.id)).toEqual([second]);
    expect(f.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    expect(f.calls.some((c) => c.path === "/auth/v1/token")).toBe(true);
    expect(f.unmatched).toEqual([]);
    vi.unstubAllGlobals();
  });
  it("discards changed actors and canceled setup without deleting any factor", async () => {
    const f = await fixture();
    let active = true;
    const original = f.client.auth.mfa.enroll.bind(f.client.auth.mfa);
    vi.spyOn(f.client.auth.mfa, "enroll").mockImplementation((async (
      ...args: Parameters<typeof original>
    ) => {
      const result = await original(...args);
      active = false;
      return result;
    }) as typeof original);
    await expect(
      mfa.beginTotp(f.client, actor, () => active),
    ).rejects.toMatchObject({ reason: "changed" });
    expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
    f.state.userId = other;
    await expect(mfa.readNativeMfa(f.client, actor)).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(f.unmatched).toEqual([]);
  });
  it("never exposes provider messages in its closed error vocabulary", () => {
    expect(
      mfa.mfaErrorMessage({ message: "secret raw diagnostic" }),
    ).not.toContain("secret raw diagnostic");
    expect(mfa.mfaErrorMessage(new mfa.MfaError("code"))).toContain("código");
  });
  it("pins the exact native AAL2 token to the existing authoritative session predicate", async () => {
    const f = await fixture([factor()], "aal2");
    f.state.sessionBound = false;
    expect((await mfa.readNativeMfa(f.client, actor)).needsChallenge).toBe(
      true,
    );
    const token = (await f.client.auth.getSession()).data.session!.access_token;
    expect(
      f.calls
        .filter((c) => c.path.endsWith("tc_verified_session"))
        .every((c) => c.authorization === "Bearer " + token),
    ).toBe(true);
    await expect(
      mfa.removeTotp(f.client, actor, first, () => true),
    ).rejects.toMatchObject({ reason: "aal2" });
    f.state.sessionStatus = 503;
    await expect(mfa.readNativeMfa(f.client, actor)).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(f.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(f.unmatched).toEqual([]);
  });
});
