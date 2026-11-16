import { withImap } from "../personal-mail/transport.ts";
import { ConnectionError } from "../personal-mail/contract.ts";
import { ConnectedMailError } from "./connected-contract.ts";
import type {
  ConnectedMailRequest,
  ConnectedScanContext,
} from "./connected-contract.ts";
import { scanConnectedImap } from "./connected-imap-core.ts";
import { connectedScope, decodeConnectedCursor } from "./connected-contract.ts";
import { MailActionError } from "./handler.ts";

/** Reuses pinned-public-DNS, strict TLS and secret-free IMAP logging. Never opens SMTP. */
export async function importConnectedImap(
  input: ConnectedMailRequest,
  context: ConnectedScanContext,
  cursorKey: string,
) {
  if (!input.connection)
    throw new ConnectedMailError("invalid_mailbox_connection");
  await context.assertCurrent();
  // Reject a cursor from another account/actor/range before opening its transport.
  await decodeConnectedCursor(
    cursorKey,
    await connectedScope(input, context.userId),
    input.cursor,
    context.now(),
  );
  try {
    return await withImap(
      input.connection,
      (client) =>
        scanConnectedImap(input, context, cursorKey, {
          async openInbox() {
            const box = await client.mailboxOpen("INBOX", { readOnly: true });
            return { uidValidity: String(box.uidValidity) };
          },
          async search(from, before, nextUid) {
            const result = await client.search(
              {
                since: from,
                before,
                uid: `${nextUid}:*`,
                or: [
                  { text: "factura" },
                  { text: "invoice" },
                  { text: "facture" },
                ],
              },
              { uid: true },
            );
            if (!Array.isArray(result))
              throw new ConnectedMailError("mailbox_message_invalid", 502);
            return result;
          },
          metadata(uid) {
            return client.fetchOne(
              uid,
              { uid: true, internalDate: true, flags: true, size: true },
              { uid: true },
            );
          },
          source(uid) {
            // ImapFlow emits BODY.PEEK[] for source; INBOX is also open read-only.
            return client.fetchOne(
              uid,
              {
                uid: true,
                source: true,
                internalDate: true,
                flags: true,
                size: true,
              },
              { uid: true },
            );
          },
        }),
      { invoiceImport: true },
    );
  } catch (error) {
    if (error instanceof ConnectedMailError) throw error;
    if (error instanceof MailActionError) throw error;
    if (error instanceof ConnectionError)
      throw new ConnectedMailError(
        error.code === "invalid"
          ? "invalid_mailbox_connection"
          : "connected_mailbox_unavailable",
        error.code === "invalid" ? 400 : 502,
      );
    if (
      error &&
      typeof error === "object" &&
      ("authenticationFailed" in error ||
        ("code" in error && error.code === "EAUTH"))
    )
      throw new ConnectedMailError("mailbox_authorization_required", 409);
    throw new ConnectedMailError("connected_mailbox_unavailable", 502);
  }
}
