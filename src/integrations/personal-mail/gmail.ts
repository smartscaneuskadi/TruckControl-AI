import {
  base64,
  base64url,
  fromBase64,
} from "../../../supabase/functions/_shared/invoice";

export const personalMailScope = "https://www.googleapis.com/auth/gmail.modify";
export const mailFolders = {
  inbox: "Recibidos",
  sent: "Enviados",
  starred: "Destacados",
  drafts: "Borradores",
  all: "Todos",
  trash: "Papelera",
} as const;
export type MailFolder = keyof typeof mailFolders;
export interface MailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
}
export interface MailMessage extends MailSummary {
  text: string;
  htmlConverted: boolean;
  messageId: string;
  attachments: {
    id: string;
    name: string;
    type: string;
    bytes: number;
    inlineData?: string;
  }[];
}
export interface MailDraft {
  to: string;
  cc: string;
  subject: string;
  text: string;
  threadId?: string;
  inReplyTo?: string;
}
export interface Mailbox {
  profile(signal?: AbortSignal): Promise<string>;
  list(
    folder: MailFolder,
    query: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<{ messages: MailSummary[]; next: string | null }>;
  read(id: string, signal?: AbortSignal): Promise<MailMessage>;
  change(
    id: string,
    action:
      "read" | "unread" | "star" | "unstar" | "archive" | "trash" | "restore",
    signal?: AbortSignal,
  ): Promise<void>;
  attachment(
    message: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array>;
  send(from: string, draft: MailDraft, requestId: string): Promise<void>;
}
export class MailError extends Error {
  constructor(
    readonly code:
      | "expired"
      | "denied"
      | "unavailable"
      | "invalid"
      | "too_large"
      | "send_uncertain"
      | "sent_copy_failed",
  ) {
    super(code);
  }
}
const ids = /^[A-Za-z0-9_-]{1,128}$/;
const attachmentIds = /^[A-Za-z0-9_-]{1,2048}$/;
const email =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;
export function mailAddress(value: string) {
  return (
    value.length <= 254 &&
    email.test(value) &&
    !/[\r\n\x00]/.test(value) &&
    !value
      .split("@")[1]
      .split(".")
      .some(
        (label) =>
          !label ||
          label.length > 63 ||
          label.startsWith("-") ||
          label.endsWith("-"),
      )
  );
}
function addresses(value: string, required: boolean) {
  const items = value
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    (required && !items.length) ||
    items.length > 20 ||
    items.some((v) => !mailAddress(v))
  )
    throw new MailError("invalid");
  return [...new Set(items)];
}
export function validateMailDraft(draft: MailDraft) {
  const to = addresses(draft.to, true),
    cc = addresses(draft.cc, false);
  if (
    to.length + cc.length > 20 ||
    !draft.subject.trim() ||
    draft.subject.length > 200 ||
    /[\r\n\x00]/.test(draft.subject) ||
    !draft.text.trim() ||
    new TextEncoder().encode(draft.text).length > 512 * 1024 ||
    (draft.threadId && !ids.test(draft.threadId)) ||
    (draft.inReplyTo && !/^<[^\s<>\x00-\x1f]{1,250}>$/.test(draft.inReplyTo))
  )
    throw new MailError("invalid");
  return { to, cc };
}
export function encodeMail(from: string, draft: MailDraft, requestId: string) {
  if (!mailAddress(from) || !/^[a-f0-9-]{36}$/.test(requestId))
    throw new MailError("invalid");
  const { to, cc } = validateMailDraft(draft),
    utf8 = new TextEncoder();
  // Short encoded words avoid splitting a UTF-8 character or exceeding MIME header limits.
  const words: string[] = [];
  let chunk = "";
  for (const char of draft.subject.trim()) {
    if (utf8.encode(chunk + char).length > 39) {
      words.push(`=?UTF-8?B?${base64(utf8.encode(chunk))}?=`);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(`=?UTF-8?B?${base64(utf8.encode(chunk))}?=`);
  const body =
    base64(utf8.encode(draft.text.replace(/\r?\n/g, "\r\n")))
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  return base64url(
    utf8.encode(
      [
        `From: ${from}`,
        `To: ${to.join(", ")}`,
        ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
        `Subject: ${words.join("\r\n ")}`,
        `Message-ID: <${requestId}@truckcontrolai.com>`,
        ...(draft.inReplyTo
          ? [
              `In-Reply-To: ${draft.inReplyTo}`,
              `References: ${draft.inReplyTo}`,
            ]
          : []),
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        body,
      ].join("\r\n"),
    ),
  );
}
type Part = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
};
type Message = {
  id?: unknown;
  threadId?: unknown;
  labelIds?: unknown;
  snippet?: unknown;
  payload?: Part;
};
function header(part: Part | undefined, name: string) {
  return (
    part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  )
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 2000);
}
function decodeText(value: string, part?: Part) {
  if (value.length > 750000) throw new MailError("too_large");
  const charset =
    header(part, "content-type").match(
      /charset\s*=\s*"?([a-zA-Z0-9_-]+)/i,
    )?.[1] ?? "utf-8";
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder();
  }
  return decoder.decode(fromBase64(value));
}
export function htmlMailAsText(value: string) {
  return value
    .replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, key: string) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[
          key
        ] ?? "",
    )
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n: string) => {
      const value = Number.parseInt(
        n[0].toLowerCase() === "x" ? n.slice(1) : n,
        n[0].toLowerCase() === "x" ? 16 : 10,
      );
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
    })
    .trim();
}
function summary(value: Message): MailSummary {
  if (
    typeof value.id !== "string" ||
    !ids.test(value.id) ||
    typeof value.threadId !== "string" ||
    !ids.test(value.threadId) ||
    (value.labelIds !== undefined &&
      (!Array.isArray(value.labelIds) ||
        value.labelIds.some((x) => typeof x !== "string")))
  )
    throw new MailError("unavailable");
  return {
    id: value.id,
    threadId: value.threadId,
    from: header(value.payload, "from"),
    to: header(value.payload, "to"),
    subject: header(value.payload, "subject") || "(Sin asunto)",
    date: header(value.payload, "date"),
    snippet:
      typeof value.snippet === "string" ? value.snippet.slice(0, 400) : "",
    labels: (value.labelIds ?? []) as string[],
  };
}
export function readMail(value: Message): MailMessage {
  const plain: string[] = [],
    html: string[] = [],
    attachments: MailMessage["attachments"] = [];
  let seen = 0;
  function walk(part: Part, depth: number) {
    if (depth > 12 || ++seen > 200) throw new MailError("too_large");
    if (part.filename) {
      if (part.body?.attachmentId && attachmentIds.test(part.body.attachmentId))
        attachments.push({
          id: part.body.attachmentId,
          name:
            part.filename.replace(/[\x00-\x1f\\/]/g, "_").slice(0, 180) ||
            "Adjunto",
          type: part.mimeType ?? "application/octet-stream",
          bytes: part.body.size ?? 0,
        });
      else if (part.body?.data) {
        if (part.body.data.length > 14 * 1024 * 1024)
          throw new MailError("too_large");
        attachments.push({
          id: `inline_${seen}`,
          name:
            part.filename.replace(/[\x00-\x1f\\/]/g, "_").slice(0, 180) ||
            "Adjunto",
          type: part.mimeType ?? "application/octet-stream",
          bytes: part.body.size ?? 0,
          inlineData: part.body.data,
        });
      }
      return;
    }
    if (part.body?.data) {
      if (part.mimeType === "text/plain")
        plain.push(decodeText(part.body.data, part));
      else if (part.mimeType === "text/html")
        html.push(decodeText(part.body.data, part));
    }
    for (const child of part.parts ?? []) walk(child, depth + 1);
  }
  walk(value.payload ?? {}, 0);
  const text = plain.length
    ? plain.join("\n\n")
    : htmlMailAsText(html.join("\n\n"));
  if (new TextEncoder().encode(text).length > 512 * 1024)
    throw new MailError("too_large");
  return {
    ...summary(value),
    text,
    htmlConverted: !plain.length && Boolean(html.length),
    messageId: header(value.payload, "message-id"),
    attachments,
  };
}
async function boundedJson(response: Response) {
  const length = Number(response.headers.get("content-length"));
  if (length > 15 * 1024 * 1024) {
    await response.body?.cancel().catch(() => {});
    throw new MailError("too_large");
  }
  if (!response.body) throw new MailError("unavailable");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > 15 * 1024 * 1024) throw new MailError("too_large");
      chunks.push(item.value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(bytes);
  let pos = 0;
  for (const chunk of chunks) {
    all.set(chunk, pos);
    pos += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
export function createGmailMailbox(
  token: string,
  fetcher: typeof fetch = fetch,
  sessionSignal?: AbortSignal,
): Mailbox {
  if (!token || token.length > 4096 || /\s/.test(token))
    throw new MailError("invalid");
  async function api(
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal,
  ) {
    sessionSignal?.throwIfAborted();
    signal?.throwIfAborted();
    const response = await fetcher(
      `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.any([
          ...(sessionSignal ? [sessionSignal] : []),
          ...(signal ? [signal] : []),
          AbortSignal.timeout(20000),
        ]),
      },
    );
    if (response.status === 401) throw new MailError("expired");
    if (response.status === 403) throw new MailError("denied");
    if (!response.ok) throw new MailError("unavailable");
    return boundedJson(response);
  }
  const messagePath = (id: string) => {
    if (!ids.test(id)) throw new MailError("invalid");
    return `messages/${id}`;
  };
  return {
    async profile(signal) {
      const data = await api("profile", {}, signal);
      if (!mailAddress(data.emailAddress ?? ""))
        throw new MailError("unavailable");
      return data.emailAddress as string;
    },
    async list(folder, query, cursor, signal) {
      if (
        !Object.hasOwn(mailFolders, folder) ||
        query.length > 300 ||
        /[\x00-\x1f]/.test(query) ||
        (cursor && (cursor.length > 2048 || /[\x00-\x1f]/.test(cursor)))
      )
        throw new MailError("invalid");
      const labels = {
        inbox: "INBOX",
        sent: "SENT",
        starred: "STARRED",
        drafts: "DRAFT",
        all: "",
        trash: "TRASH",
      };
      const params = new URLSearchParams({
        maxResults: "20",
        ...(labels[folder] ? { labelIds: labels[folder] } : {}),
        ...(query.trim() ? { q: query.trim() } : {}),
        ...(cursor ? { pageToken: cursor } : {}),
      });
      if (folder === "trash") params.set("includeSpamTrash", "true");
      const page = await api(`messages?${params}`, {}, signal);
      if (page.messages !== undefined && !Array.isArray(page.messages))
        throw new MailError("unavailable");
      const rows = page.messages ?? [];
      if (
        rows.length > 20 ||
        rows.some(
          (row: { id?: unknown }) =>
            typeof row.id !== "string" || !ids.test(row.id),
        )
      )
        throw new MailError("unavailable");
      const results: MailSummary[] = [];
      for (let i = 0; i < rows.length; i += 4) {
        const batch = await Promise.all(
          rows
            .slice(i, i + 4)
            .map(async (row: { id: string }) =>
              summary(
                await api(
                  `${messagePath(row.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
                  {},
                  signal,
                ),
              ),
            ),
        );
        results.push(...batch);
      }
      if (
        page.nextPageToken !== undefined &&
        (typeof page.nextPageToken !== "string" ||
          page.nextPageToken.length > 2048)
      )
        throw new MailError("unavailable");
      return { messages: results, next: page.nextPageToken ?? null };
    },
    async read(id, signal) {
      return readMail(await api(`${messagePath(id)}?format=full`, {}, signal));
    },
    async change(id, action, signal) {
      const changes = {
        read: { removeLabelIds: ["UNREAD"] },
        unread: { addLabelIds: ["UNREAD"] },
        star: { addLabelIds: ["STARRED"] },
        unstar: { removeLabelIds: ["STARRED"] },
        archive: { removeLabelIds: ["INBOX"] },
      };
      if (action === "trash" || action === "restore") {
        await api(
          `${messagePath(id)}/${action === "trash" ? "trash" : "untrash"}`,
          { method: "POST", body: "{}" },
          signal,
        );
        return;
      }
      if (!Object.hasOwn(changes, action)) throw new MailError("invalid");
      await api(
        `${messagePath(id)}/modify`,
        { method: "POST", body: JSON.stringify(changes[action]) },
        signal,
      );
    },
    async attachment(message, id, signal) {
      if (!attachmentIds.test(id)) throw new MailError("invalid");
      const data = await api(
        `${messagePath(message)}/attachments/${id}`,
        {},
        signal,
      );
      if (typeof data.data !== "string" || data.data.length > 14 * 1024 * 1024)
        throw new MailError("too_large");
      const bytes = fromBase64(data.data);
      if (bytes.length > 10 * 1024 * 1024) throw new MailError("too_large");
      return bytes;
    },
    async send(from, draft, requestId) {
      const raw = encodeMail(from, draft, requestId);
      try {
        const result = await api("messages/send", {
          method: "POST",
          body: JSON.stringify({
            raw,
            ...(draft.threadId ? { threadId: draft.threadId } : {}),
          }),
        });
        if (typeof result.id !== "string" || !ids.test(result.id))
          throw new MailError("send_uncertain");
      } catch (e) {
        if (e instanceof MailError && ["expired", "denied"].includes(e.code))
          throw e;
        throw new MailError("send_uncertain");
      }
    },
  };
}
