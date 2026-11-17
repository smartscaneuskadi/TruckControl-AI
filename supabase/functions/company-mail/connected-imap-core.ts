import PostalMime from "postal-mime";
import { detectDocumentType, hash } from "../_shared/invoice.ts";
import { cleanMailText, documentExtension } from "../_shared/mail.ts";
import { receivedInPeriod } from "../_shared/mail-period.ts";
import {
  addConnectedCounters,
  ConnectedMailError,
  connectedMailLimits,
  connectedScope,
  decodeConnectedCursor,
  emptyConnectedCounters,
  encodeConnectedCursor,
} from "./connected-contract.ts";
import type {
  ConnectedMailRequest,
  ConnectedScanContext,
  ConnectedScanResult,
} from "./connected-contract.ts";

export interface ImapInvoiceMetadata {
  uid: number;
  size?: number;
  internalDate?: Date | string;
  flags?: Set<string>;
  source?: Uint8Array;
}
export interface ImapInvoiceConnection {
  openInbox(): Promise<{ uidValidity: string }>;
  search(from: Date, before: Date, nextUid: number): Promise<number[]>;
  metadata(uid: number): Promise<ImapInvoiceMetadata | false>;
  /** The production adapter requests BODY.PEEK and opens INBOX read-only. */
  source(uid: number): Promise<ImapInvoiceMetadata | false>;
}
interface ImapCursor {
  validity: string;
  nextUid: number;
  attachment: number;
}
function stamp(value: Date | string | undefined) {
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === "string"
        ? Date.parse(value)
        : NaN;
  return Number.isSafeInteger(time) ? String(time) : "";
}
function receivedMeta(
  value: ImapInvoiceMetadata | false,
  uid: number,
  input: ConnectedMailRequest,
  now: number,
) {
  return (
    value &&
    value.uid === uid &&
    value.flags instanceof Set &&
    !value.flags.has("\\Draft") &&
    !value.flags.has("\\Sent") &&
    receivedInPeriod(stamp(value.internalDate), input.period, now)
  );
}
function permittedMeta(
  value: ImapInvoiceMetadata | false,
  uid: number,
  input: ConnectedMailRequest,
  now: number,
) {
  return (
    receivedMeta(value, uid, input, now) &&
    Number.isSafeInteger(value && value.size) &&
    Number(value && value.size) > 0 &&
    Number(value && value.size) <= connectedMailLimits.fileBytes
  );
}
/** Pure scan logic: transport is injected so tests never authenticate a real mailbox. */
export async function scanConnectedImap(
  input: ConnectedMailRequest,
  context: ConnectedScanContext,
  cursorKey: string,
  client: ImapInvoiceConnection,
): Promise<ConnectedScanResult> {
  const scope = await connectedScope(input, context.userId);
  const saved = await decodeConnectedCursor<ImapCursor>(
    cursorKey,
    scope,
    input.cursor,
    context.now(),
  );
  if (
    saved &&
    (typeof saved.validity !== "string" ||
      !/^\d{1,20}$/.test(saved.validity) ||
      !Number.isSafeInteger(saved.nextUid) ||
      saved.nextUid < 1 ||
      saved.nextUid > 4294967295 ||
      !Number.isInteger(saved.attachment) ||
      saved.attachment < 0 ||
      saved.attachment > 64)
  )
    throw new ConnectedMailError("invalid_mailbox_cursor", 409);
  await context.assertCurrent();
  const box = await client.openInbox();
  if (
    !/^\d{1,20}$/.test(box.uidValidity) ||
    (saved && saved.validity !== box.uidValidity)
  )
    throw new ConnectedMailError("invalid_mailbox_cursor", 409);
  await context.assertCurrent();
  // IMAP SINCE/BEFORE are calendar dates in the server's zone. Widen only the
  // metadata search; exact INTERNALDATE is checked before BODY.PEEK and again after it.
  const found = await client.search(
    new Date(input.period.start - 86400000),
    new Date(input.period.end + 86400000),
    saved?.nextUid ?? 1,
  );
  if (
    !Array.isArray(found) ||
    found.length > 100000 ||
    found.some(
      (uid) => !Number.isSafeInteger(uid) || uid < 1 || uid > 4294967295,
    )
  )
    throw new ConnectedMailError("mailbox_message_invalid", 502);
  const ids = [...new Set(found)]
    .filter((uid) => uid >= (saved?.nextUid ?? 1))
    .sort((a, b) => a - b);
  const result = emptyConnectedCounters();
  const automatic = Boolean(input.automation);
  const attachmentLimit = automatic
    ? connectedMailLimits.messages
    : connectedMailLimits.attachments;
  let downloaded = 0,
    downloadedBytes = 0;
  const atAttachmentLimit = () =>
    downloaded >= attachmentLimit || (automatic && result.imported >= 1);
  const deadline = Date.now() + 110000;
  const next = async (uid: number, attachment: number) => {
    result.has_more = true;
    result.next_cursor = await encodeConnectedCursor(
      cursorKey,
      scope,
      { validity: box.uidValidity, nextUid: uid, attachment },
      context.now(),
    );
    return result;
  };
  const afterMessage = (index: number) =>
    index + 1 < ids.length ? next(ids[index + 1], 0) : result;
  for (let index = 0; index < ids.length; index++) {
    const uid = ids[index];
    if (
      result.examined >= connectedMailLimits.messages ||
      atAttachmentLimit() ||
      Date.now() > deadline
    )
      return next(uid, saved?.nextUid === uid ? saved.attachment : 0);
    result.examined++;
    await context.assertCurrent();
    const meta = await client.metadata(uid);
    if (!permittedMeta(meta, uid, input, context.now())) {
      result.skipped++;
      if (automatic && receivedMeta(meta, uid, input, context.now())) {
        result.failures++;
        return afterMessage(index);
      }
      continue;
    }
    if (
      downloadedBytes + Number(meta && meta.size) >
      connectedMailLimits.batchBytes
    )
      return next(uid, saved?.nextUid === uid ? saved.attachment : 0);
    await context.assertCurrent();
    const full = await client.source(uid);
    await context.assertCurrent();
    if (
      !permittedMeta(full, uid, input, context.now()) ||
      !full ||
      !(full.source instanceof Uint8Array) ||
      full.source.length !== full.size ||
      full.source.length > connectedMailLimits.fileBytes
    ) {
      result.skipped++;
      if (
        automatic &&
        (!full || receivedMeta(full, uid, input, context.now()))
      ) {
        result.failures++;
        return afterMessage(index);
      }
      continue;
    }
    downloadedBytes += full.source.length;
    if (downloadedBytes > connectedMailLimits.batchBytes)
      throw new ConnectedMailError("mailbox_message_too_large", 413);
    let email;
    try {
      email = await PostalMime.parse(full.source, {
        attachmentEncoding: "arraybuffer",
        maxNestingDepth: 12,
        maxHeadersSize: 64 * 1024,
        maxPartCount: 64,
        maxRfc822NestingDepth: 2,
        maxForwardedAddresses: 64,
      });
    } catch {
      result.failures++;
      if (automatic) return afterMessage(index);
      continue;
    }
    if (email.attachments.some((p) => p.rfc822DepthExceeded)) {
      result.failures++;
      if (automatic) return afterMessage(index);
      continue;
    }
    const files = email.attachments.filter(
      (p) => p.disposition !== "inline" && p.filename,
    );
    const after = (partIndex: number) =>
      partIndex < files.length ? next(uid, partIndex) : afterMessage(index);
    for (
      let partIndex = saved?.nextUid === uid ? saved.attachment : 0;
      partIndex < files.length;
      partIndex++
    ) {
      if (atAttachmentLimit() || Date.now() > deadline)
        return next(uid, partIndex);
      const part = files[partIndex];
      downloaded++;
      if (typeof part.content === "string") {
        result.skipped++;
        if (automatic) {
          result.failures++;
          return after(partIndex + 1);
        }
        continue;
      }
      const bytes = new Uint8Array(part.content);
      const type = detectDocumentType(bytes);
      if (
        !type ||
        !bytes.length ||
        bytes.length > connectedMailLimits.fileBytes
      ) {
        result.skipped++;
        if (automatic) {
          result.failures++;
          return after(partIndex + 1);
        }
        continue;
      }
      await context.assertCurrent();
      const ext = "." + documentExtension(type);
      let name =
        cleanMailText(
          String(part.filename).replace(/\\/g, "/").split("/").pop() ??
            "Factura",
          150,
        ) || "Factura";
      if (!name.toLowerCase().endsWith(ext)) name += ext;
      addConnectedCounters(
        result,
        await context.importParsed({
          messageId:
            "connected:v1:" +
            context.userId +
            ":" +
            (await hash(scope + ":" + box.uidValidity + ":" + uid)),
          subject: "",
          skipped: 0,
          attachments: [
            {
              name,
              type,
              bytes,
              contentHash: await hash(bytes),
              attachmentId: "part:" + partIndex,
            },
          ],
        }),
      );
      if (automatic && result.failures > 0) return after(partIndex + 1);
    }
  }
  return result;
}
