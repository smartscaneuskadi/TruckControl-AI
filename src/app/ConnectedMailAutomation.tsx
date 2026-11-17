import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useCompany } from "./CompanyAccess";
import { useFleet } from "./FleetProvider";
import { useSubscription } from "./SubscriptionContext";
import { usePersonalMail } from "./PersonalMailProvider";
import { sessionExitEvent } from "./session-events";
import { getSupabaseClient } from "../integrations/supabase/client";
import { mfaStateEvent, nativeSessionHint } from "../integrations/supabase/mfa";
import {
  connectedInvoiceConsentVersion,
  connectedInvoiceReadiness,
  ConnectedInvoiceImportError,
} from "../integrations/personal-mail/invoice-import";
import {
  openMailAutomationPolicy,
  assertOpenSessionMailContext,
  readOpenSessionMailGrant,
} from "../../supabase/functions/_shared/mail-automation";
import {
  mailPeriodBounds,
  resolveMailPeriod,
} from "../../supabase/functions/_shared/mail-period";
import type { ReceivedPeriod } from "../../supabase/functions/_shared/mail-period";
import { MailAutomationScheduler } from "../domain/mail-automation";
import type { MailAutomationView } from "../domain/mail-automation";
import type { UnifiedMailboxAccount } from "../pages/MailWorkspace";
import { t } from "../i18n/runtime";

interface ContextValue {
  views: MailAutomationView[];
  busy: boolean;
  active: boolean;
  start(
    accountId: string,
    period: ReceivedPeriod,
    signal: AbortSignal,
  ): Promise<boolean>;
  stop(accountId: string): void;
  stopAll(): void;
  beginManual(): (() => void) | null;
}
const Context = createContext<ContextValue | null>(null);
export function useConnectedMailAutomation() {
  const value = useContext(Context);
  if (!value) throw Error("Connected mail automation provider missing");
  return value;
}

