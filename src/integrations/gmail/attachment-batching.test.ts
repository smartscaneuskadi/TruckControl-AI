import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGmailHandler } from "../../../supabase/functions/company-gmail/handler.ts";
import type {
  GmailConfig,
  GmailGateway,
} from "../../../supabase/functions/company-gmail/handler.ts";
import { createAiRuntimeResolver } from "../../../supabase/functions/_shared/ai-runtime.ts";
import {
  base64,
  hash,
  seal,
} from "../../../supabase/functions/_shared/invoice.ts";
import { resolveMailPeriod } from "../../../supabase/functions/_shared/mail-period.ts";

const org = "20000000-0000-4000-8000-000000000021";
const otherOrg = "20000000-0000-4000-8000-000000000022";
const user = "10000000-0000-4000-8000-000000000021";
const origin = "https://truckcontrol.example";
const now = Date.parse("2026-11-14T12:00:00Z");
const encryptionKey = base64(new Uint8Array(32).fill(9));
type Data = Record<string, unknown>;
interface Part {
  filename?: string;
  mimeType?: string;
  body?: { size: number; attachmentId: string };
  parts?: Part[];
}
interface Message {
  id: string;
  parts: Part[];
  receivedAt?: number;
}
const pdf = (id: string) => `%PDF-1.7\nSynthetic invoice ${id}`;
const attachment = (id: string, size = 40): Part => ({
  filename: `${id}.pdf`,
  mimeType: "application/pdf",
  body: { size, attachmentId: id },
});
const attachments = (count: number) =>
  Array.from({ length: count }, (_, i) => attachment(`attachment-${i + 1}`));
const request = (extra: Data = {}, organizationId = org) =>
  new Request(`${origin}/functions/v1/company-gmail`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer synthetic-session",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "sync_period",
      organization_id: organizationId,
      ...extra,
    }),
  });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Real network forbidden");
    }),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(
  messages: Message[],
  options: Partial<GmailConfig> = {},
) {
  const records: Data[] = [];
  const bodies = new Map<string, string>();
  const downloaded: string[] = [];
  const credentials = {
    organization_id: org,
    user_id: user,
    google_subject: "synthetic-subject",
    page_token: "",
    refresh_token_cipher: await seal(
      "synthetic-refresh",
      encryptionKey,
      `${org}:${user}:synthetic-subject`,
    ),
  };
  const upload = vi.fn(async () => {});
  const remove = vi.fn(async () => {});
  const onRecord = vi.fn(() => {});
  const server = vi.fn(async (action: string, data: Data): Promise<unknown> => {
    if (action === "lock_sync") return true;
    if (action === "credentials") return credentials;
    if (action === "exists")
      return records.some(
        (r) =>
          r.organization_id === data.organization_id &&
          (r.content_hash === data.content_hash ||
            (r.message_id === data.message_id &&
              r.attachment_id === data.attachment_id)),
      );
    if (action === "record_invoice") {
      records.push(data);
      onRecord();
      return {};
    }
    if (action === "finish_sync") {
      if (data.succeeded === true)
        credentials.page_token = String(data.page_token ?? "");
      return {};
    }
    throw Error(`Unexpected integration action: ${action}`);
  });
  const gateway: GmailGateway = {
    authenticate: async (token) =>
      token === "synthetic-session" ? { id: user } : null,
    owns: async (organizationId, userId) =>
      organizationId === org && userId === user,
    actionAllowed: async () => true,
    featureAllowed: async () => true,
    server: <T>(action: string, data: Data) =>
      server(action, data) as Promise<T>,
    upload,
    remove,
  };
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.href === "https://oauth2.googleapis.com/token")
      return Response.json({ access_token: "synthetic-google-access" });
    if (url.origin !== "https://gmail.googleapis.com")
      throw Error("Unexpected provider request");
    const file = url.pathname.match(
      /\/messages\/([^/]+)\/attachments\/([^/]+)$/,
    );
    if (file) {
      downloaded.push(file[2]);
      return Response.json({
        data: base64(
          new TextEncoder().encode(bodies.get(file[2]) ?? pdf(file[2])),
        ),
      });
    }
    if (url.pathname.endsWith("/messages")) {
      const after = url.searchParams.get("pageToken");
      const offset = after ? Number(after.replace("page-", "")) : 0;
      const page = messages.slice(offset, offset + 10);
      return Response.json({
        messages: page.map(({ id }) => ({ id })),
        ...(offset + 10 < messages.length
          ? { nextPageToken: `page-${offset + 10}` }
          : {}),
      });
    }
    const message = messages.find(({ id }) => url.pathname.endsWith(`/${id}`));
    if (!message) throw Error("Unexpected message request");
    return Response.json({
      internalDate: String(message.receivedAt ?? now - 1000),
      labelIds: ["INBOX"],
      ...(url.searchParams.get("format") === "full"
        ? { payload: { mimeType: "multipart/mixed", parts: message.parts } }
        : {}),
    });
  });
  const handler = createGmailHandler(
    gateway,
    {
      appOrigin: origin,
      callbackUrl: `${origin}/gmail-callback`,
      enforceCompanyRoles: true,
      enforceEntitlements: true,
      enforceReceivedPeriod: true,
      now: () => now,
      oauth: {
        clientId: "synthetic-client",
        clientSecret: "synthetic-client-secret",
        encryptionKey,
      },
      ...options,
    },
    fetcher,
  );
  async function sync(extra: Data = {}) {
    const response = await handler(request(extra));
    expect(response.status).toBe(200);
    return response.json();
  }
  return {
    handler,
    sync,
    server,
    records,
    bodies,
    downloaded,
    fetcher,
    upload,
    remove,
    onRecord,
    credentials,
  };
}

