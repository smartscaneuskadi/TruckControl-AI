import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  financialDatabase,
  withDbRole,
  incidentAdmin,
  incidentAdminSid,
} from "./helpers/subscription-financial-db";

describe("Stripe inspection reuses the existing SQL global-admin/session boundary", () => {
  let db: Awaited<ReturnType<typeof financialDatabase>>;
  const companyUser = randomUUID(),
    companySession = randomUUID();
  beforeAll(async () => {
    db = await financialDatabase();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'readiness-company@example.invalid',now())",
      [companyUser],
    );
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      companySession,
      companyUser,
    ]);
  });
  afterAll(async () => {
    await db?.close();
  });
  async function read(actor: string, session: string | null) {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          role: "authenticated",
          ...(session ? { session_id: session } : {}),
          user_metadata: { is_admin: true },
        }),
      ],
    );
    return withDbRole(db, "authenticated", () =>
      db.query(
        "select public.tc_provider_control('status','{}'::jsonb) result",
      ),
    );
  }
  it("allows the real admin table plus a live verified session", async () => {
    const data = (await read(incidentAdmin, incidentAdminSid)).rows[0]
      .result as { google: { vault_available: boolean } };
    expect(typeof data.google.vault_available).toBe("boolean");
  });
  it("rejects a company account even with a live session and forged admin metadata", async () => {
    await expect(read(companyUser, companySession)).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("rejects a missing session ID for the same administrator", async () => {
    await expect(read(incidentAdmin, null)).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("rejects the old session after sign-out without deleting company records", async () => {
    await db.query("delete from auth.sessions where id=$1", [incidentAdminSid]);
    await expect(read(incidentAdmin, incidentAdminSid)).rejects.toMatchObject({
      code: "42501",
    });
    expect(
      (
        await db.query("select count(*)::int n from auth.users where id=$1", [
          companyUser,
        ])
      ).rows[0].n,
    ).toBe(1);
  });
});
