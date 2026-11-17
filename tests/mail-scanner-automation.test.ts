/** Scanner-only fixtures: injected Gmail/IMAP transports and imports, no live mail or AI. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostalMime from "postal-mime";
import { base64, hash } from "../supabase/functions/_shared/invoice";
import { resolveMailPeriod } from "../supabase/functions/_shared/mail-period";
import type { ParsedMail } from "../supabase/functions/_shared/mail";
import type { OpenSessionMailGrant } from "../supabase/functions/_shared/mail-automation";
import {
  connectedMailLimits,
  connectedScope,
  decodeConnectedCursor,
} from "../supabase/functions/company-mail/connected-contract";
import type {
  ConnectedMailRequest,
  ConnectedScanContext,
  ConnectedScanResult,
} from "../supabase/functions/company-mail/connected-contract";
import { scanConnectedGmail } from "../supabase/functions/company-mail/connected-gmail";
import { scanConnectedImap } from "../supabase/functions/company-mail/connected-imap-core";
import type { ImapInvoiceConnection } from "../supabase/functions/company-mail/connected-imap-core";

const now = Date.parse("2026-11-17T12:00:00.000Z");
const organizationId = "db100000-0000-4000-8000-000000000001";
const userId = "db100000-0000-4000-8000-000000000002";
const email = "isolated-scanner@example.com";
const key = "fictitious-scanner-cursor-key-for-isolated-tests-only";
const calendar = { from: "2026-11-01", to: "2026-11-17" };
const pdf = (n = 0) =>
  new TextEncoder().encode(
    `%PDF-1.7\nFICTITIOUS ${n}; no fiscal validity\n%%EOF\n`,
  );
const success = { imported: 1, skipped: 0, failures: 0, ai_used: 1 };
const duplicate = { imported: 0, skipped: 1, failures: 0, ai_used: 0 };

function input(
  provider: "gmail" | "imap",
  automatic = true,
): ConnectedMailRequest {
  const automation: OpenSessionMailGrant = {
    version: "2026-11-17",
    accepted: true,
    id: "db100000-0000-4000-8000-000000000003",
    actor_id: userId,
    organization_id: organizationId,
    account_id: "db100000-0000-4000-8000-000000000004",
    session_id: "db100000-0000-4000-8000-000000000005",
    aal: "aal1",
    mailbox: email,
    provider,
    period: calendar,
    started_at: new Date(now).toISOString(),
    expires_at: new Date(now + 3600000).toISOString(),
  };
  return {
    organizationId,
    provider,
    email,
    period: resolveMailPeriod(calendar, now),
    cursor: null,
    ...(provider === "gmail"
      ? { gmailAccessToken: "fictitious-scanner-access-token-only" }
      : {}),
    ...(automatic ? { automation } : {}),
  };
}
function context() {
  const stored = new Set<string>();
  const imported = vi.fn(async (mail: ParsedMail) => {
    const contentHash = mail.attachments[0].contentHash;
    if (stored.has(contentHash)) return { ...duplicate };
    stored.add(contentHash);
    return { ...success };
  });
  const value: ConnectedScanContext = {
    userId,
    now: () => now,
    signal: new AbortController().signal,
    assertCurrent: vi.fn(async () => {}),
    importParsed: imported,
  };
  return { value, imported, stored };
}
async function cursor(
  request: ConnectedMailRequest,
  result: ConnectedScanResult,
) {
  expect(result.has_more).toBe(true);
  expect(result.next_cursor).toBeTypeOf("string");
  return decodeConnectedCursor(
    key,
    await connectedScope(request, userId),
    result.next_cursor,
    now,
  );
}

type Data = Record<string, unknown>;
type GmailMessage = { id: string; parts: Data[]; metadata?: Data };
type GmailPage = { messages: GmailMessage[]; token?: string };
function part(n = 0, extra: Data = {}): Data {
  return {
    filename: `Fictitious-${n}.pdf`,
    body: { size: pdf(n).length, attachmentId: `a${n}` },
    ...extra,
  };
}
function gmail(pages: GmailPage[], replies: Record<string, Data> = {}) {
  const paths: string[] = [];
  const messages = pages.flatMap((page) => page.messages);
  const fetcher = vi.fn(async (resource: RequestInfo | URL) => {
    const url = new URL(String(resource));
    expect(url.origin).toBe("https://gmail.googleapis.com");
    paths.push(url.pathname + url.search);
    if (url.pathname.endsWith("/profile"))
      return Response.json({ emailAddress: email });
    if (url.pathname.endsWith("/messages")) {
      const pageIndex = Number(url.searchParams.get("pageToken") ?? 0);
      const page = pages[pageIndex];
      if (!page) throw Error("Unexpected isolated page");
      return Response.json({
        messages: page.messages.map(({ id }) => ({ id })),
        ...(page.token ? { nextPageToken: page.token } : {}),
      });
    }
    const attachment = url.pathname.match(/\/attachments\/(a\d+)$/);
    if (attachment)
      return Response.json(
        replies[attachment[1]] ?? {
          data: base64(pdf(Number(attachment[1].slice(1)))),
        },
      );
    const message = messages.find(({ id }) =>
      url.pathname.endsWith("/messages/" + id),
    );
    if (!message) throw Error("Unexpected isolated message");
    const metadata = message.metadata ?? {
      internalDate: String(now - 1000),
      labelIds: ["INBOX"],
    };
    if (url.searchParams.get("format") === "metadata")
      return Response.json(metadata);
    if (url.searchParams.get("format") === "full")
      return Response.json({ ...metadata, payload: { parts: message.parts } });
    throw Error("Unexpected isolated Gmail path");
  });
  return {
    fetcher: fetcher as typeof fetch,
    paths,
    downloads: () => paths.filter((path) => path.includes("/attachments/")),
  };
}
const oneMessage = (parts: Data[]): GmailPage[] => [
  { messages: [{ id: "m1", parts }] },
];

function eml(contents: Uint8Array[]) {
  const boundary = "fictitious-scanner-test-boundary";
  return new TextEncoder().encode(
    [
      "From: fictitious@example.com",
      `To: ${email}`,
      "Subject: Fictitious invoice",
      "Date: Sat, 01 Jan 2000 12:00:00 +0000",
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      ...contents.map((bytes, n) =>
        [
          `--${boundary}`,
          "Content-Type: application/pdf",
          `Content-Disposition: attachment; filename="Fictitious-${n}.pdf"`,
          "Content-Transfer-Encoding: base64",
          "",
          base64(bytes),
        ].join("\r\n"),
      ),
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
}
function imap(raws: Uint8Array[]) {
  const meta = (uid: number) => ({
    uid,
    size: raws[uid - 1].length,
    internalDate: new Date(now - 1000),
    flags: new Set<string>(),
  });
  const client: ImapInvoiceConnection = {
    openInbox: vi.fn(async () => ({ uidValidity: "42" })),
    search: vi.fn(async () => raws.map((_, index) => index + 1)),
    metadata: vi.fn(async (uid) => meta(uid)),
    source: vi.fn(async (uid) => ({ ...meta(uid), source: raws[uid - 1] })),
  };
  return client;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw Error("Live traffic is forbidden in scanner fixtures");
    }),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Gmail: explicit rejected parts and bounded foreground automation", () => {
  it.each([
    [
      "oversize",
      { body: { size: connectedMailLimits.fileBytes + 1, attachmentId: "a0" } },
    ],
    ["empty", { body: { size: 0, attachmentId: "a0" } }],
    ["negative", { body: { size: -1, attachmentId: "a0" } }],
    ["missing size", { body: { attachmentId: "a0" } }],
    [
      "string size",
      { body: { size: String(pdf().length), attachmentId: "a0" } },
    ],
    [
      "invalid id",
      { body: { size: pdf().length, attachmentId: "../invalid" } },
    ],
    ["missing content", { body: { size: pdf().length } }],
    ["invalid body", { body: null }],
    ["long filename", { filename: "x".repeat(1025) }],
    ["invalid filename", { filename: 123 }],
  ] satisfies [string, Data][])(
    "reports %s without fetching rejected attachment bytes",
    async (_label, extra) => {
      const f = gmail(oneMessage([part(0, extra)])),
        c = context();
      const result = await scanConnectedGmail(
        input("gmail"),
        c.value,
        key,
        f.fetcher,
      );
      expect(result).toMatchObject({
        imported: 0,
        skipped: 1,
        failures: 1,
        ai_used: 0,
        has_more: false,
        next_cursor: null,
      });
      expect(f.downloads()).toEqual([]);
      expect(c.imported).not.toHaveBeenCalled();
    },
  );

  it("counts a previously invisible oversize part in manual mode and keeps scanning valid parts", async () => {
    const f = gmail(
      oneMessage([
        part(0, {
          body: { size: connectedMailLimits.fileBytes + 1, attachmentId: "a0" },
        }),
        part(1),
      ]),
    );
    const c = context();
    expect(
      await scanConnectedGmail(input("gmail", false), c.value, key, f.fetcher),
    ).toMatchObject({
      imported: 1,
      skipped: 1,
      failures: 1,
      ai_used: 1,
      has_more: false,
    });
    expect(f.downloads()).toEqual([
      "/gmail/v1/users/me/messages/m1/attachments/a1",
    ]);
  });

  it.each([
    { data: "?invalid" },
    { data: "A" },
    {},
    { data: base64(new TextEncoder().encode("not a supported document")) },
    { data: base64(pdf(123456789)) },
  ])(
    "stops on invalid fetched content and preserves the next part %#",
    async (reply) => {
      const request = input("gmail"),
        c = context();
      const f = gmail(oneMessage([part(0), part(1)]), { a0: reply });
      const result = await scanConnectedGmail(request, c.value, key, f.fetcher);
      expect(result).toMatchObject({
        imported: 0,
        skipped: 1,
        failures: 1,
        ai_used: 0,
      });
      expect(await cursor(request, result)).toEqual({
        page: "",
        offset: 0,
        attachment: 1,
        message: "m1",
      });
      expect(f.downloads()).toHaveLength(1);
      expect(c.imported).not.toHaveBeenCalled();
    },
  );

  it("stops on an oversize descriptor before downloading the following valid part", async () => {
    const request = input("gmail"),
      c = context();
    const f = gmail(
      oneMessage([
        part(0, {
          body: { size: connectedMailLimits.fileBytes + 1, attachmentId: "a0" },
        }),
        part(1),
      ]),
    );
    const result = await scanConnectedGmail(request, c.value, key, f.fetcher);
    expect(result.failures).toBe(1);
    expect(await cursor(request, result)).toMatchObject({
      attachment: 1,
      message: "m1",
    });
    expect(f.downloads()).toHaveLength(0);
  });

  it("imports one new original per automatic request and resumes every part without phantom continuation", async () => {
    const request = input("gmail"),
      c = context(),
      f = gmail(oneMessage([part(0), part(1), part(2)]));
    for (let index = 0; index < 3; index++) {
      const result = await scanConnectedGmail(request, c.value, key, f.fetcher);
      expect(result).toMatchObject({
        imported: 1,
        skipped: 0,
        failures: 0,
        ai_used: 1,
        has_more: index < 2,
      });
      if (index < 2)
        expect(await cursor(request, result)).toMatchObject({
          attachment: index + 1,
        });
      else expect(result.next_cursor).toBeNull();
      request.cursor = result.next_cursor;
    }
    expect(c.stored).toEqual(
      new Set(await Promise.all([0, 1, 2].map((n) => hash(pdf(n))))),
    );
    expect(
      new Set(
        c.imported.mock.calls.map(([mail]) => mail.attachments[0].attachmentId),
      ).size,
    ).toBe(3);
    expect(f.downloads()).toHaveLength(3);
  });

  it("passes duplicates to reach one new original, with a separate cap of fifty candidates", async () => {
    const request = input("gmail"),
      c = context();
    c.imported
      .mockResolvedValueOnce({ ...duplicate })
      .mockResolvedValueOnce({ ...duplicate });
    const f = gmail(oneMessage([part(0), part(1), part(2), part(3)]));
    const result = await scanConnectedGmail(request, c.value, key, f.fetcher);
    expect(result).toMatchObject({
      imported: 1,
      skipped: 2,
      failures: 0,
      ai_used: 1,
    });
    expect(await cursor(request, result)).toMatchObject({ attachment: 3 });
    expect(f.downloads()).toHaveLength(3);

    const capped = context(),
      many = gmail(oneMessage(Array.from({ length: 51 }, (_, n) => part(n))));
    capped.imported.mockResolvedValue({ ...duplicate });
    const limited = await scanConnectedGmail(
      request,
      capped.value,
      key,
      many.fetcher,
    );
    expect(limited).toMatchObject({
      imported: 0,
      skipped: 50,
      failures: 0,
      examined: 1,
    });
    expect(await cursor(request, limited)).toMatchObject({ attachment: 50 });
    expect(many.downloads()).toHaveLength(50);
  });

  it.each(["same message", "next message", "next page", "end"] as const)(
    "stops after uncertain import/AI and points at %s",
    async (location) => {
      const request = input("gmail"),
        c = context();
      c.imported.mockResolvedValue({
        imported: 1,
        skipped: 0,
        failures: 1,
        ai_used: 0,
      });
      const pages: GmailPage[] = oneMessage(
        location === "same message" ? [part(0), part(1)] : [part(0)],
      );
      if (location === "next message")
        pages[0].messages.push({ id: "m2", parts: [part(2)] });
      if (location === "next page") {
        pages[0].token = "1";
        pages.push({ messages: [{ id: "m2", parts: [part(2)] }] });
      }
      const f = gmail(pages),
        result = await scanConnectedGmail(request, c.value, key, f.fetcher);
      expect(result).toMatchObject({ imported: 1, failures: 1, ai_used: 0 });
      expect(c.imported).toHaveBeenCalledTimes(1);
      expect(f.downloads()).toHaveLength(1);
      expect(
        f.paths.filter((path) => path.includes("format=metadata")),
      ).toHaveLength(1);
      if (location === "end")
        expect(result).toMatchObject({ has_more: false, next_cursor: null });
      else
        expect(await cursor(request, result)).toEqual(
          location === "same message"
            ? { page: "", offset: 0, attachment: 1, message: "m1" }
            : location === "next message"
              ? { page: "", offset: 1, attachment: 0, message: "m2" }
              : { page: "1", offset: 0, attachment: 0, message: null },
        );
    },
  );

  it("stops on a failed import even when no new original was counted", async () => {
    const request = input("gmail"),
      c = context(),
      f = gmail(oneMessage([part(0), part(1)]));
    c.imported.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failures: 1,
      ai_used: 0,
    });
    const result = await scanConnectedGmail(request, c.value, key, f.fetcher);
    expect(result).toMatchObject({ imported: 0, failures: 1, ai_used: 0 });
    expect(await cursor(request, result)).toMatchObject({ attachment: 1 });
    expect(c.imported).toHaveBeenCalledTimes(1);
    expect(f.downloads()).toHaveLength(1);
  });

  it("retains the twenty-megabyte budget when automatic scans cross duplicates", async () => {
    const bytes = new Uint8Array(8 * 1024 * 1024).fill(32);
    bytes.set(pdf());
    const encoded = base64(bytes),
      request = input("gmail"),
      c = context();
    c.imported.mockResolvedValue({ ...duplicate });
    const f = gmail(
      oneMessage(
        [0, 1, 2].map((n) =>
          part(n, { body: { size: bytes.length, attachmentId: `a${n}` } }),
        ),
      ),
      {
        a0: { data: encoded },
        a1: { data: encoded },
        a2: { data: encoded },
      },
    );
    const result = await scanConnectedGmail(request, c.value, key, f.fetcher);
    expect(result).toMatchObject({ imported: 0, skipped: 2, failures: 0 });
    expect(await cursor(request, result)).toMatchObject({ attachment: 2 });
    expect(f.downloads()).toHaveLength(2);
  });

  it("preserves ten manual attachments and continues after a manual analysis failure", async () => {
    const request = input("gmail", false),
      c = context();
    c.imported.mockResolvedValueOnce({
      imported: 1,
      skipped: 0,
      failures: 1,
      ai_used: 0,
    });
    const f = gmail(oneMessage(Array.from({ length: 12 }, (_, n) => part(n))));
    const first = await scanConnectedGmail(request, c.value, key, f.fetcher);
    expect(first).toMatchObject({ imported: 10, failures: 1, ai_used: 9 });
    expect(await cursor(request, first)).toMatchObject({ attachment: 10 });
    request.cursor = first.next_cursor;
    expect(
      await scanConnectedGmail(request, c.value, key, f.fetcher),
    ).toMatchObject({ imported: 2, failures: 0, has_more: false });
    expect(f.downloads()).toHaveLength(12);
  });

  it("checks receipt metadata before requesting any full content in automatic mode", async () => {
    const f = gmail([
      {
        messages: [
          {
            id: "old",
            parts: [part(0)],
            metadata: { internalDate: "1", labelIds: ["INBOX"] },
          },
        ],
      },
    ]);
    const c = context(),
      result = await scanConnectedGmail(
        input("gmail"),
        c.value,
        key,
        f.fetcher,
      );
    expect(result).toMatchObject({ skipped: 1, failures: 0, imported: 0 });
    expect(
      f.paths.some(
        (path) =>
          path.includes("format=full") || path.includes("/attachments/"),
      ),
    ).toBe(false);
  });

  it("retains the fifty-message limit when no in-period documents are found", async () => {
    const pages: GmailPage[] = Array.from({ length: 6 }, (_, pageIndex) => ({
      messages: Array.from(
        { length: pageIndex === 5 ? 1 : 10 },
        (_, index) => ({
          id: `m${pageIndex * 10 + index}`,
          parts: [part(index)],
          metadata: { internalDate: "1", labelIds: ["INBOX"] },
        }),
      ),
      ...(pageIndex < 5 ? { token: String(pageIndex + 1) } : {}),
    }));
    const request = input("gmail"),
      c = context(),
      f = gmail(pages);
    const result = await scanConnectedGmail(request, c.value, key, f.fetcher);
    expect(result).toMatchObject({
      examined: 50,
      skipped: 50,
      imported: 0,
      failures: 0,
    });
    expect(await cursor(request, result)).toEqual({
      page: "5",
      offset: 0,
      attachment: 0,
      message: null,
    });
    expect(
      f.paths.filter((path) => path.includes("format=metadata")),
    ).toHaveLength(50);
    expect(f.paths.some((path) => path.includes("format=full"))).toBe(false);
  });
});

describe("IMAP: bounded foreground scans with manual behavior retained", () => {
  it("resumes each attachment within one UID and crosses the UID boundary without losing an original", async () => {
    const request = input("imap"),
      c = context(),
      client = imap([eml([pdf(0), pdf(1)]), eml([pdf(2)])]);
    for (let index = 0; index < 3; index++) {
      const result = await scanConnectedImap(request, c.value, key, client);
      expect(result).toMatchObject({
        imported: 1,
        failures: 0,
        ai_used: 1,
        has_more: index < 2,
      });
      if (index < 2)
        expect(await cursor(request, result)).toEqual({
          validity: "42",
          nextUid: index === 0 ? 1 : 2,
          attachment: index === 0 ? 1 : 0,
        });
      else expect(result.next_cursor).toBeNull();
      request.cursor = result.next_cursor;
    }
    expect(c.stored).toEqual(
      new Set(await Promise.all([0, 1, 2].map((n) => hash(pdf(n))))),
    );
    expect(c.imported).toHaveBeenCalledTimes(3);
  });

  it("passes duplicates until one new original and stops after fifty duplicate candidates", async () => {
    const request = input("imap"),
      c = context(),
      client = imap([eml([pdf(0), pdf(1), pdf(2), pdf(3)])]);
    c.imported
      .mockResolvedValueOnce({ ...duplicate })
      .mockResolvedValueOnce({ ...duplicate });
    const result = await scanConnectedImap(request, c.value, key, client);
    expect(result).toMatchObject({ imported: 1, skipped: 2, failures: 0 });
    expect(await cursor(request, result)).toMatchObject({
      nextUid: 1,
      attachment: 3,
    });

    const capped = context(),
      many = imap([eml(Array.from({ length: 51 }, (_, n) => pdf(n)))]);
    capped.imported.mockResolvedValue({ ...duplicate });
    const limited = await scanConnectedImap(request, capped.value, key, many);
    expect(limited).toMatchObject({ imported: 0, skipped: 50, failures: 0 });
    expect(await cursor(request, limited)).toMatchObject({
      nextUid: 1,
      attachment: 50,
    });
    expect(capped.imported).toHaveBeenCalledTimes(50);
  });

  it.each([0, 1])(
    "does not start another document after an uncertain import/AI result with imported=%s",
    async (imported) => {
      const request = input("imap"),
        c = context(),
        client = imap([eml([pdf(0), pdf(1)]), eml([pdf(2)])]);
      c.imported.mockResolvedValue({
        imported,
        skipped: 0,
        failures: 1,
        ai_used: 0,
      });
      const result = await scanConnectedImap(request, c.value, key, client);
      expect(result).toMatchObject({ imported, failures: 1, ai_used: 0 });
      expect(await cursor(request, result)).toMatchObject({
        nextUid: 1,
        attachment: 1,
      });
      expect(client.source).toHaveBeenCalledTimes(1);
      expect(c.imported).toHaveBeenCalledTimes(1);
    },
  );

  it.each([true, false])(
    "reports oversize in-scope metadata and preserves manual counters, automatic=%s",
    async (automatic) => {
      const request = input("imap", automatic),
        c = context(),
        client = imap([eml([pdf(0)])]);
      vi.mocked(client.metadata).mockResolvedValue({
        uid: 1,
        size: connectedMailLimits.fileBytes + 1,
        internalDate: new Date(now - 1000),
        flags: new Set(),
      });
      expect(
        await scanConnectedImap(request, c.value, key, client),
      ).toMatchObject({
        imported: 0,
        skipped: 1,
        failures: automatic ? 1 : 0,
        has_more: false,
        next_cursor: null,
      });
      expect(client.source).not.toHaveBeenCalled();
      expect(c.imported).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "handles an invalid part without changing manual continuation, automatic=%s",
    async (automatic) => {
      const request = input("imap", automatic),
        c = context();
      const client = imap([
        eml([new TextEncoder().encode("invalid content"), pdf(1)]),
      ]);
      const result = await scanConnectedImap(request, c.value, key, client);
      expect(result).toMatchObject({
        imported: automatic ? 0 : 1,
        skipped: 1,
        failures: automatic ? 1 : 0,
        ai_used: automatic ? 0 : 1,
      });
      if (automatic) {
        expect(await cursor(request, result)).toMatchObject({
          nextUid: 1,
          attachment: 1,
        });
        expect(c.imported).not.toHaveBeenCalled();
      } else
        expect(result).toMatchObject({ has_more: false, next_cursor: null });
    },
  );

  it("stops a failed MIME parse before fetching another UID", async () => {
    const request = input("imap"),
      c = context(),
      client = imap([eml([pdf(0)]), eml([pdf(1)])]);
    vi.spyOn(PostalMime, "parse").mockRejectedValueOnce(
      Error("Fictitious parser failure"),
    );
    const result = await scanConnectedImap(request, c.value, key, client);
    expect(result).toMatchObject({ failures: 1, imported: 0, ai_used: 0 });
    expect(await cursor(request, result)).toMatchObject({
      nextUid: 2,
      attachment: 0,
    });
    expect(client.source).toHaveBeenCalledTimes(1);
    expect(c.imported).not.toHaveBeenCalled();
  });

  it("stops a nested-message parser incident before fetching another UID", async () => {
    const raw = eml([pdf(0)]),
      parsed = await PostalMime.parse(raw, {
        attachmentEncoding: "arraybuffer",
      });
    vi.spyOn(PostalMime, "parse").mockResolvedValueOnce({
      ...parsed,
      attachments: [{ ...parsed.attachments[0], rfc822DepthExceeded: true }],
    });
    const request = input("imap"),
      c = context(),
      client = imap([raw, eml([pdf(1)])]);
    const result = await scanConnectedImap(request, c.value, key, client);
    expect(result).toMatchObject({ imported: 0, failures: 1, ai_used: 0 });
    expect(await cursor(request, result)).toMatchObject({
      nextUid: 2,
      attachment: 0,
    });
    expect(client.source).toHaveBeenCalledTimes(1);
    expect(c.imported).not.toHaveBeenCalled();
  });

  it("stops an invalid full source before fetching another UID", async () => {
    const request = input("imap"),
      c = context(),
      client = imap([eml([pdf(0)]), eml([pdf(1)])]);
    vi.mocked(client.source).mockResolvedValueOnce({
      uid: 1,
      size: 1000,
      internalDate: new Date(now - 1000),
      flags: new Set(),
      source: pdf(0),
    });
    const result = await scanConnectedImap(request, c.value, key, client);
    expect(result).toMatchObject({
      imported: 0,
      skipped: 1,
      failures: 1,
      ai_used: 0,
    });
    expect(await cursor(request, result)).toMatchObject({
      nextUid: 2,
      attachment: 0,
    });
    expect(client.source).toHaveBeenCalledTimes(1);
    expect(c.imported).not.toHaveBeenCalled();
  });

  it("retains the twenty-megabyte source budget when automatic scans cross duplicate UIDs", async () => {
    const raw = new Uint8Array(8 * 1024 * 1024).fill(32);
    raw.set(eml([pdf(0)]));
    const request = input("imap"),
      c = context(),
      client = imap([raw, raw, raw]);
    c.imported.mockResolvedValue({ ...duplicate });
    const result = await scanConnectedImap(request, c.value, key, client);
    expect(result).toMatchObject({
      imported: 0,
      skipped: 2,
      failures: 0,
      examined: 3,
    });
    expect(await cursor(request, result)).toMatchObject({
      nextUid: 3,
      attachment: 0,
    });
    expect(client.source).toHaveBeenCalledTimes(2);
  });

  it("returns an honest exhausted result after the last uncertain document", async () => {
    const c = context(),
      client = imap([eml([pdf(0)])]);
    c.imported.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failures: 1,
      ai_used: 0,
    });
    expect(
      await scanConnectedImap(input("imap"), c.value, key, client),
    ).toMatchObject({
      failures: 1,
      imported: 1,
      has_more: false,
      next_cursor: null,
    });
    expect(c.imported).toHaveBeenCalledTimes(1);
  });

  it("keeps the manual ten-part limit and continues after a manual analysis failure", async () => {
    const request = input("imap", false),
      c = context(),
      client = imap([eml(Array.from({ length: 12 }, (_, n) => pdf(n)))]);
    c.imported.mockResolvedValueOnce({
      imported: 1,
      skipped: 0,
      failures: 1,
      ai_used: 0,
    });
    const first = await scanConnectedImap(request, c.value, key, client);
    expect(first).toMatchObject({ imported: 10, failures: 1, ai_used: 9 });
    expect(await cursor(request, first)).toMatchObject({ attachment: 10 });
    request.cursor = first.next_cursor;
    expect(
      await scanConnectedImap(request, c.value, key, client),
    ).toMatchObject({ imported: 2, failures: 0, has_more: false });
  });
});
