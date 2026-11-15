import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { financialDatabase, incidentAdmin, incidentAdminSid } from "./helpers/subscription-financial-db";

type Json = Record<string, unknown>;
type State = { configured: boolean; status: string; enabled: boolean | null; revision: number; expires_at: string | null };
type Access = { active: boolean; plan?: string; features: Record<string, boolean>; manual_full: State; max_trucks: number; can_write: boolean; can_manage: boolean };
type Item = { organization_id: string; owner_id: string; manual_full: State; effective_active: boolean; effective_plan: string | null };
type Reply = { schema_version: number; observed_at: string; item: Item; items: Array<Item & Json>; replayed: boolean; applied_revision: number; next_after: string | null; next_before_revision: number | null };
let db: PGlite;
const owner = randomUUID(), outsider = randomUUID(), member = randomUUID();
const ownerSid = randomUUID(), outsiderSid = randomUUID(), memberSid = randomUUID();
let org: string, otherOrg: string;
const sibling = randomUUID(), rootOrg = randomUUID(), truck = randomUUID(), document = randomUUID();
const rollback = readFileSync("docs/verification/company-manual-full-function-rollback.sql", "utf8");
async function attempt<T>(fn: () => Promise<T>) {
  await db.exec("savepoint full_attempt");
  try { const value = await fn(); await db.exec("release savepoint full_attempt"); return value; }
  catch (error) { await db.exec("rollback to savepoint full_attempt;release savepoint full_attempt"); throw error; }
}
async function actor<T = Json>(query: string, args: unknown[] = [], user = owner, sid: string | null = ownerSid, role = "authenticated") {
  return attempt(async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [user, JSON.stringify({ sub: user, role, ...(sid ? { session_id: sid } : {}), user_metadata: { is_admin: true, paid_plan: "full" }, app_metadata: { role: "admin" } })]);
    await db.exec("set local role " + role);
    const result = await db.query<T>(query, args);
    await db.exec("reset role"); return result.rows;
  });
}
async function service<T = Json>(query: string, args: unknown[] = []) {
  return actor<T>(query, args, "", null, "service_role");
}
async function control(action: string, company: string | null = null, expected: number | null = null, operation: string | null = null, data: Json = {}, after: string | null = null, user = incidentAdmin, sid: string | null = incidentAdminSid) {
  return (await actor<{ result: Reply }>("select public.tc_admin_company_full($1,$2,$3,$4,$5::jsonb,$6) result",
    [action, company, expected, operation, JSON.stringify(data), after], user, sid))[0].result;
}
const set = (company = org, enabled = true, expires_at: string | null = null, expected = 0, operation = randomUUID()) =>
  control("set", company, expected, operation, { enabled, expires_at });
async function access(company = org, user = owner, sid: string | null = ownerSid) {
  return (await actor<{ access: Access }>("select public.tc_organization_access($1) access", [company], user, sid))[0].access;
}
async function expireOwner() {
  await db.query("update private.tc_customers set status='trial',paid_plan=null,paid_until=null,trial_started_at=now()-interval '20 days',trial_ends_at=now()-interval '10 days' where user_id=$1", [owner]);
}
async function auditCount() {
  return Number((await db.query<{ n: number }>("select count(*)::int n from private.tc_company_full_audit")).rows[0].n);
}
beforeAll(async () => {
  db = await financialDatabase();
  await db.exec("update private.tc_settings set enforce_access=true,sms_ready=false");
  for (const [id, sid, n] of [[owner, ownerSid, 1], [outsider, outsiderSid, 2], [member, memberSid, 3]] as const) {
    await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
      [id, `manual-full-${n}@example.invalid`, JSON.stringify({ truckcontrol_registration: { contact_name: "Synthetic operator", company_name: `Synthetic Full company ${n}`, tax_id: `SYNTH-FULL-${n}`, address: "Synthetic isolated street 123", phone: `+1202555800${n}`, requested_plan: "limited" } })]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [sid, id]);
  }
  org = (await db.query<{ id: string }>("select id from public.organizations where owner_id=$1", [owner])).rows[0].id;
  otherOrg = (await db.query<{ id: string }>("select id from public.organizations where owner_id=$1", [outsider])).rows[0].id;
  await db.query("insert into public.organizations(id,owner_id,name) values($1,$2,'Same owner second company'),($3,$4,'Root management company')", [sibling, owner, rootOrg, incidentAdmin]);
  await db.query("insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on) values($1,$2,'FULL-BASE','MAN','Synthetic',2026,'2027-01-01')", [truck, org]);
  await db.query("insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values($1,$2,'Synthetic proof.pdf',$3,'application/pdf',8)", [document, org, `${org}/${document}/manual-full-proof.pdf`]);
}, 60000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback;reset role"); });
afterAll(async () => { await db?.close(); });

