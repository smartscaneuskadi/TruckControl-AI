import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";

/**
 * Local GoTrue fixture only: mock Auth storage and token issuance, never RLS,
 * membership, role checks or business RPCs. Production SQL is loaded unchanged.
 */
type FixtureState = {
  sessions: Map<string, string>;
  issuedClaims: Set<string>;
};
const fixtures = new WeakMap<PGlite, FixtureState>();
function stateFor(db: PGlite) {
  let state = fixtures.get(db);
  if (!state) {
    state = { sessions: new Map(), issuedClaims: new Set() };
    fixtures.set(db, state);
  }
  return state;
}

export async function installAuthSessionFixture(
  db: PGlite,
  options: { confirmedByDefault?: boolean } = {},
) {
  // Missing columns in old fixtures must model real Auth. The normal default
  // remains NULL so onboarding/unconfirmed/banned/deleted tests stay meaningful.
  await db.exec(`
    alter table auth.users add column if not exists email text;
    alter table auth.users add column if not exists phone text;
    alter table auth.users add column if not exists email_confirmed_at timestamptz;
    alter table auth.users add column if not exists phone_confirmed_at timestamptz;
    alter table auth.users add column if not exists banned_until timestamptz;
    alter table auth.users add column if not exists deleted_at timestamptz;
    alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}';
    create table if not exists auth.sessions(
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade
    );
  `);
  if (options.confirmedByDefault) {
    // Only the two byte-retained pre-Auth suites assume confirmed owners.
    // Their isolated project installs this default before creating any user.
    await db.exec(
      "alter table auth.users alter column email_confirmed_at set default now()",
    );
  }
  stateFor(db);
}

async function asFixtureAuth<T>(db: PGlite, operation: () => Promise<T>) {
  const role = (await db.query<{ role: string }>(
    "select current_user as role",
  )).rows[0].role;
  await db.exec("reset role");
  try {
    return await operation();
  } finally {
    await db.exec('set role "' + role.replaceAll('"', '""') + '"');
  }
}

async function sessionFor(db: PGlite, user: string) {
  const state = stateFor(db);
  const previous = state.sessions.get(user);
  // A cached ID is never inserted again. Logout/revocation remains effective.
  if (previous) return previous;
  const id = randomUUID();
  await asFixtureAuth(db, () =>
    db.query(
      "insert into auth.sessions(id,user_id) select $1::uuid,id from auth.users where id=$2::uuid",
      [id, user],
    ),
  );
  state.sessions.set(user, id);
  return id;
}

/** Run in beforeAll, outside per-test rollback, to model existing logins. */
export async function seedFixtureSessions(db: PGlite) {
  const users = await asFixtureAuth(db, () =>
    db.query<{ id: string }>("select id from auth.users order by id"),
  );
  for (const { id } of users.rows) await sessionFor(db, id);
}

/**
 * Simulates an Auth-issued JWT for the selected fixture actor. No user is
 * confirmed, unbanned, undeleted or recreated here. Explicit adversarial claims
 * written by a security case are preserved, including missing/invalid SIDs.
 */
export async function bindFixtureActor(
  db: PGlite,
  user: string | null,
  local = false,
) {
  const state = stateFor(db);
  const actor = user || null;
  const current = (await db.query<{ claims: string | null }>(
    "select current_setting('request.jwt.claims',true) as claims",
  )).rows[0].claims;
  const explicit = !!current && !state.issuedClaims.has(current);
  const claims = actor
    ? explicit
      ? current!
      : JSON.stringify({
          sub: actor,
          role: "authenticated",
          session_id: await sessionFor(db, actor),
        })
    : "";
  if (!explicit || !actor) state.issuedClaims.add(claims);
  return db.query(
    "select set_config('request.jwt.claim.sub',$1,$3) as set_config,set_config('request.jwt.claims',$2,$3) as fixture_claims",
    [actor ?? "", claims, local],
  );
}
