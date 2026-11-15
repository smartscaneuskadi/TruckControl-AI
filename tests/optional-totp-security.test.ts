import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { getSessionVerifiedUser, type SessionVerificationClient } from "../supabase/functions/_shared/auth-session";
import { financialDatabase, financialPayment, incidentAdmin, incidentAdminSid, type PaidFixture } from "./helpers/subscription-financial-db";

let db: PGlite;
let company: PaidFixture, foreign: PaidFixture;
const companySid = randomUUID(), foreignSid = randomUUID(), truck = randomUUID();
const factor = randomUUID(), backup = randomUUID(), foreignFactor = randomUUID();
const rollback = readFileSync("docs/verification/optional-totp-protection-rollback.sql", "utf8");

async function attempt<T>(fn: () => Promise<T>) {
  await db.exec("savepoint totp_attempt");
  try {
    const result = await fn();
    await db.exec("release savepoint totp_attempt");
    return result;
  } catch (error) {
    await db.exec("rollback to savepoint totp_attempt;release savepoint totp_attempt");
    throw error;
  }
}
async function actor<T = Record<string, unknown>>(
  query: string, values: unknown[] = [], user = company.user,
  sid: string | null = companySid, aal?: unknown,
) {
  return attempt(async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [user, JSON.stringify({ sub: user, role: "authenticated", ...(sid === null ? {} : { session_id: sid }),
        ...(aal === undefined ? {} : { aal }), user_metadata: { aal: "aal2", is_admin: true }, app_metadata: { aal: "aal2" } })]);
    await db.exec("set local role authenticated");
    const result = await db.query<T>(query, values);
    await db.exec("reset role");
    return result.rows;
  });
}
async function service<T = Record<string, unknown>>(query: string, values: unknown[] = []) {
  return attempt(async () => {
    await db.exec("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);set local role service_role");
    const result = await db.query<T>(query, values);
    await db.exec("reset role");
    return result.rows;
  });
}
async function enroll(user = company.user, sid = companySid, id = factor, verified = true, sessionAal: string | null = "aal2") {
  await db.query("insert into auth.mfa_factors(id,user_id,factor_type,status) values($1,$2,'totp',$3)",
    [id, user, verified ? "verified" : "unverified"]);
  await db.query("update auth.sessions set aal=$2,factor_id=$3 where id=$1", [sid, sessionAal, id]);
}
async function verified(user = company.user, sid: string | null = companySid, aal?: unknown) {
  return (await actor<{ valid: boolean }>("select public.tc_verified_session() valid", [], user, sid, aal))[0].valid;
}
const counts = (aal?: unknown) => actor<{ trucks: number; organizations: number }>(
  "select (select count(*)::int from public.trucks where id=$1) trucks,(select count(*)::int from public.organizations where id=$2) organizations",
  [truck, company.company], company.user, companySid, aal);
const documentStatus = () => service("select public.tc_manual_subscription_document_server('status',$1::jsonb) result",
  [JSON.stringify({ actor_id: incidentAdmin, session_id: incidentAdminSid })]);
const refresh = () => service<{ result: Record<string, unknown> }>(
  "select public.tc_subscription_snapshot_refresh('observe',$1,$2,$3,'{}') result", [company.user, companySid, randomUUID()]);

beforeAll(async () => {
  db = await financialDatabase();
  company = await financialPayment(db, true);
  foreign = await financialPayment(db);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)", [companySid, company.user, foreignSid, foreign.user]);
  await db.query("insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on) values($1,$2,'MFA-SYNTHETIC','MAN','Synthetic',2026,1000,'available','2027-01-01')", [truck, company.company]);
}, 60000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback;reset role"); });
afterAll(async () => { await db?.close(); });

