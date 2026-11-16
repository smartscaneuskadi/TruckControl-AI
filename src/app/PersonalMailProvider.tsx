import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useCompany } from "./CompanyAccess";
import { useFleet } from "./FleetProvider";
import { useSubscription } from "./SubscriptionContext";
import { sessionExitEvent } from "./session-events";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  mfaStateEvent,
  nativeSessionHint,
  readNativeMfa,
} from "../integrations/supabase/mfa";
import {
  createGmailMailbox,
  personalMailScope,
  mailAddress,
} from "../integrations/personal-mail/gmail";
import type { Mailbox } from "../integrations/personal-mail/gmail";
import {
  grantedMailToken,
  loadGoogleMailOAuth,
  publicGoogleClientId,
} from "../integrations/personal-mail/google-auth";
import type { GoogleMailOAuth } from "../integrations/personal-mail/google-auth";

export interface PersonalMailAccount {
  id: string;
  provider: "gmail";
  mailbox: Mailbox;
  email: string;
  expiresAt: number;
}
type MailSession = PersonalMailAccount & {
  scope: string;
  controller: AbortController;
};
interface PersonalMail {
  /** The selected account preserves the previous single-account API. */
  mailbox: Mailbox | null;
  email: string;
  expiresAt: number | null;
  accounts: PersonalMailAccount[];
  selectedId: string | null;
  select(id: string): void;
  disconnectAccount(id: string): void;
  expireAccount(id: string): void;
  ready: boolean;
  configured: boolean | null;
  connecting: boolean;
  error: string;
  configure(): Promise<void>;
  prepare(): Promise<void>;
  connect(expectedEmail?: string): void;
  disconnect(): void;
  expire(): void;
  scopeKey: string;
  cloud: boolean;
  online: boolean;
}
const Context = createContext<PersonalMail | null>(null);
export function PersonalMailProvider({ children }: { children: ReactNode }) {
  const company = useCompany(),
    { snapshot } = useFleet(),
    subscription = useSubscription();
  const cloud = company.mode === "company";
  const allowed =
    cloud &&
    Boolean(company.user) &&
    (!subscription.enabled || subscription.access?.active === true);
  const [identityEpoch, setIdentityEpoch] = useState(0);
  const permissionKey = `${subscription.access?.company_role ?? "none"}:${subscription.access?.can_write ?? false}:${subscription.access?.can_manage ?? false}:${subscription.access?.is_admin ?? false}`;
  // SID/AAL changes invalidate this RAM pool; hints never grant server access.
  const scopeKey = `${company.mode}:${company.user?.id ?? "demo"}:${snapshot.organization.id}:${allowed}:${permissionKey}:${identityEpoch}`;
  const [online, setOnline] = useState(navigator.onLine),
    [configured, setConfigured] = useState<boolean | null>(null),
    [clientId, setClientId] = useState("");
  const [ready, setReady] = useState(false),
    [connecting, setConnecting] = useState(false),
    [error, setError] = useState("");
  const [sessions, setSessions] = useState<MailSession[]>([]),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const sessionsRef = useRef<MailSession[]>([]),
    oauth = useRef<GoogleMailOAuth | null>(null),
    generation = useRef(0),
    activeScope = useRef(scopeKey),
    blockedScope = useRef<string | null>(null),
    lock = useRef(false),
    controller = useRef<AbortController | null>(null),
    nativeBinding = useRef<string | null>(null),
    currentActor = useRef(company.user?.id ?? null),
    currentOrganization = useRef(snapshot.organization.id),
    currentAllowed = useRef(allowed),
    recheckController = useRef<AbortController | null>(null);
  activeScope.current = scopeKey;
  currentActor.current = company.user?.id ?? null;
  currentOrganization.current = snapshot.organization.id;
  currentAllowed.current = allowed;
  function disposeAll() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    recheckController.current?.abort();
    recheckController.current = null;
    lock.current = false;
    for (const session of sessionsRef.current) session.controller.abort();
    sessionsRef.current = [];
  }
  function clear() {
    disposeAll();
    setSessions([]);
    setSelectedId(null);
    setConnecting(false);
  }
  function close(id: string, expired = false) {
    const session = sessionsRef.current.find((item) => item.id === id);
    session?.controller.abort();
    const remaining = sessionsRef.current.filter((item) => item.id !== id);
    sessionsRef.current = remaining;
    setSessions(remaining);
    setSelectedId((current) =>
      current === id ? (remaining[0]?.id ?? null) : current,
    );
    if (expired)
      setError(
        "La sesión de este correo ha caducado o se ha retirado su permiso. Puedes volver a conectar esta cuenta; las demás siguen abiertas.",
      );
    else setError("");
  }
  useLayoutEffect(() => {
    const stop = () => {
      blockedScope.current = activeScope.current;
      clear();
      setError("");
    };
    const hide = () => {
      clear();
      setError("");
    };
    const mfaChanged = (event: Event) => {
      const detail = (
        event as CustomEvent<{ userId?: string; reason?: string }>
      ).detail;
      if (detail?.userId && detail.userId !== currentActor.current) return;
      stop();
      const reason = typeof detail === "string" ? detail : detail?.reason;
      // A same-SID/AAL refresh still destroys all old capabilities. Re-enable
      // only an empty pool after fresh native identity/MFA and company access
      // checks; connecting a mailbox remains an explicit user action.
      if (reason !== "refresh") return;
      const client = getSupabaseClient(),
        actor = currentActor.current,
        organization = currentOrganization.current,
        key = activeScope.current,
        version = generation.current,
        controller = new AbortController();
      if (!client || !actor || !currentAllowed.current) return;
      recheckController.current = controller;
      const stillCurrent = () =>
        !controller.signal.aborted &&
        generation.current === version &&
        activeScope.current === key &&
        currentActor.current === actor &&
        currentOrganization.current === organization &&
        currentAllowed.current;
      queueMicrotask(() => {
        void (async () => {
          try {
            const state = await readNativeMfa(client, actor);
            if (!stillCurrent() || state.needsChallenge) return;
            const access = await client
              .rpc("tc_organization_access", { p_org: organization })
              .setHeader("Authorization", "Bearer " + state.token)
              .abortSignal(controller.signal);
            if (
              !stillCurrent() ||
              access.error ||
              !access.data ||
              typeof access.data !== "object" ||
              Array.isArray(access.data) ||
              access.data.active !== true
            )
              return;
            const after = await client.auth.getSession();
            if (
              !stillCurrent() ||
              after.error ||
              after.data.session?.user.id !== actor ||
              after.data.session.access_token !== state.token
            )
              return;
            const hint = nativeSessionHint(after.data.session);
            nativeBinding.current = `${actor}:${hint?.sessionId ?? "unbound"}:${hint?.aal ?? "unknown"}`;
            setIdentityEpoch((value) => value + 1);
          } catch {
            // Keep the old pool closed; a failed check never revives tokens.
          }
        })();
      });
    };
    window.addEventListener(sessionExitEvent, stop);
    window.addEventListener("pagehide", hide);
    window.addEventListener(mfaStateEvent, mfaChanged);
    return () => {
      disposeAll();
      window.removeEventListener(sessionExitEvent, stop);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener(mfaStateEvent, mfaChanged);
    };
  }, []);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    const update = (session: Session | null, force = false) => {
      if (!active) return;
      const hint = nativeSessionHint(session);
      const next = session
        ? `${session.user.id}:${hint?.sessionId ?? "unbound"}:${hint?.aal ?? "unknown"}`
        : "signed-out";
      if (
        (nativeBinding.current !== null && nativeBinding.current !== next) ||
        force
      ) {
        blockedScope.current = activeScope.current;
        clear();
        setIdentityEpoch((value) => value + 1);
      }
      nativeBinding.current = next;
    };
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // Appearance and other user-editable metadata also emit USER_UPDATED.
      // They never grant or revoke access. UID/SID/AAL, authoritative company
      // permissions and explicit MFA/session exit events own invalidation.
      update(session, event === "SIGNED_OUT");
    });
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          blockedScope.current = activeScope.current;
          clear();
        } else if (nativeBinding.current === null) update(data.session);
      })
      .catch(() => {
        if (active) {
          blockedScope.current = activeScope.current;
          clear();
        }
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useLayoutEffect(() => {
    clear();
    blockedScope.current = allowed ? null : scopeKey;
    setReady(false);
    oauth.current = null;
    setConfigured(null);
    setClientId("");
    setError("");
  }, [scopeKey, allowed]);
  useEffect(() => {
    if (!sessions.length) return;
    const nearest = Math.min(...sessions.map((session) => session.expiresAt));
    const timeout = setTimeout(
      () => {
        const expired = sessionsRef.current.filter(
          (session) => session.expiresAt <= Date.now(),
        );
        for (const session of expired) close(session.id, true);
      },
      Math.max(0, nearest - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [sessions]);
  const current = (key: string) =>
    allowed && activeScope.current === key && blockedScope.current !== key;
  async function configure() {
    if (!current(scopeKey) || !navigator.onLine) return;
    const key = scopeKey;
    setError("");
    try {
      const response = await fetch(
        "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-gmail/browser-config",
        {
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!current(key)) return;
      const valid =
        data.configured === true &&
        data.provider === "google" &&
        data.mode === "personal_browser" &&
        publicGoogleClientId(data.client_id);
      setClientId(valid ? data.client_id : "");
      setConfigured(valid);
    } catch {
      if (current(key)) {
        setConfigured(null);
        setError(
          "No se ha podido comprobar Google. Comprueba la conexión y vuelve a intentarlo.",
        );
      }
    }
  }
  async function prepare() {
    if (!current(scopeKey) || !online || !clientId || lock.current) return;
    lock.current = true;
    setConnecting(true);
    setError("");
    const version = generation.current,
      key = scopeKey;
    try {
      const library = await loadGoogleMailOAuth();
      if (generation.current !== version || !current(key)) return;
      oauth.current = library;
      setReady(true);
    } catch {
      if (generation.current === version && current(key))
        setError(
          "No se ha podido abrir Google. Comprueba tu conexión o las restricciones del navegador.",
        );
    } finally {
      if (generation.current === version) {
        lock.current = false;
        setConnecting(false);
      }
    }
  }
  function connect(expectedEmail = "") {
    if (
      !current(scopeKey) ||
      !navigator.onLine ||
      !ready ||
      !oauth.current ||
      !publicGoogleClientId(clientId) ||
      lock.current
    )
      return;
    const requestedAddress = expectedEmail.trim().toLowerCase();
    if (requestedAddress && !mailAddress(requestedAddress)) {
      setError("Comprueba la dirección de correo que quieres conectar.");
      return;
    }
    lock.current = true;
    setConnecting(true);
    setError("");
    const version = ++generation.current,
      key = scopeKey;
    controller.current?.abort();
    const connectionController = new AbortController();
    controller.current = connectionController;
    const signal = connectionController.signal;
    try {
      const tokenClient = oauth.current.initTokenClient({
        client_id: clientId,
        scope: personalMailScope,
        include_granted_scopes: false,
        error_callback: () => {
          if (version !== generation.current || !current(key)) return;
          connectionController.abort();
          lock.current = false;
          setConnecting(false);
          setError(
            "Google se ha cerrado o el navegador ha bloqueado la ventana. Pulsa Entrar con Google para volver a abrirla.",
          );
        },
        callback: (response) => {
          if (version !== generation.current || !current(key)) return;
          void (async () => {
            let connected = false;
            try {
              const grant = grantedMailToken(response),
                mailbox = createGmailMailbox(grant.token, fetch, signal);
              const email = await mailbox.profile(signal);
              if (
                requestedAddress &&
                email.toLowerCase() !== requestedAddress
              ) {
                if (version === generation.current && current(key))
                  setError(
                    "La cuenta autorizada no coincide con el correo escrito. Elige esa cuenta en Google o cambia la dirección antes de conectar.",
                  );
                return;
              }
              if (
                version !== generation.current ||
                !current(key) ||
                signal.aborted
              )
                return;
              // A new authorization always has a new opaque identity. Reconnecting
              // the same address cannot inherit a previous import consent/cursor.
              const previous = sessionsRef.current.filter(
                (item) => item.email.toLowerCase() === email.toLowerCase(),
              );
              for (const item of previous) item.controller.abort();
              const session: MailSession = {
                id: crypto.randomUUID(),
                provider: "gmail",
                scope: key,
                mailbox,
                email,
                expiresAt: grant.expiresAt,
                controller: connectionController,
              };
              const next = [
                ...sessionsRef.current.filter(
                  (item) => !previous.includes(item),
                ),
                session,
              ];
              sessionsRef.current = next;
              setSessions(next);
              setSelectedId(session.id);
              connected = true;
              if (controller.current === connectionController)
                controller.current = null;
            } catch {
              if (version === generation.current && current(key))
                setError(
                  "No se ha conectado el buzón. Debes autorizar Gmail; tu proveedor o la configuración de Google pueden limitar el acceso.",
                );
            } finally {
              if (!connected) connectionController.abort();
              if (version === generation.current) {
                lock.current = false;
                setConnecting(false);
              }
            }
          })();
        },
      });
      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch {
      connectionController.abort();
      lock.current = false;
      setConnecting(false);
      setError("No se ha podido abrir la autorización de Google.");
    }
  }
  const visible = sessions.filter(
    (session) =>
      session.scope === scopeKey &&
      current(scopeKey) &&
      !session.controller.signal.aborted &&
      session.expiresAt > Date.now(),
  );
  const selected =
    visible.find((session) => session.id === selectedId) ?? visible[0] ?? null;
  return (
    <Context.Provider
      value={{
        mailbox: selected?.mailbox ?? null,
        email: selected?.email ?? "",
        expiresAt: selected?.expiresAt ?? null,
        accounts: visible.map(
          ({ id, provider, mailbox, email, expiresAt }) => ({
            id,
            provider,
            mailbox,
            email,
            expiresAt,
          }),
        ),
        selectedId: selected?.id ?? null,
        select: (id) => {
          if (visible.some((session) => session.id === id)) setSelectedId(id);
        },
        disconnectAccount: (id) => close(id),
        expireAccount: (id) => close(id, true),
        ready,
        configured,
        connecting,
        error,
        configure,
        prepare,
        connect,
        disconnect: () => {
          if (selected) close(selected.id);
        },
        expire: () => {
          if (selected) close(selected.id, true);
        },
        scopeKey: current(scopeKey) ? scopeKey : `${scopeKey}:closed`,
        cloud,
        online,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePersonalMail() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing personal mail scope");
  return value;
}