describe("Gmail attachment batching", () => {
  it("imports every PDF when one received message contains more than five", async () => {
    const f = await fixture([{ id: "invoice-message", parts: attachments(6) }]);
    expect(await f.sync()).toMatchObject({
      imported: 6,
      skipped: 0,
      failures: 0,
      has_more: false,
    });
    expect(f.downloaded).toEqual(
      Array.from({ length: 6 }, (_, i) => `attachment-${i + 1}`),
    );
    expect(f.records).toHaveLength(6);
    expect(f.upload).toHaveBeenCalledTimes(6);
    expect(f.records.every((r) => r.organization_id === org)).toBe(true);
  });

  it("resumes 23 PDFs in ten-file batches without losing or downloading saved files again", async () => {
    const f = await fixture([
      { id: "invoice-message", parts: attachments(23) },
    ]);
    const batches = [];
    const dedupCalls = [];
    for (let pass = 0; pass < 4; pass++) {
      const before = f.server.mock.calls.filter(([a]) => a === "exists").length;
      batches.push(await f.sync());
      dedupCalls.push(
        f.server.mock.calls.filter(([a]) => a === "exists").length - before,
      );
    }
    expect(batches.map((b) => b.imported)).toEqual([10, 10, 3, 0]);
    expect(batches.map((b) => b.has_more)).toEqual([true, true, false, false]);
    expect(batches.every((b) => b.failures === 0 && b.scanned === 1)).toBe(
      true,
    );
    expect(f.records).toHaveLength(23);
    expect(new Set(f.records.map((r) => r.content_hash)).size).toBe(23);
    expect(f.downloaded).toHaveLength(23);
    expect(new Set(f.downloaded).size).toBe(23);
    expect(f.upload).toHaveBeenCalledTimes(23);
    // Saved IDs need one lookup; a new file needs at most two, including its hash.
    expect(dedupCalls.every((count) => count <= 23 * 2)).toBe(true);
    expect(f.credentials.page_token).toBe("");
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("reaches nested PDFs after unsupported attachments and preserves size and signature checks", async () => {
    const unsupported = Array.from({ length: 6 }, (_, i) =>
      attachment(`unsupported-${i}`),
    );
    const f = await fixture([
      {
        id: "nested-message",
        parts: [
          ...unsupported,
          attachment("oversized", 10 * 1024 * 1024 + 1),
          {
            mimeType: "multipart/mixed",
            parts: [{ mimeType: "multipart/related", parts: attachments(6) }],
          },
        ],
      },
    ]);
    for (let i = 0; i < 6; i++)
      f.bodies.set(`unsupported-${i}`, "<html>Not a PDF</html>");
    expect(await f.sync()).toMatchObject({
      imported: 6,
      skipped: 6,
      has_more: false,
    });
    expect(f.downloaded).toHaveLength(12);
    expect(f.downloaded).not.toContain("oversized");
    expect(f.records.map((r) => r.attachment_id)).toEqual(
      Array.from({ length: 6 }, (_, i) => `attachment-${i + 1}`),
    );
    expect(
      f.records.every(
        (r) => (r.document as Data).content_type === "application/pdf",
      ),
    ).toBe(true);
  });

  it("keeps the received period and company binding while reaching later attachments", async () => {
    const f = await fixture([
      {
        id: "older-message",
        parts: attachments(6),
        receivedAt: Date.parse("2026-09-15T12:00:00Z"),
      },
    ]);
    expect((await f.handler(request({}, otherOrg))).status).toBe(403);
    expect(f.server).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
    f.records.push({
      organization_id: otherOrg,
      message_id: "older-message",
      attachment_id: "attachment-1",
      content_hash: await hash(new TextEncoder().encode(pdf("attachment-1"))),
    });
    expect(await f.sync()).toMatchObject({
      imported: 0,
      skipped: 1,
      has_more: false,
    });
    expect(f.downloaded).toHaveLength(0);
    const received_period = { from: "2026-09-01", to: "2026-09-30" };
    expect(await f.sync({ received_period })).toMatchObject({
      imported: 6,
      received_period,
    });
    expect(f.records.filter((r) => r.organization_id === org)).toHaveLength(6);
    expect(
      f.server.mock.calls.every(([, data]) => data.organization_id === org),
    ).toBe(true);
    const queries = f.fetcher.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/messages"))
      .map((url) => url.searchParams.get("q"));
    expect(queries).toEqual([
      resolveMailPeriod(undefined, now).query,
      resolveMailPeriod(received_period, now).query,
    ]);
  });

  it("stops at the deadline and resumes the partial message without another download of saved files", async () => {
    let clock = now;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const f = await fixture([{ id: "slow-message", parts: attachments(6) }]);
    f.onRecord.mockImplementationOnce(() => {
      clock += 120001;
    });
    expect(await f.sync()).toMatchObject({ imported: 1, has_more: true });
    expect(f.downloaded).toEqual(["attachment-1"]);
    expect(await f.sync()).toMatchObject({
      imported: 5,
      skipped: 1,
      has_more: false,
    });
    expect(new Set(f.downloaded).size).toBe(6);
    expect(f.downloaded).toHaveLength(6);
  });

  it("keeps the fifty-message cap and continues from its period-bound cursor", async () => {
    const f = await fixture(
      Array.from({ length: 51 }, (_, i) => ({ id: `message-${i}`, parts: [] })),
    );
    expect(await f.sync()).toMatchObject({
      imported: 0,
      scanned: 50,
      has_more: true,
    });
    expect(JSON.parse(f.credentials.page_token)).toMatchObject({
      period: resolveMailPeriod(undefined, now).key,
      cursor: "page-50",
    });
    expect(await f.sync()).toMatchObject({
      imported: 0,
      scanned: 1,
      has_more: false,
    });
    expect(f.credentials.page_token).toBe("");
    expect(f.downloaded).toHaveLength(0);
  });

  it("continues through all attachments when atomic AI quota is denied without bypassing it", async () => {
    const budget = vi.fn(async (_action: string, _data: Data) => null);
    const transport = vi.fn<typeof fetch>(async () => {
      throw Error("Denied AI quota must never reach its transport");
    });
    const ai = createAiRuntimeResolver(
      {
        config: async () => ({
          enabled: true,
          model: "gpt-6-luna",
          monthly_budget_cents: 1000,
          api_key: `sk-${"synthetic".repeat(5)}`,
        }),
        budget,
      },
      undefined,
      transport,
    );
    const f = await fixture(
      [{ id: "invoice-message", parts: attachments(6) }],
      {
        resolveAI: (organization_id, user_id) =>
          ai.resolve({ organization_id, user_id, kind: "invoice" }),
      },
    );
    expect(await f.sync()).toMatchObject({
      imported: 6,
      failures: 0,
      has_more: false,
    });
    expect(budget).toHaveBeenCalledTimes(6);
    for (const call of budget.mock.calls)
      expect(call).toEqual([
        "reserve",
        {
          organization_id: org,
          user_id: user,
          kind: "invoice",
          model: "gpt-6-luna",
        },
      ]);
    expect(
      f.records.every((r) => r.net_cents === null && r.total_cents === null),
    ).toBe(true);
    expect(transport).not.toHaveBeenCalled();
    expect(await f.sync()).toMatchObject({ imported: 0, skipped: 6 });
    expect(budget).toHaveBeenCalledTimes(6);
  });
});
