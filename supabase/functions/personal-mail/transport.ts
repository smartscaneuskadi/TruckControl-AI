import { ImapFlow } from "npm:imapflow@2.11.0";
import nodemailer from "npm:nodemailer@10.4.0";
import PostalMime from "npm:postal-mime@4.2.0";
import { lookup } from "node:dns/promises";
import { connect as tlsConnect } from "node:tls";
import { Buffer } from "node:buffer";
import {
  ConnectionError,
  mailHost,
  publicMailIp,
  messageRef,
  parseMessageRef,
  validateDraft,
  plainMail,
} from "./contract.ts";
import type {
  MailConnection,
  MailDraft,
  MailMessage,
  MailSummary,
  MailFolder,
} from "./contract.ts";

async function address(host: string) {
  if (!mailHost(host)) throw new ConnectionError("invalid");
  const addresses = await lookup(host, { family: 4, all: true });
  if (!addresses.length || addresses.some((a) => !publicMailIp(a.address)))
    throw new ConnectionError("invalid");
  return addresses[0].address;
}
function imap(config: MailConnection, ip: string) {
  return new ImapFlow({
    host: ip,
    servername: config.imapHost,
    port: 993,
    secure: true,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: { user: config.username, pass: config.password },
    logger: false,
    logRaw: false,
    emitLogs: false,
    disableAutoIdle: true,
    disableCompression: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    maxLiteralSize: 6 * 1024 * 1024,
    maxResponseSize: 8 * 1024 * 1024,
    maxLineLength: 1024 * 1024,
  });
}
function smtp(config: MailConnection, ip: string) {
  return nodemailer.createTransport({
    host: ip,
    port: 465,
    secure: true,
    tls: {
      servername: config.smtpHost,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    auth: { user: config.username, pass: config.password },
    logger: false,
    debug: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
async function withImap<T>(
  config: MailConnection,
  fn: (client: ImapFlow) => Promise<T>,
) {
  const client = imap(config, await address(config.imapHost));
  client.on("error", () => {});
  try {
    await client.connect();
    return await fn(client);
  } finally {
    client.close();
  }
}
const special: Partial<Record<MailFolder, string>> = {
  sent: "\\Sent",
  drafts: "\\Drafts",
  all: "\\All",
  trash: "\\Trash",
};
async function folderPath(client: ImapFlow, folder: MailFolder) {
  if (folder === "inbox" || folder === "starred") return "INBOX";
  const list = await client.list();
  const found = list.find((item) => item.specialUse === special[folder]);
  if (found) return found.path;
  if (folder === "all") return "INBOX";
  const names =
    folder === "sent"
      ? ["sent", "sent items", "sent messages", "enviados"]
      : folder === "trash"
        ? ["trash", "deleted items", "papelera"]
        : ["drafts", "borradores"];
  const fallback = list.find((item) => names.includes(item.name.toLowerCase()));
  if (!fallback) throw new ConnectionError("unavailable");
  return fallback.path;
}
function summary(
  value: {
    uid: number;
    envelope?: {
      subject?: string;
      from?: { name?: string; address?: string }[];
      to?: { name?: string; address?: string }[];
      date?: Date | string;
    };
    flags?: Set<string>;
  },
  path: string,
  validity: string,
): MailSummary {
  const id = messageRef(path, validity, value.uid);
  const addresses = (items?: { name?: string; address?: string }[]) =>
    items
      ?.map((x) => x.address ?? x.name ?? "")
      .join(", ")
      .slice(0, 2000) ?? "";
  const date = value.envelope?.date;
  return {
    id,
    threadId: id,
    subject: (value.envelope?.subject ?? "Sin asunto").slice(0, 2000),
    from: addresses(value.envelope?.from),
    to: addresses(value.envelope?.to),
    date: date instanceof Date ? date.toISOString() : String(date ?? ""),
    snippet: "",
    labels: [
      ...(value.flags?.has("\\Seen") ? [] : ["UNREAD"]),
      ...(value.flags?.has("\\Flagged") ? ["STARRED"] : []),
    ],
  };
}
async function selectRef(client: ImapFlow, value: unknown) {
  const ref = parseMessageRef(value);
  const exists = (await client.list()).some((item) => item.path === ref.path);
  if (!exists) throw new ConnectionError("invalid");
  const box = await client.mailboxOpen(ref.path);
  if (String(box.uidValidity) !== ref.validity)
    throw new ConnectionError("invalid");
  return ref;
}
async function readMessage(
  client: ImapFlow,
  id: unknown,
): Promise<MailMessage> {
  const ref = await selectRef(client, id);
  const meta = await client.fetchOne(
    ref.uid,
    { uid: true, envelope: true, flags: true, size: true },
    { uid: true },
  );
  if (!meta) throw new ConnectionError("invalid");
  if ((meta.size ?? 0) > 5 * 1024 * 1024)
    throw new ConnectionError("too_large");
  const value = await client.fetchOne(
    ref.uid,
    { uid: true, envelope: true, flags: true, source: true },
    { uid: true },
  );
  if (!value || !value.source || value.source.length > 5 * 1024 * 1024)
    throw new ConnectionError("too_large");
  const parsed = await PostalMime.parse(value.source);
  const text = parsed.text || plainMail(parsed.html ?? "");
  if (new TextEncoder().encode(text).length > 512 * 1024)
    throw new ConnectionError("too_large");
  return {
    ...summary(value, ref.path, ref.validity),
    text,
    htmlConverted: !parsed.text && Boolean(parsed.html),
    messageId: parsed.messageId ?? "",
    attachments: parsed.attachments.map((a, i) => {
      const bytes =
        typeof a.content === "string"
          ? Buffer.from(a.content, "utf8")
          : Buffer.from(new Uint8Array(a.content));
      return {
        id: String(i),
        name: a.filename ?? "adjunto",
        type: a.mimeType,
        bytes: bytes.byteLength,
        inlineData: bytes.toString("base64"),
      };
    }),
  };
}
export async function mailOperation(
  config: MailConnection,
  action: string,
  data: Record<string, unknown>,
) {
  if (action === "verify") {
    await withImap(config, async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
    });
    const transport = smtp(config, await address(config.smtpHost));
    try {
      await transport.verify();
    } finally {
      transport.close();
    }
    return { email: config.email, reading: true, sending: true };
  }
  if (action === "send") {
    const draft = data.draft as MailDraft;
    if (
      !draft ||
      typeof draft.to !== "string" ||
      typeof draft.cc !== "string" ||
      typeof draft.subject !== "string" ||
      typeof draft.text !== "string" ||
      typeof data.request_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(data.request_id)
    )
      throw new ConnectionError("invalid");
    const recipients = validateDraft(draft);
    const transport = smtp(config, await address(config.smtpHost));
    // No SMTP send is repeated after an unknown outcome. Never auto-retry.
    try {
      const composer = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const composed = await composer.sendMail({
        from: config.email,
        to: recipients.to,
        cc: recipients.cc,
        subject: draft.subject,
        text: draft.text,
        messageId: `<${data.request_id}@truckcontrolai.com>`,
        ...(draft.inReplyTo
          ? { inReplyTo: draft.inReplyTo, references: draft.inReplyTo }
          : {}),
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      composer.close();
      const raw = Buffer.isBuffer(composed.message)
        ? composed.message
        : Buffer.from(String(composed.message));
      const result = await transport.sendMail({
        envelope: {
          from: config.email,
          to: [...recipients.to, ...recipients.cc],
        },
        raw,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      if (result.rejected?.length || !result.accepted?.length)
        throw new ConnectionError("send_uncertain");
      let sentCopy = false;
      try {
        await withImap(config, async (client) => {
          const path = await folderPath(client, "sent");
          await client.mailboxOpen(path);
          const existing = await client.search(
            {
              header: {
                "message-id": `<${data.request_id}@truckcontrolai.com>`,
              },
            },
            { uid: true },
          );
          if (!Array.isArray(existing))
            throw new ConnectionError("unavailable");
          if (!existing.length && !(await client.append(path, raw, ["\\Seen"])))
            throw new ConnectionError("unavailable");
        });
        sentCopy = true;
      } catch {
        /* SMTP acceptance is already confirmed: never send again for this failure. */
      }
      return { sent: true, sent_copy: sentCopy };
    } catch {
      throw new ConnectionError("send_uncertain");
    } finally {
      transport.close();
    }
  }
  return withImap(config, async (client) => {
    if (action === "list") {
      const folder = data.folder as MailFolder;
      if (
        !["inbox", "sent", "starred", "drafts", "all", "trash"].includes(
          folder,
        ) ||
        typeof data.query !== "string" ||
        data.query.length > 200 ||
        /[\x00-\x1f]/.test(data.query)
      )
        throw new ConnectionError("invalid");
      const path = await folderPath(client, folder);
      const box = await client.mailboxOpen(path, { readOnly: true });
      const before =
        data.cursor == null ? Number(box.uidNext) : Number(data.cursor);
      if (!Number.isSafeInteger(before) || before < 1 || before > 4294967296)
        throw new ConnectionError("invalid");
      const upper = before - 1;
      if (upper < 1 || box.exists === 0) return { messages: [], next: null };
      // A bounded UID window avoids allocating an entire mailbox of SEARCH results.
      const lower = Math.max(1, upper - 499);
      const found = await client.search(
        {
          uid: `${lower}:${upper}`,
          ...(folder === "starred" ? { flagged: true } : {}),
          ...(data.query ? { text: data.query } : {}),
        },
        { uid: true },
      );
      if (!Array.isArray(found)) throw new ConnectionError("unavailable");
      const uids = found
        .filter((id) => id >= lower && id <= upper)
        .sort((a, b) => b - a)
        .slice(0, 20);
      const fetched = uids.length
        ? await client.fetchAll(
            uids,
            { uid: true, envelope: true, flags: true },
            { uid: true },
          )
        : [];
      return {
        messages: fetched
          .sort((a, b) => b.uid - a.uid)
          .map((m) => summary(m, path, String(box.uidValidity))),
        next:
          uids.length === 20
            ? String(uids[uids.length - 1])
            : lower > 1
              ? String(lower)
              : null,
      };
    }
    if (action === "read") return readMessage(client, data.id);
    if (action === "change") {
      const ref = await selectRef(client, data.id);
      const flag =
        data.change === "read" || data.change === "unread"
          ? "\\Seen"
          : data.change === "star" || data.change === "unstar"
            ? "\\Flagged"
            : null;
      if (flag) {
        const ok = ["read", "star"].includes(String(data.change))
          ? await client.messageFlagsAdd(ref.uid, [flag], { uid: true })
          : await client.messageFlagsRemove(ref.uid, [flag], { uid: true });
        if (!ok) throw new ConnectionError("unavailable");
      } else {
        const destination =
          data.change === "trash"
            ? await folderPath(client, "trash")
            : data.change === "archive"
              ? (await client.list()).find((x) => x.specialUse === "\\Archive")
                  ?.path
              : data.change === "restore"
                ? "INBOX"
                : null;
        if (!destination || destination === ref.path)
          throw new ConnectionError("invalid");
        const ok = await client.messageMove(ref.uid, destination, {
          uid: true,
        });
        if (!ok) throw new ConnectionError("unavailable");
      }
      return { changed: true };
    }
    throw new ConnectionError("invalid");
  });
}
export async function checkProviderTransport(provider: string) {
  const presets: Record<string, { imap: string; smtp: string }> = {
    porkbun: { imap: "imap.porkbun.com", smtp: "smtp.porkbun.com" },
    yahoo: { imap: "imap.mail.yahoo.com", smtp: "smtp.mail.yahoo.com" },
  };
  const hosts = presets[provider];
  if (!hosts) throw new ConnectionError("invalid");
  async function probe(host: string, port: number) {
    const ip = await address(host);
    return new Promise<boolean>((resolve) => {
      const socket = tlsConnect({
        host: ip,
        servername: host,
        port,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      });
      const done = (ok: boolean) => {
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(6000, () => done(false));
      socket.once("error", () => done(false));
      socket.once("secureConnect", () => done(socket.authorized));
    });
  }
  const [reading, sending] = await Promise.all([
    probe(hosts.imap, 993).catch(() => false),
    probe(hosts.smtp, 465).catch(() => false),
  ]);
  return {
    provider,
    tls_verified: { imap: reading, smtp: sending },
    authenticated: false,
  };
}
