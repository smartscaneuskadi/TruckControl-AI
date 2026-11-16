/** Independent adversarial review. All mailbox/provider traffic is injected;
 * no live user, provider, model, database, storage or SMTP is contacted. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectedMailRequest,
  connectedScope,
  decodeConnectedCursor,
  encodeConnectedCursor,
} from "../supabase/functions/company-mail/connected-contract";
import type {
  ConnectedMailRequest,
  ConnectedScanContext,
} from "../supabase/functions/company-mail/connected-contract";
import { scanConnectedGmail } from "../supabase/functions/company-mail/connected-gmail";
import { scanConnectedImap } from "../supabase/functions/company-mail/connected-imap-core";
import type { ImapInvoiceConnection, ImapInvoiceMetadata } from "../supabase/functions/company-mail/connected-imap-core";
import { base64url, fromBase64 } from "../supabase/functions/_shared/invoice";
import type { ParsedMail } from "../supabase/functions/_shared/mail";
import { createMailGateway } from "../supabase/functions/company-mail/gateway";

const now = Date.UTC(2026, 10, 16, 12);
const org = "d2100000-0000-4000-8000-000000000001";
const actor = "d2100000-0000-4000-8000-000000000002";
const address = "isolated-mailbox@example.com";
const access = "synthetic-mail-access-token-for-isolated-test";
const cursorKey = "synthetic-cursor-signing-material-isolated-test-only";
const period = { from: "2026-11-01", to: "2026-11-16" };
const bytes = new TextEncoder().encode("%PDF-1.7\nIsolated invoice fixture; no fiscal validity\n%%EOF");
const stamp = String(now - 60000);
function body(): Record<string, unknown> {
  return {
    action: "import_connected_mailbox",
    organization_id: org,
    provider: "gmail",
    email: address,
    period: { ...period },
    analyze: true,
    consent: {
      version: "2026-11-16",
      accepted: true,
      mailbox: address,
      provider: "gmail",
      period: { ...period },
    },
    gmail_access_token: access,
  };
}
function input(): ConnectedMailRequest {
  return connectedMailRequest(body(), now);
}
function context() {
  const imported = vi.fn(async (_mail: ParsedMail) => ({ imported: 1, skipped: 0, failures: 0, ai_used: 1 }));
  const assertCurrent = vi.fn(async () => {});
  const value: ConnectedScanContext = {
    userId: actor,
    signal: new AbortController().signal,
    now: () => now,
    assertCurrent,
    importParsed: imported,
  };
  return { value, imported, assertCurrent };
}
type GmailOverride = {
  profile?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  full?: Record<string, unknown>;
  afterMetadata?: () => void;
  afterAttachment?: () => void;
  failure?: Response;
};
function gmailFixture(overrides: GmailOverride = {}) {
  const paths: string[] = [];
  const fetcher = vi.fn(async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(resource));
    expect(url.origin).toBe("https://gmail.googleapis.com");
    expect(url.href).not.toContain(access);
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("omit");
    expect(init?.cache).toBe("no-store");
    expect(init?.referrerPolicy).toBe("no-referrer");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer " + access);
    paths.push(url.pathname + url.search);
    if (overrides.failure) return overrides.failure;
    let data: Record<string, unknown>;
    if (url.pathname.endsWith("/profile")) {
      data = overrides.profile ?? { emailAddress: address };
    } else if (url.pathname.endsWith("/messages")) {
      expect(url.searchParams.get("q")).toContain("after:");
      expect(url.searchParams.get("q")).toContain("before:");
      expect(url.searchParams.get("maxResults")).toBe("10");
      data = { messages: [{ id: "message-one" }] };
    } else if (url.pathname.endsWith("/attachments/attachment-one")) {
      overrides.afterAttachment?.();
      data = { data: base64url(bytes) };
    } else if (url.searchParams.get("format") === "metadata") {
      overrides.afterMetadata?.();
      data = overrides.metadata ?? { internalDate: stamp, labelIds: ["INBOX"] };
    } else if (url.searchParams.get("format") === "full") {
      data = overrides.full ?? {
        internalDate: stamp,
        labelIds: ["INBOX"],
        payload: { filename: "isolated-invoice.pdf", body: { size: bytes.length, attachmentId: "attachment-one" } },
      };
    } else throw Error("Unexpected isolated Gmail fixture path");
    return Response.json(data);
  });
  return { fetcher: fetcher as typeof fetch, paths };
}
function imapFixture(overrides: { meta?: ImapInvoiceMetadata | false; full?: ImapInvoiceMetadata | false; validity?: string } = {}) {
  const meta: ImapInvoiceMetadata = {
    uid: 11,
    size: bytes.length,
    internalDate: new Date(Number(stamp)),
    flags: new Set(),
  };
  const client: ImapInvoiceConnection = {
    openInbox: vi.fn(async () => ({ uidValidity: overrides.validity ?? "191" })),
    search: vi.fn(async () => [11]),
    metadata: vi.fn(async () => overrides.meta === undefined ? meta : overrides.meta),
    source: vi.fn(async () => overrides.full === undefined ? { ...meta, source: bytes } : overrides.full),
  };
  return client;
}
function imapInput(): ConnectedMailRequest {
  const candidate = body();
  delete candidate.gmail_access_token;
  candidate.provider = "imap";
  candidate.connection = {
    email: address,
    username: "isolated-mailbox-user",
    password: "synthetic-password-never-sent-to-a-provider",
    imapHost: "imap.mail.yahoo.com",
    smtpHost: "smtp.mail.yahoo.com",
  };
  candidate.connector_consent = { version: "2026-11-13", accepted: true };
  (candidate.consent as Record<string, unknown>).provider = "imap";
  return connectedMailRequest(candidate, now);
}
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Real network forbidden in independent security review"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("unified mail: independent consent and continuation boundaries", () => {
  it.each([
    undefined,
    null,
    { version: "2026-11-13", accepted: true, mailbox: address, provider: "gmail", period },
    { version: "2026-11-16", accepted: false, mailbox: address, provider: "gmail", period },
    { version: "2026-11-16", accepted: true, mailbox: "different@example.com", provider: "gmail", period },
    { version: "2026-11-16", accepted: true, mailbox: address, provider: "imap", period },
    { version: "2026-11-16", accepted: true, mailbox: address, provider: "gmail", period: { ...period, from: "2026-11-02" } },
    { version: "2026-11-16", accepted: true, mailbox: address, provider: "gmail", period, extra: access },
  ])("rejects a missing, declined, stale or differently scoped acknowledgement %#", (consent) => {
    expect(() => connectedMailRequest({ ...body(), consent }, now)).toThrow(
      expect.objectContaining({ code: "mailbox_import_consent_required", status: 428 }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { from: "2025-11-01", to: "2026-11-16" },
    { from: "2026-11-01", to: "2026-11-17" },
    { from: "2026-11-16", to: "2026-11-01" },
    { from: "2026-02-30", to: "2026-11-16" },
    { ...period, time_zone: "UTC" },
  ])("rejects invalid, future or over-twelve-month periods before network %#", (invalid) => {
    const candidate = body();
    candidate.period = invalid;
    expect(() => connectedMailRequest(candidate, now)).toThrow(
      expect.objectContaining({ code: "invalid_received_period" }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects injected privilege/unknown fields and mixed provider credentials", () => {
    for (const injection of [{ actor_id: actor }, { user_id: actor }, { force_ai: true }, { confirmed: true }])
      expect(() => connectedMailRequest({ ...body(), ...injection }, now)).toThrow(
        expect.objectContaining({ code: "invalid_request" }),
      );
    expect(() => connectedMailRequest({ ...body(), connection: {} }, now)).toThrow(
      expect.objectContaining({ code: "invalid_mailbox_connection" }),
    );
  });

  it("binds a signed continuation to the actor, organization, account, provider and period", async () => {
    const original = input(), scope = await connectedScope(original, actor);
    const state = { page: "provider-page-token", offset: 1, attachment: 3, message: "message-one" };
    const cursor = await encodeConnectedCursor(cursorKey, scope, state, now);
    expect(await decodeConnectedCursor(cursorKey, scope, cursor, now)).toEqual(state);
    const decodedPayload = JSON.parse(new TextDecoder().decode(fromBase64(cursor.split(".")[0])));
    expect(Object.keys(decodedPayload).sort()).toEqual(["expires", "scope", "state", "v"]);
    expect(JSON.stringify(decodedPayload)).not.toContain(access);
    expect(JSON.stringify(decodedPayload)).not.toContain(address);
    for (const [request, user] of [
      [{ ...original, organizationId: "d2100000-0000-4000-8000-000000000009" }, actor],
      [{ ...original, email: "different@example.com" }, actor],
      [{ ...original, period: { ...original.period, key: original.period.key + ":different" } }, actor],
      [imapInput(), actor],
      [original, "d2100000-0000-4000-8000-000000000009"],
    ] as const) {
      await expect(decodeConnectedCursor(cursorKey, await connectedScope(request, user), cursor, now)).rejects.toMatchObject({
        code: "invalid_mailbox_cursor", status: 409,
      });
    }
    await expect(decodeConnectedCursor(cursorKey, scope, cursor, now + 3600000)).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
    const altered = base64url(new TextEncoder().encode(JSON.stringify({ ...decodedPayload, state: { ...state, attachment: 0 } }))) + "." + cursor.split(".")[1];
    await expect(decodeConnectedCursor(cursorKey, scope, altered, now)).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
  });
});

describe("unified Gmail: account, receipt date, revocation and network boundaries", () => {
  it("imports only a validated attachment from the selected account with metadata-first reads", async () => {
    const c = context(), gmail = gmailFixture();
    const result = await scanConnectedGmail(input(), c.value, cursorKey, gmail.fetcher);
    expect(result).toMatchObject({ imported: 1, examined: 1, ai_used: 1, has_more: false });
    expect(c.imported).toHaveBeenCalledTimes(1);
    expect(c.imported.mock.calls[0][0]).toMatchObject({
      subject: "", attachments: [{ name: "isolated-invoice.pdf", type: "application/pdf", bytes }],
    });
    expect(gmail.paths.map((path) => path.includes("format=metadata") ? "metadata" : path.includes("format=full") ? "full" : path.includes("/attachments/") ? "attachment" : "other")).toEqual(["other", "other", "metadata", "full", "attachment"]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects another actual Google profile before listing messages", async () => {
    const c = context(), gmail = gmailFixture({ profile: { emailAddress: "different@example.com" } });
    await expect(scanConnectedGmail(input(), c.value, cursorKey, gmail.fetcher)).rejects.toMatchObject({ code: "mailbox_identity_mismatch" });
    expect(gmail.paths).toEqual(["/gmail/v1/users/me/profile"]);
    expect(c.imported).not.toHaveBeenCalled();
  });

  it.each([
    { labelIds: ["INBOX"] },
    { internalDate: "invalid", labelIds: ["INBOX"] },
    { internalDate: String(now + 1), labelIds: ["INBOX"] },
    { internalDate: String(Date.UTC(2026, 9, 1)), labelIds: ["INBOX"] },
    { internalDate: stamp, labelIds: ["SENT"] },
    { internalDate: stamp, labelIds: ["DRAFT"] },
    { internalDate: stamp },
  ])("never fetches full content for out-of-scope or invalid receipt metadata %#", async (metadata) => {
    const c = context(), gmail = gmailFixture({ metadata });
    const result = await scanConnectedGmail(input(), c.value, cursorKey, gmail.fetcher);
    expect(result).toMatchObject({ imported: 0, skipped: 1, ai_used: 0 });
    expect(gmail.paths.some((path) => path.includes("format=full") || path.includes("/attachments/"))).toBe(false);
    expect(c.imported).not.toHaveBeenCalled();
  });

  it.each([
    { internalDate: String(now + 1), labelIds: ["INBOX"] },
    { internalDate: stamp, labelIds: ["SENT"] },
    { internalDate: stamp, labelIds: ["DRAFT"] },
  ])("rechecks full-message metadata before fetching any attachment %#", async (full) => {
    const c = context(), gmail = gmailFixture({ full });
    const result = await scanConnectedGmail(input(), c.value, cursorKey, gmail.fetcher);
    expect(result.imported).toBe(0);
    expect(gmail.paths.some((path) => path.includes("/attachments/"))).toBe(false);
    expect(c.imported).not.toHaveBeenCalled();
  });

  it.each(["metadata", "attachment"] as const)("stops after session/permission withdrawal during %s", async (stage) => {
    const c = context();
    let live = true;
    c.assertCurrent.mockImplementation(async () => { if (!live) throw Error("Isolated session withdrawn"); });
    const gmail = gmailFixture(stage === "metadata" ? { afterMetadata: () => { live = false; } } : { afterAttachment: () => { live = false; } });
    await expect(scanConnectedGmail(input(), c.value, cursorKey, gmail.fetcher)).rejects.toThrow("Isolated session withdrawn");
    expect(c.imported).not.toHaveBeenCalled();
    if (stage === "metadata") expect(gmail.paths.some((path) => path.includes("format=full"))).toBe(false);
  });

  it("rejects an altered cursor before contacting a mailbox", async () => {
    const c = context(), gmail = gmailFixture();
    await expect(scanConnectedGmail({ ...input(), cursor: "synthetic.altered" }, c.value, cursorKey, gmail.fetcher)).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
    expect(gmail.paths).toEqual([]);
  });

  it.each([401, 403, 503])("returns only a safe code for provider HTTP%s without exposing provider body or token", async (status) => {
    const c = context(), gmail = gmailFixture({ failure: Response.json({ error: "arbitrary_provider_text", description: access }, { status }) });
    let failure: unknown;
    try { await scanConnectedGmail(input(), c.value, cursorKey, gmail.fetcher); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: status === 503 ? "connected_mailbox_unavailable" : "mailbox_authorization_required" });
    expect(JSON.stringify(failure)).not.toContain(access);
    expect(String(failure)).not.toContain("arbitrary_provider_text");
    expect(c.imported).not.toHaveBeenCalled();
  });
});

describe("unified IMAP: INTERNALDATE and UIDVALIDITY boundaries", () => {
  it.each([
    false,
    { uid: 12, size: bytes.length, internalDate: new Date(Number(stamp)), flags: new Set() },
    { uid: 11, size: bytes.length, internalDate: new Date(now + 1), flags: new Set() },
    { uid: 11, size: bytes.length, internalDate: new Date(Date.UTC(2026, 9, 1)), flags: new Set() },
    { uid: 11, size: bytes.length, flags: new Set() },
    { uid: 11, size: bytes.length, internalDate: new Date(Number(stamp)), flags: new Set(["\\Draft"]) },
    { uid: 11, size: bytes.length, internalDate: new Date(Number(stamp)), flags: new Set(["\\Sent"]) },
  ] as const)("does not download source for invalid INTERNALDATE, UID or flags %#", async (meta) => {
    const c = context(), client = imapFixture({ meta });
    const result = await scanConnectedImap(imapInput(), c.value, cursorKey, client);
    expect(result).toMatchObject({ imported: 0, ai_used: 0, skipped: 1 });
    expect(client.source).not.toHaveBeenCalled();
    expect(c.imported).not.toHaveBeenCalled();
  });

  it("does not parse/import a source whose actual INTERNALDATE changed after metadata", async () => {
    const c = context(), client = imapFixture({ full: { uid: 11, size: bytes.length, internalDate: new Date(now + 1), flags: new Set(), source: bytes } });
    const result = await scanConnectedImap(imapInput(), c.value, cursorKey, client);
    expect(client.source).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(0);
    expect(c.imported).not.toHaveBeenCalled();
  });

  it("invalidates continuation after the mailbox changes UIDVALIDITY before searching messages", async () => {
    const request = imapInput(), scope = await connectedScope(request, actor);
    request.cursor = await encodeConnectedCursor(cursorKey, scope, { validity: "190", nextUid: 11, attachment: 0 }, now);
    const c = context(), client = imapFixture({ validity: "191" });
    await expect(scanConnectedImap(request, c.value, cursorKey, client)).rejects.toMatchObject({ code: "invalid_mailbox_cursor" });
    expect(client.search).not.toHaveBeenCalled();
    expect(client.source).not.toHaveBeenCalled();
    expect(c.imported).not.toHaveBeenCalled();
  });
});

describe("unified invoice AI: independently verified withdrawal around billable effects", () => {
  it.each(["after-reservation", "after-provider"] as const)(
    "does not start a stale model request or apply a late response when withdrawn %s",
    async (withdrawal) => {
      let live = true;
      const guard = vi.fn(async () => {
        if (!live) throw Error("Isolated human session withdrawn");
      });
      const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
        if (name === "company_provider_runtime_config") {
          return { error: null, data: {
            enabled: true,
            model: "gpt-6-luna",
            monthly_budget_cents: 1000,
          } };
        }
        if (name === "company_ai_budget_server") {
          if (args.p_action === "reserve") {
            if (withdrawal === "after-reservation") live = false;
            return { error: null, data: { id: "d2100000-0000-4000-8000-000000000008" } };
          }
          if (args.p_action === "settle") return { error: null, data: true };
        }
        if (name === "company_invoice_ai_apply") return { error: null, data: true };
        throw Error("Unexpected isolated database fixture operation");
      });
      const provider = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(url).toBe("https://api.openai.com/v1/responses");
        expect(init?.redirect).toBe("error");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          model: "gpt-6-luna", store: false, max_output_tokens: 1200,
          service_tier: "default", reasoning: { effort: "none" },
        });
        if (withdrawal === "after-provider") live = false;
        return Response.json({
          status: "completed",
          usage: { input_tokens: 100, output_tokens: 50 },
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            supplier: "Isolated supplier fixture", invoice_number: "DEMO-NO-FISCAL-VALIDITY",
            invoice_date: "2026-11-16", net_cents: 10000, tax_cents: 2100,
            total_cents: 12100, currency: "EUR",
          }) }] }],
        });
      });
      vi.stubGlobal("fetch", provider);
      const gateway = createMailGateway(
        { rpc } as unknown as Parameters<typeof createMailGateway>[0],
        "sk-" + "synthetic-not-a-real-api-key".repeat(3),
      );
      await expect(gateway.analyze!(org, actor, "d2100000-0000-4000-8000-000000000007", bytes, "application/pdf", guard)).rejects.toThrow("Isolated human session withdrawn");
      expect(rpc.mock.calls.filter(([name, args]) => name === "company_ai_budget_server" && args.p_action === "reserve")).toHaveLength(1);
      expect(provider).toHaveBeenCalledTimes(withdrawal === "after-provider" ? 1 : 0);
      expect(rpc.mock.calls.some(([name]) => name === "company_invoice_ai_apply")).toBe(false);
      // A reservation whose outcome is no longer trusted is never automatically
      // released, retried or turned into a license/payment/accounting action.
      expect(rpc.mock.calls.some(([, args]) => args.p_action === "release" || args.p_action === "cancel")).toBe(false);
    },
  );
});
