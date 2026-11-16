import { detectDocumentType, fromBase64, hash } from "../_shared/invoice.ts";
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

type Data = Record<string, unknown>;
interface Part {
  filename: string;
  body: Data;
  index: number;
}
interface GmailCursor {
  page: string;
  offset: number;
  attachment: number;
  message: string | null;
}
const messageId = /^[A-Za-z0-9_-]{1,128}$/;
const attachmentId = /^[A-Za-z0-9_-]{1,2048}$/;
function object(value: unknown): value is Data {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function labels(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((v) => typeof v === "string") &&
    !value.some((v) => v === "SENT" || v === "DRAFT")
  );
}
function attachments(value: unknown) {
  const result: Part[] = [],
    queue: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let count = 0;
  while (queue.length) {
    const item = queue.shift()!;
    if (++count > 256 || item.depth > 12 || !object(item.value))
      throw new ConnectedMailError("mailbox_message_invalid", 502);
    const part = item.value;
    if (
      typeof part.filename === "string" &&
      part.filename &&
      part.filename.length <= 1024 &&
      object(part.body) &&
      Number.isInteger(part.body.size) &&
      Number(part.body.size) > 0 &&
      Number(part.body.size) <= connectedMailLimits.fileBytes &&
      ((typeof part.body.attachmentId === "string" &&
        attachmentId.test(part.body.attachmentId)) ||
        typeof part.body.data === "string")
    )
      result.push({ filename: part.filename, body: part.body, index: count });
    if (part.parts !== undefined) {
      if (!Array.isArray(part.parts) || part.parts.length > 128)
        throw new ConnectedMailError("mailbox_message_invalid", 502);
      queue.unshift(
        ...part.parts.map((value) => ({ value, depth: item.depth + 1 })),
      );
    }
  }
  return result;
}
async function boundedJson(response: Response, limit: number): Promise<Data> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel();
    throw new ConnectedMailError("mailbox_message_too_large", 413);
  }
  if (!response.body)
    throw new ConnectedMailError("connected_mailbox_unavailable", 502);
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ConnectedMailError("mailbox_message_too_large", 413);
      }
      chunks.push(item.value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      /* The transport may already be aborted. */
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!object(value)) throw Error();
    return value;
  } catch {
    throw new ConnectedMailError("mailbox_message_invalid", 502);
  }
}