describe("optional TOTP: exact JWT and live factor-bound session across SQL and Edge", () => {
  it("preserves ordinary confirmed users and pending enrollment without MFA metadata", async () => {
    expect(await verified()).toBe(true);
    await enroll(company.user, companySid, factor, false, "aal1");
    expect(await verified()).toBe(true);
    expect(await counts()).toEqual([{ trucks: 1, organizations: 1 }]);
  });
  it("reads only the exact capability at AAL1, including while awaiting a verified-factor challenge", async () => {
    for (const enrolled of [false, true]) {
      if (enrolled) await enroll(company.user, companySid, factor, true, "aal1");
      expect(await actor("select public.tc_mfa_protection_status() capability"))
        .toEqual([{ capability: { schema_version: 1, totp_enforcement: true } }]);
    }
    expect(await verified()).toBe(false);
    expect(await counts()).toEqual([{ trucks: 0, organizations: 0 }]);
  });
  it.each([undefined, null, "aal1", "", "AAL2", true, { aal: "aal2" }])("rejects JWT aal %j despite an upgraded same SID and spoofed metadata", async aal => {
    await enroll();
    expect(await verified(company.user, companySid, aal)).toBe(false);
  });
  it("accepts a fresh exact AAL2 JWT with its same-user verified TOTP binding", async () => {
    await enroll();
    expect(await verified(company.user, companySid, "aal2")).toBe(true);
    expect(await counts("aal2")).toEqual([{ trucks: 1, organizations: 1 }]);
    const foreignRows = await actor("select id from public.organizations where id=$1", [foreign.company], company.user, companySid, "aal2");
    expect(foreignRows).toEqual([]);
  });
  it.each([null, "aal1", "aal3", ""])('rejects AAL2 JWT when the managed session aal is %j', async sessionAal => {
    await enroll(company.user, companySid, factor, true, sessionAal);
    expect(await verified(company.user, companySid, "aal2")).toBe(false);
  });
  it("rejects null, missing, foreign and unverified bound factors while another verified factor exists", async () => {
    await enroll();
    await enroll(foreign.user, foreignSid, foreignFactor);
    await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$2,'unverified')", [backup, company.user]);
    for (const id of [null, randomUUID(), foreignFactor, backup]) {
      await db.query("update auth.sessions set factor_id=$2 where id=$1", [companySid, id]);
      expect(await verified(company.user, companySid, "aal2")).toBe(false);
    }
  });
  it("does not let a stale bearer reach the shared Edge gate even when its SID was later upgraded", async () => {
    await enroll();
    const token = (aal: string) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: company.user, session_id: companySid, aal })).toString("base64url") + ".synthetic";
    const old = token("aal1"), fresh = token("aal2");
    const allowed = new Set([old, fresh]);
    const client: SessionVerificationClient<{ id: string }> = {
      auth: { getUser: async value => ({ data: { user: allowed.has(value) ? { id: company.user } : null }, error: null }) },
      rpc: () => ({ setHeader: async (_name, value) => {
        const claims = JSON.parse(Buffer.from(value.slice(7).split(".")[1], "base64url").toString());
        return { data: await verified(claims.sub, claims.session_id, claims.aal), error: null };
      } }),
    };
    expect(await getSessionVerifiedUser(client, old)).toBeNull();
    expect(await getSessionVerifiedUser(client, fresh)).toEqual({ id: company.user });
  });
  it("blocks raw Data API reads, unfiltered UPDATE without RETURNING, and business RPCs at AAL1", async () => {
    await enroll();
    const before = (await db.query("select name from public.organizations where id=$1", [company.company])).rows;
    expect(await counts("aal1")).toEqual([{ trucks: 0, organizations: 0 }]);
    await actor("update public.organizations set name='must never persist'", [], company.user, companySid, "aal1");
    expect((await db.query("select name from public.organizations where id=$1", [company.company])).rows).toEqual(before);
    await expect(actor("select public.tc_organization_access($1)", [company.company], company.user, companySid, "aal1")).rejects.toThrow();
    await expect(actor("select public.tc_team_control($1,'list','{}')", [company.company], company.user, companySid, "aal1")).rejects.toThrow();
  });
  it("protects company administrators as well as owners without trusting claims for their role", async () => {
    await db.query("insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'admin','active',$3)", [company.company, foreign.user, company.user]);
    await enroll(foreign.user, foreignSid, foreignFactor);
    await expect(actor("select public.tc_organization_access($1)", [company.company], foreign.user, foreignSid, "aal1")).rejects.toThrow();
    expect((await actor<{ access: Record<string, unknown> }>("select public.tc_organization_access($1) access", [company.company], foreign.user, foreignSid, "aal2"))[0].access)
      .toMatchObject({ active: true, company_role: "admin", can_manage: true });
    await expect(actor("select public.tc_provider_control('status','{}')", [], foreign.user, foreignSid, "aal2")).rejects.toThrow();
  });
  it("protects superadmin, provider and fiscal RPCs until the exact bearer passes MFA", async () => {
    await enroll(incidentAdmin, incidentAdminSid);
    for (const query of ["select public.tc_admin_control('snapshot','{}')", "select public.tc_provider_control('status','{}')", "select public.tc_admin_manual_subscription_invoices('capabilities',null,null,null,'{}',null)"])
      await expect(actor(query, [], incidentAdmin, incidentAdminSid, "aal1")).rejects.toThrow();
    expect((await actor<{ allowed: boolean }>("select private.tc_is_admin() allowed", [], incidentAdmin, incidentAdminSid, "aal2"))[0].allowed).toBe(true);
    expect(await actor("select private.tc_is_admin() allowed", [], incidentAdmin, incidentAdminSid, "aal1")).toEqual([{ allowed: false }]);
  });
  it("rechecks the factor-bound SID in the service-only fiscal adapter", async () => {
    await enroll(incidentAdmin, incidentAdminSid, factor, true, "aal1");
    await expect(documentStatus()).rejects.toThrow('manual_document_mfa_required');
    await db.query("update auth.sessions set aal='aal2' where id=$1", [incidentAdminSid]);
    expect(await documentStatus()).toHaveLength(1);
    await db.query("update auth.sessions set factor_id=null where id=$1", [incidentAdminSid]);
    await expect(documentStatus()).rejects.toThrow('manual_document_mfa_required');
  });
  it("rechecks the factor-bound SID in the service-only canonical refresh adapter", async () => {
    await enroll(company.user, companySid, factor, true, "aal1");
    await expect(refresh()).rejects.toThrow('subscription_refresh_mfa_required');
    await db.query("update auth.sessions set aal='aal2' where id=$1", [companySid]);
    expect((await refresh())[0].result.available).toBe(true);
    await db.query("update auth.sessions set factor_id=null where id=$1", [companySid]);
    await expect(refresh()).rejects.toThrow('subscription_refresh_mfa_required');
  });
  it("retains explicit service-only background access without a human session, with live ban enforcement", async () => {
    await enroll();
    await db.query("delete from auth.sessions where id=$1", [companySid]);
    const query = "select public.tc_company_server_access($1,$2) access";
    expect((await service<{ access: Record<string, unknown> }>(query, [company.user, company.company]))[0].access.active).toBe(true);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [company.user]);
    expect((await service<{ access: Record<string, unknown> }>(query, [company.user, company.company]))[0].access.active).toBe(false);
    await expect(actor(query, [company.user, company.company])).rejects.toThrow();
  });
  it("does not grant clients the parameterized baseline, factor or binding helpers", async () => {
    for (const query of ["select private.tc_actor_identity_and_session($1,false)", "select private.tc_actor_verified($1,false)", "select private.tc_totp_required($1)", "select private.tc_totp_session_bound($1,null)"])
      await expect(actor(query, [company.user])).rejects.toThrow();
  });
  it("retains revoked, expired, wrong-user, unconfirmed, deleted and banned denial for capability metadata", async () => {
    const capability = (sid: string | null = companySid) => actor("select public.tc_mfa_protection_status()", [], company.user, sid);
    for (const sid of [null, foreignSid, "malformed"]) await expect(capability(sid)).rejects.toThrow();
    for (const clause of ["not_after=now()-interval '1 second'", "not_after=now()+interval '1 day'"]) {
      await db.query("update auth.sessions set " + clause + " where id=$1", [companySid]);
      if (clause.startsWith("not_after=now()-")) await expect(capability()).rejects.toThrow();
    }
    for (const clause of ["email_confirmed_at=null", "deleted_at=now()", "banned_until=now()+interval '1 day'"]) {
      await db.query("update auth.users set " + clause + " where id=$1", [company.user]);
      await expect(capability()).rejects.toThrow();
      await db.query("update auth.users set email_confirmed_at=now(),deleted_at=null,banned_until=null where id=$1", [company.user]);
    }
    await db.query("delete from auth.sessions where id=$1", [companySid]);
    await expect(capability()).rejects.toThrow();
  });
  it("requires a surviving bound backup after one removal, and restores baseline after native last-factor removal", async () => {
    await enroll();
    await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$2,'verified')", [backup, company.user]);
    await db.query("delete from auth.mfa_factors where id=$1", [factor]);
    expect(await verified(company.user, companySid, "aal2")).toBe(false);
    await db.query("update auth.sessions set factor_id=$2 where id=$1", [companySid, backup]);
    expect(await verified(company.user, companySid, "aal2")).toBe(true);
    await db.query("delete from auth.mfa_factors where id=$1", [backup]);
    await db.query("update auth.sessions set aal='aal1',factor_id=null where id=$1", [companySid]);
    expect(await verified()).toBe(true);
  });
  it("keeps stable capability and permission reads valid in a read-only transaction", async () => {
    await db.exec("set transaction read only");
    expect(await verified()).toBe(true);
    expect(await actor("select public.tc_mfa_protection_status() capability")).toHaveLength(1);
  });
  it("refuses rollback when even one verified factor exists", async () => {
    await enroll();
    await expect(db.exec(rollback)).rejects.toThrow('optional_totp_rollback_refuses_verified_factors');
  });
  it("restores the original permission routines only when no verified factors exist", async () => {
    const isolated = await financialDatabase();
    try {
      await isolated.exec(rollback);
      expect((await isolated.query("select to_regprocedure('public.tc_mfa_protection_status()') is null absent,md5(prosrc) body from pg_proc where oid='private.tc_actor_verified(uuid,boolean)'::regprocedure")).rows)
        .toEqual([{ absent: true, body: "374d744e7267041f610146e220f9e49b" }]);
    } finally { await isolated.close(); }
  });
});
