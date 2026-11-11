import { MailError, validateMailDraft } from "./gmail";
import type { Mailbox, MailDraft, MailMessage, MailSummary } from "./gmail";
import { connectionConfig } from "../../../supabase/functions/personal-mail/contract";
import type { MailConnection } from "../../../supabase/functions/personal-mail/contract";
import { getSupabaseClient } from "../supabase/client";
export type { MailConnection };
export type MailInvoker = (
  body: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>;
export async function invokePersonalMail(
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const client = getSupabaseClient();
  if (!client) throw new MailError("expired");
  const { data, error } = await client.functions.invoke("personal-mail", {
    body,
    signal,
    timeout: 45000,
  });
  if (error) {
    if ("context" in error && error.context instanceof Response) {
      const value = await error.context.json().catch(() => null);
      if (
        [
          "expired",
          "denied",
          "invalid",
          "too_large",
          "send_uncertain",
        ].includes(value?.error)
      )
        throw new MailError(value.error);
    }
    throw new MailError("unavailable");
  }
  return data;
}
/** Secrets live only in this closure and are erased on disconnect, identity exit or pagehide. */
export function createImapMailbox(
  input: MailConnection,
  organization: string,
  invoke: MailInvoker = invokePersonalMail,
): Mailbox & { dispose(): void } {
  let config: MailConnection | null = connectionConfig(input);
  const session = new AbortController();
  const attempted = new Set<string>();
  async function call(
    action: string,
    data: Record<string, unknown> = {},
    signal?: AbortSignal,
  ) {
    if (!config || session.signal.aborted) throw new MailError("expired");
    signal?.throwIfAborted();
    const result = await invoke(
      {
        action,
        organization_id: organization,
        connection: { ...config },
        data,
      },
      AbortSignal.any([session.signal, ...(signal ? [signal] : [])]),
    );
    if (!config || session.signal.aborted) throw new MailError("expired");
    return result as Record<string, unknown>;
  }
  return {
    async profile(signal) {
      const r = await call("verify", {}, signal);
      if (r.email !== config?.email || r.reading !== true || r.sending !== true)
        throw new MailError("unavailable");
      return String(r.email);
    },
    async list(folder, query, cursor, signal) {
      const r = await call("list", { folder, query, cursor }, signal);
      if (
        !Array.isArray(r.messages) ||
        (r.next !== null && typeof r.next !== "string")
      )
        throw new MailError("unavailable");
      return {
        messages: r.messages as MailSummary[],
        next: r.next as string | null,
      };
    },
    async read(id, signal) {
      const r = await call("read", { id }, signal);
      if (
        r.id !== id ||
        typeof r.text !== "string" ||
        !Array.isArray(r.attachments)
      )
        throw new MailError("unavailable");
      return r as unknown as MailMessage;
    },
    async change(id, change, signal) {
      const r = await call("change", { id, change }, signal);
      if (r.changed !== true) throw new MailError("unavailable");
    },
    async attachment() {
      throw new MailError("invalid");
    },
    async send(from: string, draft: MailDraft, requestId: string) {
      if (!config || from !== config.email) throw new MailError("invalid");
      validateMailDraft(draft);
      if (attempted.has(requestId)) throw new MailError("send_uncertain");
      attempted.add(requestId);
      try {
        const r = await call("send", { draft, request_id: requestId });
        if (r.sent !== true) throw new MailError("send_uncertain");
        if (r.sent_copy === false) throw new MailError("sent_copy_failed");
      } catch (error) {
        if (error instanceof MailError && error.code === "sent_copy_failed")
          throw error;
        throw new MailError("send_uncertain");
      }
    },
    dispose() {
      if (config) config.password = "";
      config = null;
      session.abort();
      attempted.clear();
    },
  };
}
