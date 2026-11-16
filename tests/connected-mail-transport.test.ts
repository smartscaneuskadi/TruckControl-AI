import { beforeEach, describe, expect, it, vi } from "vitest";
import { importConnectedImap } from "../supabase/functions/company-mail/connected-imap";
import { MailActionError } from "../supabase/functions/company-mail/handler";
import {
  connectedMailRequest,
  connectedScope,
  encodeConnectedCursor,
} from "../supabase/functions/company-mail/connected-contract";
import type { ConnectedScanContext } from "../supabase/functions/company-mail/connected-contract";
import { fictitiousEmail } from "../supabase/functions/_shared/mail";
import { presetReceivedPeriod } from "../supabase/functions/_shared/mail-period";

const transport = vi.hoisted(() => ({ withImap: vi.fn() }));
vi.mock("../supabase/functions/personal-mail/transport.ts", () => transport);
const now = Date.parse("2026-11-16T12:00:00Z"),
  user = "ec000000-0000-4000-8000-000000000001",
  org = "ec000000-0000-4000-8000-000000000002",
  key = "fictitious-connected-mail-transport-signing-key-only";
function input() {
  const email = "fictitious@example.com",
    period = presetReceivedPeriod("30d", now);
  return connectedMailRequest(
    {
      action: "import_connected_mailbox",
      organization_id: org,
      provider: "imap",
      email,
      analyze: true,
      period,
      consent: {
        version: "2026-11-16",
        accepted: true,
        mailbox: email,
        provider: "imap",
        period,
      },
      connector_consent: { version: "2026-11-13", accepted: true },
      connection: {
        email,
        username: email,
        password: "fictitious-password-test-only",
        imapHost: "imap.example.com",
        smtpHost: "smtp.example.com",
      },
    },
    now,
  );
}
function fixture() {
  const raw = fictitiousEmail();
  const metadata = {
    uid: 1,
    size: raw.length,
    internalDate: new Date(now - 1000),
    flags: new Set<string>(),
  };
  const client = {
    mailboxOpen: vi.fn(async () => ({ uidValidity: 42n })),
    search: vi.fn(async (): Promise<number[] | false | undefined> => [1]),
    fetchOne: vi.fn(async (_uid: number, query: { source?: boolean }) =>
      query.source ? { ...metadata, source: raw } : metadata,
    ),
  };
  transport.withImap.mockImplementation(async (_config, run) => run(client));
  const context: ConnectedScanContext = {
    userId: user,
    now: () => now,
    signal: new AbortController().signal,
    assertCurrent: vi.fn(async () => {}),
    importParsed: vi.fn(async () => ({
      imported: 1,
      skipped: 0,
      failures: 0,
      ai_used: 1,
    })),
  };
  return { client, context };
}
beforeEach(() => {
  transport.withImap.mockReset();
});
describe("adaptador IMAP de importación", () => {
  it.each([false, undefined])(
    "un SEARCH sin respuesta válida no se presenta como una importación vacía (%s)",
    async (value) => {
      const f = fixture();
      f.client.search.mockResolvedValueOnce(value);
      await expect(
        importConnectedImap(input(), f.context, key),
      ).rejects.toMatchObject({ code: "mailbox_message_invalid", status: 502 });
      expect(f.client.fetchOne).not.toHaveBeenCalled();
      expect(f.context.importParsed).not.toHaveBeenCalled();
    },
  );
  it("selecciona INBOX read-only y pide source por el transporte PEEK existente, sin SMTP", async () => {
    const f = fixture();
    expect(await importConnectedImap(input(), f.context, key)).toMatchObject({
      imported: 1,
      ai_used: 1,
    });
    expect(transport.withImap).toHaveBeenCalledTimes(1);
    expect(transport.withImap.mock.calls[0][2]).toEqual({
      invoiceImport: true,
    });
    expect(f.client.mailboxOpen).toHaveBeenCalledWith("INBOX", {
      readOnly: true,
    });
    expect(f.client.fetchOne).toHaveBeenCalledWith(
      1,
      { uid: true, internalDate: true, flags: true, size: true },
      { uid: true },
    );
    expect(f.client.fetchOne).toHaveBeenCalledWith(
      1,
      { uid: true, source: true, internalDate: true, flags: true, size: true },
      { uid: true },
    );
  });
  it("un cursor de otro host o usuario se rechaza antes de abrir ninguna conexión", async () => {
    const f = fixture(),
      request = input(),
      old = input();
    old.connection!.imapHost = "other.example.com";
    request.cursor = await encodeConnectedCursor(
      key,
      await connectedScope(old, user),
      { validity: "42", nextUid: 1, attachment: 0 },
      now,
    );
    await expect(
      importConnectedImap(request, f.context, key),
    ).rejects.toMatchObject({ code: "invalid_mailbox_cursor", status: 409 });
    expect(transport.withImap).not.toHaveBeenCalled();
  });
  it("conserva la denegación de sesión de la validación en vuelo, sin convertirla en502", async () => {
    const f = fixture();
    let checks = 0;
    vi.mocked(f.context.assertCurrent).mockImplementation(async () => {
      if (++checks === 2)
        throw new MailActionError("authentication_required", 401);
    });
    await expect(
      importConnectedImap(input(), f.context, key),
    ).rejects.toMatchObject({ code: "authentication_required", status: 401 });
    expect(f.client.mailboxOpen).not.toHaveBeenCalled();
    expect(f.context.importParsed).not.toHaveBeenCalled();
  });
  it("un rechazo del proveedor se reduce a un código sin su texto ni datos de acceso", async () => {
    const f = fixture();
    transport.withImap.mockRejectedValue(
      Object.assign(new Error("fictitious-private-provider-error"), {
        authenticationFailed: true,
      }),
    );
    await expect(
      importConnectedImap(input(), f.context, key),
    ).rejects.toMatchObject({
      code: "mailbox_authorization_required",
      status: 409,
      message: "mailbox_authorization_required",
    });
    expect(f.context.importParsed).not.toHaveBeenCalled();
  });
});