/** Persists across routes, not across logout, reload, connectivity or tab exit. */
export function ConnectedMailAutomationProvider({
  accounts,
  available,
  children,
}: {
  accounts: UnifiedMailboxAccount[];
  available: boolean;
  children: ReactNode;
}) {
  const access = useCompany(),
    { snapshot } = useFleet(),
    subscription = useSubscription(),
    personal = usePersonalMail();
  const actor = access.user?.id ?? "",
    organization = snapshot.organization.id;
  const allowed =
    access.mode === "company" &&
    available &&
    (!subscription.enabled ||
      (subscription.access?.active === true &&
        subscription.access.can_write === true &&
        subscription.features.gmail &&
        subscription.features.invoice_ai));
  const scope = `${personal.scopeKey}:${actor}:${organization}:${allowed}`;
  const [views, setViews] = useState<MailAutomationView[]>([]),
    [busy, setBusy] = useState(false),
    [starting, setStarting] = useState(false);
  const engine = useRef<MailAutomationScheduler | null>(null),
    startAttempt = useRef<AbortController | null>(null);
  const frame = useRef({ scope, actor, organization, allowed, accounts });
  frame.current = { scope, actor, organization, allowed, accounts };
  const identities = useRef(new WeakMap<object, number>()),
    sequence = useRef(0),
    previous = useRef(new Map<string, string>());
  const inventory = accounts
    .map((a) => {
      let id = identities.current.get(a.mailbox);
      if (id === undefined) {
        id = ++sequence.current;
        identities.current.set(a.mailbox, id);
      }
      return [a.id, `${a.email}:${a.provider}:${a.expiresAt}:${id}`] as const;
    })
    .sort(([a], [b]) => a.localeCompare(b));
  const fingerprint = JSON.stringify(inventory);
  const abortStart = () => {
    startAttempt.current?.abort();
    startAttempt.current = null;
    setStarting(false);
  };
  useLayoutEffect(() => {
    const scheduler = new MailAutomationScheduler({
      now: Date.now,
      monotonic: () => performance.now(),
      changed: (rows, running) => {
        setViews(rows);
        setBusy(running);
      },
      run: async (grant, period, cursor, signal) => {
        const current = frame.current;
        const account = current.accounts.find((a) => a.id === grant.account_id);
        if (
          !current.allowed ||
          !navigator.onLine ||
          document.visibilityState !== "visible" ||
          !account?.mailbox.importInvoices ||
          account.email !== grant.mailbox ||
          account.provider !== grant.provider ||
          current.actor !== grant.actor_id ||
          current.organization !== grant.organization_id ||
          (account.expiresAt !== null && account.expiresAt <= Date.now())
        )
          throw new ConnectedInvoiceImportError("expired");
        const readiness = await connectedInvoiceReadiness(
          current.organization,
          current.actor,
          signal,
        );
        const next = frame.current;
        if (
          signal.aborted ||
          next.scope !== current.scope ||
          !next.allowed ||
          !navigator.onLine ||
          document.visibilityState !== "visible" ||
          (account.expiresAt !== null && account.expiresAt <= Date.now()) ||
          next.accounts.find((a) => a.id === account.id)?.mailbox !==
            account.mailbox ||
          !readiness.ready ||
          !readiness.aiEnabled ||
          !readiness.automation
        )
          throw new ConnectedInvoiceImportError("denied");
        return account.mailbox.importInvoices(
          {
            organizationId: current.organization,
            actorId: current.actor,
            provider: account.provider,
            email: account.email,
            period,
            cursor,
            automation: grant,
            consent: {
              version: connectedInvoiceConsentVersion,
              accepted: true,
              mailbox: account.email,
              provider: account.provider,
              period,
            },
          },
          signal,
        );
      },
    });
    engine.current = scheduler;
    return () => {
      abortStart();
      scheduler.dispose();
      engine.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    abortStart();
    const next = new Map(inventory);
    for (const [id, signature] of previous.current)
      if (next.get(id) !== signature) engine.current?.stop(id, "context");
    previous.current = next;
    engine.current?.setScope(
      scope,
      accounts.map((a) => a.id),
    );
  }, [scope, fingerprint]);
  useEffect(() => {
    const stop = (reason: "context" | "offline" | "hidden") => {
      abortStart();
      engine.current?.stopAll(reason);
    };
    const offline = () => stop("offline"),
      exit = () => stop("context");
    const visibility = () => {
      if (document.visibilityState !== "visible") stop("hidden");
    };
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", exit);
    window.addEventListener(sessionExitEvent, exit);
    window.addEventListener(mfaStateEvent, exit);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", exit);
      window.removeEventListener(sessionExitEvent, exit);
      window.removeEventListener(mfaStateEvent, exit);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function start(
    accountId: string,
    period: ReceivedPeriod,
    signal: AbortSignal,
  ) {
    if (startAttempt.current) return false;
    const current = frame.current,
      scheduler = engine.current;
    const account = current.accounts.find((a) => a.id === accountId);
    if (
      !scheduler ||
      !current.allowed ||
      !account?.mailbox.importInvoices ||
      !navigator.onLine ||
      document.visibilityState !== "visible"
    )
      throw new ConnectedInvoiceImportError("denied");
    const attempt = new AbortController();
    const combined = AbortSignal.any([signal, attempt.signal]);
    startAttempt.current = attempt;
    setStarting(true);
    try {
      const readiness = await connectedInvoiceReadiness(
        current.organization,
        current.actor,
        combined,
      );
      if (!readiness.ready || !readiness.aiEnabled || !readiness.automation)
        throw new ConnectedInvoiceImportError("backend_outdated");
      const client = getSupabaseClient();
      if (!client) throw new ConnectedInvoiceImportError("expired");
      const result = await client.auth.getSession();
      combined.throwIfAborted();
      const session = result.data.session,
        binding = nativeSessionHint(session);
      const next = frame.current,
        now = Date.now(),
        window = resolveMailPeriod(period, now);
      if (
        result.error ||
        session?.user.id !== current.actor ||
        !binding?.sessionId ||
        !binding.aal ||
        next.scope !== current.scope ||
        !next.allowed ||
        engine.current !== scheduler ||
        !navigator.onLine ||
        document.visibilityState !== "visible" ||
        next.accounts.find((a) => a.id === accountId)?.mailbox !==
          account.mailbox ||
        window.to !== mailPeriodBounds(now).today
      )
        throw new ConnectedInvoiceImportError("expired");
      const expires = Math.min(
        account.expiresAt ?? 0,
        (session.expires_at ?? 0) * 1000,
        now + openMailAutomationPolicy.max_session_ms,
        window.end,
      );
      if (expires - now < 120000)
        throw new ConnectedInvoiceImportError("expired");
      const grant = readOpenSessionMailGrant(
        {
          version: openMailAutomationPolicy.consent_version,
          accepted: true,
          id: crypto.randomUUID(),
          actor_id: current.actor,
          organization_id: current.organization,
          account_id: accountId,
          session_id: binding.sessionId,
          aal: binding.aal,
          mailbox: account.email,
          provider: account.provider,
          period: { from: period.from, to: period.to },
          started_at: new Date(now).toISOString(),
          expires_at: new Date(expires).toISOString(),
        },
        period,
        now,
      );
      assertOpenSessionMailContext(
        grant,
        {
          actorId: current.actor,
          organizationId: current.organization,
          accountId,
          email: account.email,
          provider: account.provider,
          sessionId: binding.sessionId,
          aal: binding.aal,
        },
        period,
        now,
      );
      combined.throwIfAborted();
      return scheduler.start(grant);
    } finally {
      if (startAttempt.current === attempt) {
        startAttempt.current = null;
        setStarting(false);
      }
    }
  }
  const active = views.some((v) => v.state !== "stopped");
  return (
    <Context.Provider
      value={{
        views,
        busy: busy || starting,
        active,
        start,
        stop: (id) => {
          abortStart();
          engine.current?.stop(id);
        },
        stopAll: () => {
          abortStart();
          engine.current?.stopAll();
        },
        beginManual: () =>
          starting ? null : (engine.current?.beginManual() ?? null),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function ConnectedMailAutomationControls({
  floating = false,
}: {
  floating?: boolean;
}) {
  const automation = useConnectedMailAutomation();
  const count = automation.views.filter((v) => v.state !== "stopped").length;
  if (!count) return null;
  return (
    <div
      className={`card mail-automation-summary${floating ? " mail-automation-floating" : ""}`}
      role="status"
    >
      <p>
        {t("Revisión automática de facturas activa en {0} cuenta(s).", [count])}
      </p>
      <p className="muted">
        {t(
          "Solo mientras TruckControl está abierto y visible. Detener no borra los documentos ya guardados.",
        )}
      </p>
      <button
        type="button"
        className="button secondary"
        onClick={automation.stopAll}
      >
        {t("Detener todas las revisiones")}
      </button>
    </div>
  );
}
