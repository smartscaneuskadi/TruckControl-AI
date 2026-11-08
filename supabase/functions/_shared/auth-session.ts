/** A live Auth user alone does not prove that its JWT session survived logout.
 * This gate is ONLY for human bearer-token operations. Signed provider webhooks,
 * OAuth state callbacks and server cron jobs keep their separate authorization.
 */
export interface SessionVerifiedUser { id: string }
export interface SessionVerificationClient<User extends SessionVerifiedUser> {
  auth: {
    getUser(token: string): PromiseLike<{ data: { user: User | null }; error: unknown }>;
  };
  rpc(name: "tc_verified_session", args: Record<string, never>): {
    setHeader(name: string, value: string): PromiseLike<{ data: unknown; error: unknown }>;
  };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function matchingVerifiedSubject(token: string, userId: string) {
  try {
    const payload = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (part) => part.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    // The Auth server verified the exact token before reaching this comparison.
    // Claims are never used for roles or permissions here.
    return claims !== null && typeof claims === "object" && !Array.isArray(claims) && claims.sub === userId;
  } catch { return false; }
}
export async function getSessionVerifiedUser<User extends SessionVerifiedUser>(
  client: SessionVerificationClient<User>, token: string,
): Promise<User | null> {
  if (typeof token !== "string" || token.length > 16384 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const verified = await client.auth.getUser(token);
    const user = verified.data?.user;
    if (verified.error !== null || !user || !uuid.test(user.id) || !matchingVerifiedSubject(token, user.id)) return null;
    // Pin the user's JWT for this request even when client is a service-role
    // client or another session is installed while getUser is in flight.
    const live = await client.rpc("tc_verified_session", {}).setHeader("Authorization", "Bearer " + token);
    if (live.error !== null || live.data !== true) return null;
    return user;
  } catch {
    // Never surface upstream Auth/PostgREST errors or tokens to logs/callers.
    return null;
  }
}