describe("manual Full: a company decision, fresh Root authorization and existing commercial guards", () => {
  it("preserves unconfigured legacy trials and returns only scoped minimal status", async () => {
    expect(await access()).toMatchObject({ active: true, plan: "limited", manual_full: { configured: false, status: "unconfigured", revision: 0, enabled: null } });
    await expireOwner();
    expect(await access()).toMatchObject({ active: false, manual_full: { configured: false } });
    await expect(access(org, outsider, outsiderSid)).resolves.toMatchObject({ active: false, profile: null });
  });
  it("activates one of two companies owned by an expired account without changing global entitlements", async () => {
    await expireOwner();
    const before = (await db.query("select paid_plan,status,paid_until,trial_ends_at from private.tc_customers where user_id=$1", [owner])).rows;
    expect((await set()).item).toMatchObject({ organization_id: org, effective_active: true, effective_plan: "full", manual_full: { enabled: true, status: "active", revision: 1, expires_at: null } });
    expect(await access()).toMatchObject({ active: true, plan: "full", max_trucks: 50, features: { documents: true, gmail: true } });
    expect(await access(sibling)).toMatchObject({ active: false, plan: "limited", manual_full: { configured: false } });
    expect(await access(otherOrg, outsider, outsiderSid)).toMatchObject({ active: true, plan: "limited" });
    expect((await db.query("select paid_plan,status,paid_until,trial_ends_at from private.tc_customers where user_id=$1", [owner])).rows).toEqual(before);
    const bootstrap = (await actor<{ access: Access & { company_access_available: boolean } }>("select public.tc_finish_registration() access"))[0].access;
    expect(bootstrap).toMatchObject({ active: true, company_access_available: true, plan: "limited", features: { documents: false, gmail: false } });
  });
  it("makes explicit OFF authoritative over legacy paid/trial access and the enforce_access=false shortcut", async () => {
    await db.exec("update private.tc_settings set enforce_access=false");
    await set(org, false);
    expect(await access()).toMatchObject({ active: false, can_write: false, can_manage: false, manual_full: { status: "disabled" } });
    expect(Object.values((await access()).features).every(value => !value)).toBe(true);
    expect((await access(sibling)).active).toBe(true);
    expect(await actor("select id from public.trucks where id=$1", [truck])).toEqual([]);
    await expect(actor("update public.organizations set name='must not persist'")).rejects.toThrow('company_full_inactive');
    expect((await actor("select id from public.organizations where id=$1", [org]))).toEqual([{ id: org }]);
  });
  it("uses the server boundary, treats null expiry as unlimited and reactivates immediately", async () => {
    const boundary = (await db.query<{ stamp: string }>(`select to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') stamp`)).rows[0].stamp;
    expect((await set(org, true, boundary)).item.manual_full.status).toBe("expired");
    expect((await access()).active).toBe(false);
    expect((await set(org, true, "2000-01-01T00:00:00Z", 1)).item.manual_full.status).toBe("expired");
    expect((await set(org, true, null, 2)).item.manual_full).toMatchObject({ status: "active", revision: 3, expires_at: null });
    expect((await access()).active).toBe(true);
    expect((await set(org, false, null, 3)).item.manual_full.status).toBe("disabled");
    expect((await set(org, true, null, 4)).item.manual_full.status).toBe("active");
  });
  it.each(["admin", "operator", "viewer"])("never lets a company %s self-grant with forged JWT metadata", async role => {
    await db.query("insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,$3,'active',$4)", [org, member, role, owner]);
    for (const action of ["capabilities", "list", "history", "set"]) {
      await expect(control(action, action === "set" || action === "history" ? org : null, action === "set" ? 0 : null, action === "set" ? randomUUID() : null,
        action === "set" ? { enabled: true, expires_at: null } : {}, null, member, memberSid)).rejects.toThrow();
    }
    expect(await auditCount()).toBe(0);
  });
  it("revalidates Root's native user, exact SID and current role even for replay/read actions", async () => {
    const op = randomUUID(); await set(org, true, null, 0, op);
    for (const sid of [null, ownerSid, "malformed"]) await expect(control("capabilities", null, null, null, {}, null, incidentAdmin, sid)).rejects.toThrow();
    await db.query("delete from private.tc_admins where user_id=$1", [incidentAdmin]);
    await expect(set(org, true, null, 0, op)).rejects.toThrow();
    await expect(control("list")).rejects.toThrow();
    expect(await auditCount()).toBe(1);
  });
  it.each(["banned_until=now()+interval '1 day'", "deleted_at=now()", "email_confirmed_at=null"])("does not accept unavailable Root identity: %s", async assignment => {
    await db.query("update auth.users set " + assignment + " where id=$1", [incidentAdmin]);
    await expect(control("capabilities")).rejects.toThrow();
  });
  it("keeps Root account management available while Root's own company is disabled", async () => {
    await set(rootOrg, false);
    expect(await control("capabilities")).toMatchObject({ schema_version: 1, manual_company_full: true });
    expect((await set()).item.manual_full.status).toBe("active");
    expect((await actor("select public.tc_admin_control('snapshot','{}') result", [], incidentAdmin, incidentAdminSid))).toHaveLength(1);
  });
  it("serializes CAS, replays a lost acknowledgement without a second audit and returns current state", async () => {
    const op = randomUUID();
    expect(await set(org, true, null, 0, op)).toMatchObject({ replayed: false, applied_revision: 1 });
    await expect(set(org, false, null, 0)).rejects.toThrow('company_full_stale_revision');
    await set(org, false, null, 1);
    const replay = await set(org, true, null, 0, op);
    expect(replay).toMatchObject({ replayed: true, applied_revision: 1, item: { manual_full: { revision: 2, status: "disabled" } } });
    await expect(set(org, false, null, 0, op)).rejects.toThrow('company_full_operation_conflict');
    await expect(set(sibling, true, null, 0, op)).rejects.toThrow('company_full_operation_conflict');
    expect(await auditCount()).toBe(2);
  });
  it("captures fresh actor email, immutable before/after and ordered history pages", async () => {
    await db.query("update auth.users set email='fresh-root@example.invalid' where id=$1", [incidentAdmin]);
    await set(org, true); await set(org, false, null, 1);
    const history = await control("history", org, null, null, { limit: 1 });
    expect(history.items[0]).toMatchObject({ organization_id: org, actor_id: incidentAdmin, actor_email: "fresh-root@example.invalid", revision: 2,
      before: { configured: true, enabled: true, revision: 1 }, after: { configured: true, enabled: false, revision: 2 } });
    expect(history.next_before_revision).toBe(2);
    const older = await control("history", org, null, null, { before_revision: 2 });
    expect(older.items[0]).toMatchObject({ revision: 1, before: { configured: false, revision: 0 } });
    for (const sql of ["update private.tc_company_full_audit set actor_email='rewrite'", "delete from private.tc_company_full_audit", "truncate private.tc_company_full_audit"])
      await expect(attempt(() => db.exec(sql))).rejects.toThrow('manual_invoice_intake_immutable');
  });
  it("bounds list/search pagination and keeps same-owner organizations independent", async () => {
    const first = await control("list", null, null, null, { limit: 1 });
    expect(first.items).toHaveLength(1); expect(first.next_after).not.toBeNull();
    const second = await control("list", null, null, null, { limit: 1 }, first.next_after);
    expect(second.items[0].organization_id).not.toBe(first.items[0].organization_id);
    const owners = await control("list", null, null, null, { query: "manual-full-1@" });
    expect(new Set(owners.items.map(item => item.organization_id))).toEqual(new Set([org, sibling]));
  });
  it("rejects malformed/extra input without partial decision or audit", async () => {
    for (const data of [{ enabled: "true", expires_at: null }, { enabled: true }, { enabled: true, expires_at: "now" }, { enabled: true, expires_at: "infinity" }, { enabled: true, expires_at: "2026-02-30T00:00:00Z" }, { enabled: true, expires_at: null, is_admin: true }])
      await expect(control("set", org, 0, randomUUID(), data)).rejects.toThrow();
    await expect(control("list", null, null, null, { limit: 101 })).rejects.toThrow();
    expect(await auditCount()).toBe(0);
    expect((await access()).manual_full.configured).toBe(false);
  });
  it("keeps actor/owner security suspension, live bans and role/module policies authoritative", async () => {
    await set();
    for (const user of [owner, member]) {
      if (user === member) await db.query("insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'viewer','active',$3)", [org, member, owner]);
      await db.query("update private.tc_customers set status='suspended' where user_id=$1", [user]);
      expect((await access(org, user, user === owner ? ownerSid : memberSid)).active).toBe(false);
      await db.query("update private.tc_customers set status='trial' where user_id=$1", [user]);
    }
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [owner]);
    expect((await access(org, member, memberSid)).active).toBe(false);
    await db.query("update auth.users set banned_until=null where id=$1", [owner]);
    expect(await access(org, member, memberSid)).toMatchObject({ active: true, can_write: false, can_manage: false });
    await expect(actor("update public.trucks set odometer_km=20 where id=$1 returning id", [truck], member, memberSid)).rejects.toThrow();
    await db.query("update private.tc_modules set enabled=false where id='documents'");
    expect((await access()).features.documents).toBe(false);
    await db.query("update private.tc_customers set module_overrides='{\"gmail\":false}' where user_id=$1", [owner]);
    expect((await access()).features.gmail).toBe(false);
  });
  it("denies company raw reads/writes and RPCs when OFF without deleting any business rows", async () => {
    await set();
    expect(await actor("select * from public.list_company_documents($1)", [org])).toHaveLength(1);
    await set(org, false, null, 1);
    expect(await actor("select id from public.trucks where id=$1", [truck])).toEqual([]);
    expect(await actor("update public.trucks set odometer_km=900 where id=$1 returning id", [truck])).toEqual([]);
    await expect(actor("select public.tc_list_records($1,null)", [org])).rejects.toThrow();
    expect(await actor("select * from public.list_company_documents($1)", [org])).toEqual([]);
    expect((await db.query("select id from public.trucks where id=$1", [truck])).rows).toEqual([{ id: truck }]);
    expect(await actor("select id from public.organizations where id=$1", [org])).toEqual([{ id: org }]);
  });
  it("protects worker access, documents, AI usage, inbound mail and legacy Gmail paths", async () => {
    await set(org, false);
    expect((await service<{ access: Access }>("select public.tc_company_server_access($1,$2) access", [owner, org]))[0].access.active).toBe(false);
    expect(await service("select public.tc_consume_document_ai($1,$2) allowed", [org, owner])).toEqual([{ allowed: false }]);
    await expect(service("select public.company_mail_server('get_inbox',$1::jsonb)", [JSON.stringify({ organization_id: org, user_id: owner })])).rejects.toThrow();
    await expect(service("select public.company_copilot_server($1,$2,'context','{}')", [org, owner])).rejects.toThrow();
    await expect(service("select public.gmail_server('credentials',$1::jsonb)", [JSON.stringify({ organization_id: org })])).rejects.toThrow('company_full_inactive');
    expect(await service("select public.gmail_server('lock_sync',$1::jsonb) locked", [JSON.stringify({ organization_id: org })])).toEqual([{ locked: false }]);
  });
  it("Full alone never grants AI consent, and existing document-AI quota remains bounded", async () => {
    await set();
    await db.exec("update private.tc_modules set enabled=true where id='document_ai'");
    expect((await access()).features.document_ai).toBe(false);
    expect(await service("select public.tc_consume_document_ai($1,$2) allowed", [org, owner])).toEqual([{ allowed: false }]);
    await db.query("update private.tc_customers set ai_allowed=true,ai_opt_in=true where user_id=$1", [owner]);
    expect((await access()).features.document_ai).toBe(true);
    await db.query("insert into private.tc_document_ai_usage(organization_id,month,calls) values($1,date_trunc('month',now())::date,99)", [org]);
    expect(await service("select public.tc_consume_document_ai($1,$2) allowed", [org, owner])).toEqual([{ allowed: true }]);
    expect(await service("select public.tc_consume_document_ai($1,$2) allowed", [org, owner])).toEqual([{ allowed: false }]);
    expect((await db.query("select payments_enabled from private.tc_settings")).rows).toEqual([{ payments_enabled: false }]);
  });
  it("retains the company 50-truck bound even if the Full plan limit is NULL", async () => {
    await set(); await db.exec("update private.tc_plans set max_trucks=null where id='full'");
    expect((await access()).max_trucks).toBe(50);
    await actor("insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on) select $1,'FULL-CAP-'||n,'MAN','Synthetic',2026,'2027-01-01' from generate_series(1,49) n", [org]);
    await expect(actor("insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on) values($1,'FULL-OVER','MAN','Synthetic',2026,'2027-01-01')", [org])).rejects.toThrow('Has alcanzado');
    expect((await db.query("select count(*)::int n from public.trucks where organization_id=$1", [org])).rows).toEqual([{ n: 50 }]);
  });
  it("does not give clients raw licence, audit or internal status-helper access", async () => {
    for (const query of ["select * from private.tc_company_full_licenses", "select * from private.tc_company_full_audit", "select private.tc_company_full_state($1)", "select private.tc_company_full_item($1)"])
      await expect(actor(query, query.includes("$1") ? [org] : [])).rejects.toThrow();
  });
  it("refuses function rollback for an explicit OFF record, preserving manual enforcement", async () => {
    await set(org, false);
    await expect(db.exec(rollback)).rejects.toThrow('company_full_rollback_refuses_configured_companies');
  });
  it("allows the function-only zero-record rollback while retaining immutable tables", async () => {
    const isolated = await financialDatabase();
    try {
      await isolated.exec(rollback);
      expect((await isolated.query("select to_regprocedure('public.tc_admin_company_full(text,uuid,bigint,uuid,jsonb,uuid)') is null absent,to_regclass('private.tc_company_full_audit') is not null audit_kept")).rows).toEqual([{ absent: true, audit_kept: true }]);
    } finally { await isolated.close(); }
  }, 30000);
});