/** Uses an already selected account's short-lived token only in request memory. */
export async function scanConnectedGmail(
  input: ConnectedMailRequest,
  context: ConnectedScanContext,
  cursorKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ConnectedScanResult> {
  if (!input.gmailAccessToken)
    throw new ConnectedMailError("invalid_mailbox_connection");
  const scope = await connectedScope(input, context.userId);
  const saved = await decodeConnectedCursor<GmailCursor>(
    cursorKey,
    scope,
    input.cursor,
    context.now(),
  );
  let page = saved?.page ?? "",
    offset = saved?.offset ?? 0,
    attachmentOffset = saved?.attachment ?? 0;
  if (
    saved &&
    (typeof page !== "string" ||
      page.length > 3000 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10 ||
      !Number.isInteger(attachmentOffset) ||
      attachmentOffset < 0 ||
      attachmentOffset > 256 ||
      (saved.message !== null &&
        (typeof saved.message !== "string" || !messageId.test(saved.message))))
  )
    throw new ConnectedMailError("invalid_mailbox_cursor", 409);
  const result = emptyConnectedCounters();
  const visitedPages = new Set<string>();
  let downloaded = 0,
    downloadedBytes = 0;
  const deadline = Date.now() + 110000;
  const next = async (state: GmailCursor) => {
    result.has_more = true;
    result.next_cursor = await encodeConnectedCursor(
      cursorKey,
      scope,
      state,
      context.now(),
    );
    return result;
  };
  async function google(url: string, limit = 65536) {
    await context.assertCurrent();
    context.signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { Authorization: "Bearer " + input.gmailAccessToken },
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(20000)]),
      });
    } catch {
      throw new ConnectedMailError("connected_mailbox_unavailable", 502);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ConnectedMailError(
        [401, 403].includes(response.status)
          ? "mailbox_authorization_required"
          : response.status === 400 && page
            ? "invalid_mailbox_cursor"
            : "connected_mailbox_unavailable",
        [401, 403, 400].includes(response.status) ? 409 : 502,
      );
    }
    const data = await boundedJson(response, limit);
    await context.assertCurrent();
    return data;
  }
  const profile = await google(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
  );
  if (
    typeof profile.emailAddress !== "string" ||
    profile.emailAddress.toLowerCase() !== input.email
  )
    throw new ConnectedMailError("mailbox_identity_mismatch", 409);
  do {
    if (visitedPages.has(page))
      throw new ConnectedMailError("mailbox_message_invalid", 502);
    visitedPages.add(page);
    const query = new URLSearchParams({
      q: input.period.query,
      maxResults: "10",
      ...(page ? { pageToken: page } : {}),
    });
    const response = await google(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + query,
    );
    const messages = response.messages === undefined ? [] : response.messages;
    const following =
      response.nextPageToken === undefined ? "" : response.nextPageToken;
    if (
      !Array.isArray(messages) ||
      messages.length > 10 ||
      messages.some(
        (v) => !object(v) || typeof v.id !== "string" || !messageId.test(v.id),
      ) ||
      new Set(messages.map((v) => (v as Data).id)).size !== messages.length ||
      typeof following !== "string" ||
      following.length > 3000 ||
      (following !== "" && following === page)
    )
      throw new ConnectedMailError("mailbox_message_invalid", 502);
    if (saved?.message && page === saved.page) {
      const current = messages.findIndex(
        (v) => object(v) && v.id === saved.message,
      );
      if (current < 0)
        throw new ConnectedMailError("invalid_mailbox_cursor", 409);
      offset = current;
    }
    for (let index = offset; index < messages.length; index++) {
      const id = (messages[index] as Data).id as string;
      if (
        result.examined >= connectedMailLimits.messages ||
        downloaded >= connectedMailLimits.attachments ||
        Date.now() > deadline
      )
        return next({
          page,
          offset: index,
          attachment: index === offset ? attachmentOffset : 0,
          message: id,
        });
      result.examined++;
      const url =
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
        encodeURIComponent(id);
      const metadata = await google(
        url + "?format=metadata&fields=internalDate,labelIds",
      );
      if (
        !receivedInPeriod(metadata.internalDate, input.period, context.now()) ||
        !labels(metadata.labelIds)
      ) {
        result.skipped++;
        attachmentOffset = 0;
        continue;
      }
      const message = await google(url + "?format=full", 15 * 1024 * 1024);
      if (
        !receivedInPeriod(message.internalDate, input.period, context.now()) ||
        !labels(message.labelIds)
      ) {
        result.skipped++;
        attachmentOffset = 0;
        continue;
      }
      const files = attachments(message.payload ?? {});
      for (
        let fileIndex = index === offset ? attachmentOffset : 0;
        fileIndex < files.length;
        fileIndex++
      ) {
        const part = files[fileIndex];
        if (
          downloaded >= connectedMailLimits.attachments ||
          Date.now() > deadline ||
          downloadedBytes + Number(part.body.size) >
            connectedMailLimits.batchBytes
        )
          return next({
            page,
            offset: index,
            attachment: fileIndex,
            message: id,
          });
        await context.assertCurrent();
        downloaded++;
        const raw = part.body.attachmentId
          ? await google(
              url +
                "/attachments/" +
                encodeURIComponent(String(part.body.attachmentId)),
              15 * 1024 * 1024,
            )
          : part.body;
        if (
          typeof raw.data !== "string" ||
          raw.data.length > Math.ceil(connectedMailLimits.fileBytes / 3) * 4 ||
          !/^[A-Za-z0-9_+\/-]*={0,2}$/.test(raw.data)
        ) {
          result.skipped++;
          continue;
        }
        let bytes: Uint8Array;
        try {
          bytes = fromBase64(raw.data);
        } catch {
          result.skipped++;
          continue;
        }
        if (downloadedBytes + bytes.length > connectedMailLimits.batchBytes)
          throw new ConnectedMailError("mailbox_message_too_large", 413);
        downloadedBytes += bytes.length;
        const type = detectDocumentType(bytes);
        if (
          !type ||
          !bytes.length ||
          bytes.length > connectedMailLimits.fileBytes ||
          bytes.length !== Number(part.body.size)
        ) {
          result.skipped++;
          continue;
        }
        await context.assertCurrent();
        const ext = "." + documentExtension(type);
        let name =
          cleanMailText(
            part.filename.replace(/\\/g, "/").split("/").pop() ?? "Factura",
            150,
          ) || "Factura";
        if (!name.toLowerCase().endsWith(ext)) name += ext;
        const storedMessage =
          "connected:v1:" +
          context.userId +
          ":" +
          (await hash(scope + ":" + id));
        addConnectedCounters(
          result,
          await context.importParsed({
            messageId: storedMessage,
            subject: "",
            skipped: 0,
            attachments: [
              {
                name,
                type,
                bytes,
                contentHash: await hash(bytes),
                attachmentId:
                  "part:" +
                  (await hash(String(part.body.attachmentId ?? part.index))),
              },
            ],
          }),
        );
      }
      attachmentOffset = 0;
    }
    page = following;
    offset = 0;
    attachmentOffset = 0;
    if (
      page &&
      (result.examined >= connectedMailLimits.messages ||
        downloaded >= connectedMailLimits.attachments ||
        Date.now() > deadline)
    )
      return next({ page, offset: 0, attachment: 0, message: null });
  } while (page);
  return result;
}
