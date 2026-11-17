/** Independent grant/handler tests. Auth, mail, storage and AI are synthetic;
 * every unhandled network request is forbidden. No managed services are used. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertOpenSessionMailContext,
  automationIdentityFromVerifiedBearer,
  openMailAutomationPolicy,
  readOpenSessionMailGrant,
} from "../supabase/functions/_shared/mail-automation";
import type { OpenSessionMailGrant } from "../supabase/functions/_shared/mail-automation";
import {
  mailPeriodBounds,
  presetReceivedPeriod,
  resolveMailPeriod,
} from "../supabase/functions/_shared/mail-period";
import type { ReceivedPeriod } from "../supabase/functions/_shared/mail-period";
import { base64url, hash } from "../supabase/functions/_shared/invoice";
import type { ParsedMail } from "../supabase/functions/_shared/mail";
import {
  connectedMailboxCapability,
  connectedMailLimits,
  connectedMailRequest,
  connectedScope,
  decodeConnectedCursor,
  encodeConnectedCursor,
} from "../supabase/functions/company-mail/connected-contract";
import type { ConnectedMailboxScanner } from "../supabase/functions/company-mail/connected-contract";
import { scanConnectedGmail } from "../supabase/functions/company-mail/connected-gmail";
import { createMailHandler } from "../supabase/functions/company-mail/handler";
import type {
  MailAccess,
  MailConfig,
  MailGateway,
} from "../supabase/functions/company-mail/handler";

const now = Date.parse("2026-11-17T12:00:00.000Z");
const actor = "da710000-0000-4000-8000-000000000001";
const organization = "da710000-0000-4000-8000-000000000002";
const account = "da710000-0000-4000-8000-000000000003";
const session = "da710000-0000-4000-8000-000000000004";
const authorization = "da710000-0000-4000-8000-000000000005";
const other = "da710000-0000-4000-8000-000000000006";
const address = "isolated-grant@example.invalid";
const origin = "https://truckcontrolai.com";
const cursorKey = "synthetic-grant-cursor-material-for-isolated-tests-only";
const mailboxToken = "synthetic-mail-access-never-sent-to-a-real-provider";
const calendar = { from: "2026-11-01", to: "2026-11-17" };
const iso = (stamp: number) => new Date(stamp).toISOString();

function grant(
  extra: Partial<OpenSessionMailGrant> = {},
  at = now,
): OpenSessionMailGrant {
  const period = at === now ? { ...calendar } : presetReceivedPeriod("30d", at);
  return {
    version: openMailAutomationPolicy.consent_version,
    accepted: true,
    id: authorization,
    actor_id: actor,
    organization_id: organization,
    account_id: account,
    session_id: session,
    aal: "aal1",
    mailbox: address,
    provider: "gmail",
    period,
    started_at: iso(at),
    expires_at: iso(
      Math.min(
        at + openMailAutomationPolicy.max_session_ms,
        resolveMailPeriod(period, at).end,
      ),
    ),
    ...extra,
  };
}

function expected(extra: Record<string, string> = {}) {
  return {
    actorId: actor,
    organizationId: organization,
    accountId: account,
    email: address,
    provider: "gmail",
    sessionId: session,
    aal: "aal1",
    ...extra,
  };
}

function bearer(claims: Record<string, unknown> = {}) {
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: actor,
        session_id: session,
        aal: "aal1",
        ...claims,
      }),
    ),
  );
  // The fixture's authenticate() stands in for Auth's verification. This parser
  // test does not treat a synthetic signature or unverified claims as access.
  return "eyJhbGciOiJzeW50aGV0aWMifQ." + payload + ".synthetic";
}

function body(
  automatic: unknown = grant(),
  period: ReceivedPeriod = calendar,
): Record<string, unknown> {
  return {
    action: "import_connected_mailbox",
    organization_id: organization,
    provider: "gmail",
    email: address,
    period: { ...period },
    analyze: true,
    gmail_access_token: mailboxToken,
    consent: {
      version: "2026-11-16",
      accepted: true,
      mailbox: address,
      provider: "gmail",
      period: { ...period },
    },
    ...(automatic === undefined ? {} : { automation: automatic }),
  };
}

function request(payload: unknown, token = bearer(), signal?: AbortSignal) {
  return new Request("https://isolated.test/company-mail", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(payload),
    signal,
  });
}

const bytes = new TextEncoder().encode(
  "%PDF-1.7\nSYNTHETIC GRANT TEST; no fiscal validity\n%%EOF\n",
);
async function parsedMail(): Promise<ParsedMail> {
  return {
    messageId: "connected:v1:synthetic-grant-message",
    subject: "",
    skipped: 0,
    attachments: [
      {
        bytes,
        name: "Synthetic-grant.pdf",
        type: "application/pdf",
        attachmentId: "synthetic-part",
        contentHash: await hash(bytes),
      },
    ],
  };
}

function handlerFixture() {
  let clock = now;
  let scanning = false;
  let scanner: ConnectedMailboxScanner = async (_input, context) => {
    await context.assertCurrent();
    return {
      ...(await context.importParsed(await parsedMail())),
      examined: 1,
      has_more: false,
      next_cursor: null,
    };
  };
  const records = new Set<string>();
  const access: MailAccess = {
    active: true,
    can_write: true,
    can_manage: false,
    features: { gmail: true, invoice_ai: true },
  };
  const gateway: MailGateway = {
    authenticate: vi.fn(async () => ({ id: actor })),
    access: vi.fn(async () => access),
    server: vi.fn(
      async <T>(action: string, data: Record<string, unknown>): Promise<T> => {
        if (action === "exists")
          return records.has(String(data.content_hash)) as T;
        if (action === "record_invoice") {
          const contentHash = String(data.content_hash);
          if (records.has(contentHash)) return { duplicate: true } as T;
          records.add(contentHash);
          return {
            id: "da710000-0000-4000-8000-000000000007",
            duplicate: false,
          } as T;
        }
        if (action === "get_inbox") return null as T;
        throw Error("Unexpected synthetic persistence action");
      },
    ),
    upload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    aiStatus: vi.fn(async () => true),
    analyze: vi.fn(async () => true),
  };
  const provider = vi.fn(async (resource: RequestInfo | URL) => {
    const url = new URL(String(resource));
    if (url.href === "https://gmail.googleapis.com/gmail/v1/users/me/profile")
      return Response.json({ emailAddress: address });
    if (url.pathname === "/gmail/v1/users/me/messages")
      return Response.json({ messages: [] });
    throw Error("Unexpected injected provider path");
  });
  const connectedMailbox = vi.fn<ConnectedMailboxScanner>(
    async (input, context) => {
      scanning = true;
      return scanner(input, context);
    },
  );
  const config: MailConfig = {
    origins: [origin],
    connectedMailboxCursorKey: cursorKey,
    now: () => clock,
    connectedMailbox,
  };
  return {
    gateway,
    access,
    records,
    provider,
    connectedMailbox,
    handler: createMailHandler(gateway, config),
    setClock(value: number) {
      clock = value;
    },
    isScanning: () => scanning,
    useScanner(value: ConnectedMailboxScanner) {
      scanner = value;
    },
    useGmailScanner() {
      scanner = (input, context) =>
        scanConnectedGmail(input, context, cursorKey, provider as typeof fetch);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Real network forbidden in mail grant tests");
    }),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("foreground mail authorization: explicit, fixed and bounded", () => {
  it("projects a separate grant and does not inherit later changes to the caller's object", () => {
    const input = grant();
    const captured = readOpenSessionMailGrant(input, calendar, now);
    input.period.from = "2026-10-01";
    input.expires_at = iso(now + 1);
    input.account_id = other;
    expect(captured).toEqual(grant());
    expect(captured).not.toBe(input);
    expect(captured.period).not.toBe(input.period);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["array", []],
    ["declined", { ...grant(), accepted: false }],
    ["old consent", { ...grant(), version: "2026-11-16" }],
    ["unknown permission", { ...grant(), can_manage: true }],
    ["credential field", { ...grant(), gmail_access_token: mailboxToken }],
    [
      "unknown period key",
      { ...grant(), period: { ...calendar, time_zone: "UTC" } },
    ],
    ["invalid AAL", { ...grant(), aal: "aal3" }],
    ["unknown provider", { ...grant(), provider: "smtp" }],
    [
      "invalid mailbox",
      { ...grant(), mailbox: "injected\r\n@example.invalid" },
    ],
    [
      "invalid account identity",
      { ...grant(), account_id: "same-email-is-not-an-account-id" },
    ],
    ["missing SID", { ...grant(), session_id: "" }],
    ["non-canonical start", { ...grant(), started_at: "2026-11-17T12:00:00Z" }],
  ])("rejects %s without converting it into permission", (_label, input) => {
    expect(() => readOpenSessionMailGrant(input, calendar, now)).toThrow();
  });

  it.each([
    ["future start", { started_at: iso(now + 5001) }],
    ["expired at this instant", { expires_at: iso(now) }],
    ["negative lifetime", { expires_at: iso(now - 1) }],
    [
      "more than the fixed maximum",
      { expires_at: iso(now + openMailAutomationPolicy.max_session_ms + 1) },
    ],
    [
      "renewed end with the same original start",
      {
        started_at: iso(now - 1),
        expires_at: iso(now + openMailAutomationPolicy.max_session_ms),
      },
    ],
  ])("rejects %s", (_label, patch) => {
    expect(() =>
      readOpenSessionMailGrant(grant(patch), calendar, now),
    ).toThrowError("automation_expired");
  });

  it("does not renew the expiry when the grant is read again", () => {
    const original = grant();
    const later = now + openMailAutomationPolicy.max_session_ms - 1;
    expect(readOpenSessionMailGrant(original, calendar, later).expires_at).toBe(
      original.expires_at,
    );
    expect(() =>
      readOpenSessionMailGrant(original, calendar, later + 1),
    ).toThrowError("automation_expired");
  });

  it("allows only narrowing within the original range while retaining its authorized end day", () => {
    expect(
      readOpenSessionMailGrant(
        grant(),
        { from: calendar.to, to: calendar.to },
        now,
      ).period,
    ).toEqual(calendar);
    for (const period of [
      { from: "2026-10-31", to: calendar.to },
      { from: calendar.from, to: "2026-11-18" },
      { from: calendar.from, to: "2026-11-16" },
    ])
      expect(() => readOpenSessionMailGrant(grant(), period, now)).toThrowError(
        "automation_expired",
      );
    const historical = { from: calendar.from, to: "2026-11-16" };
    expect(() =>
      readOpenSessionMailGrant(grant({ period: historical }), historical, now),
    ).toThrowError("automation_expired");
  });

  it("accepts the exact twelve-month boundary and rejects an earlier date", () => {
    const bounds = mailPeriodBounds(now);
    const period = { from: bounds.earliest, to: bounds.today };
    expect(
      readOpenSessionMailGrant(grant({ period }), period, now).period,
    ).toEqual(period);
    const before = iso(
      Date.parse(bounds.earliest + "T00:00:00Z") - 86400000,
    ).slice(0, 10);
    const tooOld = { from: before, to: bounds.today };
    expect(() =>
      readOpenSessionMailGrant(grant({ period: tooOld }), tooOld, now),
    ).toThrowError("automation_expired");
  });

  it.each([
    [
      "spring's 23-hour day",
      "2026-03-29T21:30:00.000Z",
      "2026-03-29T22:00:00.000Z",
    ],
    [
      "autumn's 25-hour day",
      "2026-10-25T22:30:00.000Z",
      "2026-10-25T23:00:00.000Z",
    ],
  ])("expires at Madrid midnight on %s", (_label, start, midnight) => {
    const at = Date.parse(start),
      end = Date.parse(midnight);
    const authorized = grant({}, at);
    expect(authorized.expires_at).toBe(midnight);
    expect(
      readOpenSessionMailGrant(authorized, authorized.period, end - 1)
        .expires_at,
    ).toBe(midnight);
    expect(() =>
      readOpenSessionMailGrant(authorized, authorized.period, end),
    ).toThrowError("automation_expired");
    expect(() =>
      readOpenSessionMailGrant(
        { ...authorized, expires_at: iso(end + 1) },
        authorized.period,
        at,
      ),
    ).toThrowError("automation_expired");
  });

  it.each(["2026-03-29T00:30:00.000Z", "2026-10-25T00:30:00.000Z"])(
    "does not gain an hour across the Madrid clock transition starting %s",
    (start) => {
      const at = Date.parse(start),
        authorized = grant({}, at);
      const end = at + openMailAutomationPolicy.max_session_ms;
      expect(Date.parse(authorized.expires_at)).toBe(end);
      expect(
        readOpenSessionMailGrant(authorized, authorized.period, end - 1)
          .expires_at,
      ).toBe(iso(end));
      expect(() =>
        readOpenSessionMailGrant(authorized, authorized.period, end),
      ).toThrowError("automation_expired");
    },
  );
});

describe("foreground grant: identity and captured native session", () => {
  it.each([
    ["actor", { actorId: other }],
    ["organization", { organizationId: other }],
    ["reconnected account", { accountId: other }],
    ["mailbox", { email: "other@example.invalid" }],
    ["provider", { provider: "imap" }],
    ["SID", { sessionId: other }],
    ["AAL", { aal: "aal2" }],
  ])("rejects another %s", (_label, patch) => {
    expect(() =>
      assertOpenSessionMailContext(grant(), expected(patch), calendar, now),
    ).toThrowError("automation_context_changed");
  });

  it("compares mailbox spelling without allowing a different account ID", () => {
    expect(() =>
      assertOpenSessionMailContext(
        grant(),
        expected({ email: address.toUpperCase() }),
        calendar,
        now,
      ),
    ).not.toThrow();
    expect(() =>
      assertOpenSessionMailContext(
        grant(),
        expected({ email: address.toUpperCase(), accountId: other }),
        calendar,
        now,
      ),
    ).toThrowError("automation_context_changed");
  });

  it("extracts SID/AAL only for the exact subject already verified by Auth", () => {
    expect(automationIdentityFromVerifiedBearer(bearer(), actor)).toEqual({
      sessionId: session,
      aal: "aal1",
    });
    expect(
      automationIdentityFromVerifiedBearer(bearer({ aal: "aal2" }), actor),
    ).toEqual({ sessionId: session, aal: "aal2" });
    expect(() =>
      automationIdentityFromVerifiedBearer(bearer(), other),
    ).toThrowError("automation_context_changed");
  });

  it.each([
    ["another subject", { sub: other }],
    ["missing SID", { session_id: null }],
    ["invalid SID", { session_id: "synthetic-non-uuid" }],
    ["missing AAL", { aal: null }],
    ["unknown AAL", { aal: "aal3" }],
  ])("does not extract a native binding from %s", (_label, claims) => {
    expect(() =>
      automationIdentityFromVerifiedBearer(bearer(claims), actor),
    ).toThrowError("automation_context_changed");
  });
});

describe("connected continuation: original authorization and account binding", () => {
  it("keeps the legacy manual scope exactly unchanged", async () => {
    const candidate = body();
    delete candidate.automation;
    const input = connectedMailRequest(candidate, now);
    const legacy = await hash(
      new TextEncoder().encode(
        JSON.stringify([
          "connected-mail-v1",
          organization,
          actor,
          "gmail",
          address,
          "",
          "",
          input.period.key,
        ]),
      ),
    );
    expect(await connectedScope(input, actor)).toBe(legacy);
    expect(input.automation).toBeUndefined();
  });

  it("advertises automation additively and retains the manual attachment limit", () => {
    const capability = connectedMailboxCapability(cursorKey)!;
    expect(capability.automation).toEqual(openMailAutomationPolicy);
    expect(capability.max_attachments).toBe(connectedMailLimits.attachments);
    expect(capability.consent_version).toBe("2026-11-16");
    expect(connectedMailboxCapability(undefined)).toBeNull();
  });

  it.each([
    ["another authorization", { id: other }],
    ["another account", { account_id: other }],
    ["another SID", { session_id: other }],
    ["another AAL", { aal: "aal2" as const }],
    ["a changed start", { started_at: iso(now - 1) }],
    [
      "an extended expiry",
      { expires_at: iso(now + openMailAutomationPolicy.max_session_ms - 1) },
    ],
  ])("rejects a signed cursor reused with %s", async (_label, patch) => {
    const original = connectedMailRequest(
      body(
        grant({
          expires_at: iso(now + openMailAutomationPolicy.max_session_ms - 1000),
        }),
      ),
      now,
    );
    const cursor = await encodeConnectedCursor(
      cursorKey,
      await connectedScope(original, actor),
      { page: "opaque", offset: 0 },
      now,
    );
    const changed = connectedMailRequest(
      body({ ...original.automation!, ...patch }),
      now,
    );
    await expect(
      decodeConnectedCursor(
        cursorKey,
        await connectedScope(changed, actor),
        cursor,
        now,
      ),
    ).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
    await expect(
      decodeConnectedCursor(
        cursorKey,
        await connectedScope(original, actor),
        cursor,
        now,
      ),
    ).resolves.toEqual({ page: "opaque", offset: 0 });
  });

  it("binds the original authorization range even after the requested scan has narrowed to today", async () => {
    const today = { from: calendar.to, to: calendar.to };
    const original = connectedMailRequest(body(grant(), today), now);
    const cursor = await encodeConnectedCursor(
      cursorKey,
      await connectedScope(original, actor),
      { page: "narrowed-today", offset: 0 },
      now,
    );
    const changed = connectedMailRequest(
      body(grant({ period: { from: "2026-10-01", to: calendar.to } }), today),
      now,
    );
    await expect(
      decodeConnectedCursor(
        cursorKey,
        await connectedScope(changed, actor),
        cursor,
        now,
      ),
    ).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
  });

  it("cannot reuse an automatic continuation through the manual contract", async () => {
    const original = connectedMailRequest(body(), now);
    const cursor = await encodeConnectedCursor(
      cursorKey,
      await connectedScope(original, actor),
      { page: "automatic" },
      now,
    );
    const payload = body();
    delete payload.automation;
    const manual = connectedMailRequest(payload, now);
    await expect(
      decodeConnectedCursor(
        cursorKey,
        await connectedScope(manual, actor),
        cursor,
        now,
      ),
    ).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
  });
});

describe("company-mail handler: grant checks surround every effect", () => {
  it("imports a valid automatic request through the existing private-original and analysis path", async () => {
    const f = handlerFixture();
    const response = await f.handler(request(body()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 1,
      ai_used: 1,
      failures: 0,
      consent_version: "2026-11-16",
    });
    expect(f.gateway.upload).toHaveBeenCalledTimes(1);
    expect(f.gateway.analyze).toHaveBeenCalledTimes(1);
    expect(
      vi
        .mocked(f.gateway.authenticate)
        .mock.calls.every(([token]) => token === bearer()),
    ).toBe(true);
  });

  it.each([
    ["unknown grant field", { ...grant(), cron: true }],
    ["null grant", null],
    ["expired grant", grant({ expires_at: iso(now) })],
    ["different company", grant({ organization_id: other })],
    ["different mailbox", grant({ mailbox: "other@example.invalid" })],
    ["different provider", grant({ provider: "imap" })],
    ["different actor", grant({ actor_id: other })],
    ["different SID", grant({ session_id: other })],
    ["different AAL", grant({ aal: "aal2" })],
  ])(
    "rejects %s before the scanner or storage runs",
    async (_label, invalid) => {
      const f = handlerFixture();
      const response = await f.handler(request(body(invalid)));
      expect(response.status).toBe(428);
      expect(f.connectedMailbox).not.toHaveBeenCalled();
      expect(f.gateway.upload).not.toHaveBeenCalled();
      expect(f.gateway.server).not.toHaveBeenCalled();
      expect(f.gateway.analyze).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown request controls instead of accepting an automatic privilege override", async () => {
    const f = handlerFixture();
    const response = await f.handler(
      request({ ...body(), max_new_attachments: 10, can_write: true }),
    );
    expect(response.status).toBe(400);
    expect(f.connectedMailbox).not.toHaveBeenCalled();
  });

  it("does not use a syntactically matching JWT as authentication", async () => {
    const f = handlerFixture();
    vi.mocked(f.gateway.authenticate).mockResolvedValue(null);
    const response = await f.handler(request(body()));
    expect(response.status).toBe(401);
    expect(f.connectedMailbox).not.toHaveBeenCalled();
    expect(f.gateway.access).not.toHaveBeenCalled();
  });

  it("checks expiry after reauthenticating the bearer, not only when parsing JSON", async () => {
    const f = handlerFixture(),
      expires = Date.parse(grant().expires_at);
    let calls = 0;
    vi.mocked(f.gateway.authenticate).mockImplementation(async () => {
      if (++calls === 2) f.setClock(expires);
      return { id: actor };
    });
    const response = await f.handler(request(body()));
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ error: "automation_expired" });
    expect(f.connectedMailbox).not.toHaveBeenCalled();
    expect(f.gateway.upload).not.toHaveBeenCalled();
  });

  it.each(["company permissions", "AI availability"])(
    "does not contact Gmail when expiry occurs during %s immediately before the provider effect",
    async (phase) => {
      const f = handlerFixture(),
        expires = Date.parse(grant().expires_at);
      f.useGmailScanner();
      if (phase === "company permissions") {
        vi.mocked(f.gateway.access).mockImplementation(async () => {
          if (f.isScanning()) f.setClock(expires);
          return f.access;
        });
      } else {
        vi.mocked(f.gateway.aiStatus!).mockImplementation(async () => {
          if (f.isScanning()) f.setClock(expires);
          return true;
        });
      }
      const response = await f.handler(request(body()));
      expect(response.status).toBe(428);
      expect(await response.json()).toEqual({ error: "automation_expired" });
      expect(f.provider).not.toHaveBeenCalled();
      expect(f.gateway.upload).not.toHaveBeenCalled();
      expect(f.gateway.analyze).not.toHaveBeenCalled();
    },
  );

  it("expires before upload if the duplicate lookup finishes after the grant ends", async () => {
    const f = handlerFixture(),
      expires = Date.parse(grant().expires_at);
    vi.mocked(f.gateway.server).mockImplementation(
      async <T>(action: string): Promise<T> => {
        if (action === "exists") {
          f.setClock(expires);
          return false as T;
        }
        throw Error("Persistence after expiry is forbidden");
      },
    );
    const response = await f.handler(request(body()));
    expect(response.status).toBe(428);
    expect(f.gateway.upload).not.toHaveBeenCalled();
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });

  it("does not upload if the grant expires during the last permission check before storage", async () => {
    const f = handlerFixture(),
      expires = Date.parse(grant().expires_at);
    let beforeStorage = false;
    vi.mocked(f.gateway.server).mockImplementation(
      async <T>(action: string): Promise<T> => {
        if (action === "exists") {
          beforeStorage = true;
          return false as T;
        }
        throw Error("Persistence after expiry is forbidden");
      },
    );
    vi.mocked(f.gateway.access).mockImplementation(async () => {
      if (beforeStorage) f.setClock(expires);
      return f.access;
    });
    const response = await f.handler(request(body()));
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ error: "automation_expired" });
    expect(f.gateway.upload).not.toHaveBeenCalled();
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });

  it("removes only an unregistered new upload when expiry prevents record_invoice", async () => {
    const f = handlerFixture(),
      expires = Date.parse(grant().expires_at);
    vi.mocked(f.gateway.upload).mockImplementation(async () => {
      f.setClock(expires);
    });
    const response = await f.handler(request(body()));
    expect(response.status).toBe(428);
    expect(f.gateway.upload).toHaveBeenCalledTimes(1);
    expect(
      vi
        .mocked(f.gateway.server)
        .mock.calls.filter(([action]) => action === "record_invoice"),
    ).toHaveLength(0);
    expect(f.gateway.remove).toHaveBeenCalledTimes(1);
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });

  it("keeps a committed original when expiry prevents the subsequent AI effect", async () => {
    const f = handlerFixture(),
      expires = Date.parse(grant().expires_at);
    vi.mocked(f.gateway.server).mockImplementation(
      async <T>(action: string, data: Record<string, unknown>): Promise<T> => {
        if (action === "exists") return false as T;
        if (action === "record_invoice") {
          f.records.add(String(data.content_hash));
          f.setClock(expires);
          return {
            id: "da710000-0000-4000-8000-000000000007",
            duplicate: false,
          } as T;
        }
        throw Error("Unexpected synthetic persistence action");
      },
    );
    const response = await f.handler(request(body()));
    expect(response.status).toBe(428);
    expect(f.records.size).toBe(1);
    expect(f.gateway.remove).not.toHaveBeenCalled();
    expect(f.gateway.analyze).not.toHaveBeenCalled();
  });

  it("still requires the existing exact mailbox/period consent alongside the new grant", async () => {
    const f = handlerFixture();
    const payload = body();
    (payload.consent as Record<string, unknown>).accepted = false;
    const response = await f.handler(request(payload));
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({
      error: "mailbox_import_consent_required",
    });
    expect(f.connectedMailbox).not.toHaveBeenCalled();
  });

  it("preserves the manual import path without requiring an automation grant or JWT hints", async () => {
    const f = handlerFixture();
    const payload = body();
    delete payload.automation;
    const response = await f.handler(
      request(payload, "legacy-synthetic-verified-session"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 1,
      ai_used: 1,
      failures: 0,
    });
    expect(f.connectedMailbox.mock.calls[0][0].automation).toBeUndefined();
    expect(f.gateway.analyze).toHaveBeenCalledTimes(1);
  });

  it("never sends the grant, bearer or mailbox access token into persistence/analysis metadata", async () => {
    const f = handlerFixture();
    const response = await f.handler(request(body()));
    expect(response.status).toBe(200);
    const persisted = JSON.stringify(vi.mocked(f.gateway.server).mock.calls);
    for (const forbidden of [
      mailboxToken,
      bearer(),
      "automation",
      "session_id",
      "account_id",
      address,
    ])
      expect(persisted).not.toContain(forbidden);
    const parameters = vi.mocked(f.gateway.analyze!).mock.calls[0];
    expect(parameters.slice(0, 3)).toEqual([
      organization,
      actor,
      "da710000-0000-4000-8000-000000000007",
    ]);
    expect(parameters[3]).toEqual(bytes);
    expect(parameters[4]).toBe("application/pdf");
    expect(parameters[5]).toBeTypeOf("function");
  });
});
