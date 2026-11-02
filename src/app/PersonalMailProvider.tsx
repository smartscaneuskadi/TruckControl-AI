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
import { sessionExitEvent } from "./session-events";
import {
  createGmailMailbox,
  personalMailScope,
} from "../integrations/personal-mail/gmail";
import type { Mailbox } from "../integrations/personal-mail/gmail";
import {
  grantedMailToken,
  loadGoogleMailOAuth,
  publicGoogleClientId,
} from "../integrations/personal-mail/google-auth";
import type { GoogleMailOAuth } from "../integrations/personal-mail/google-auth";

interface PersonalMail {
  mailbox: Mailbox | null;
  email: string;
  ready: boolean;
  configured: boolean | null;
  connecting: boolean;
  error: string;
  expiresAt: number | null;
  configure(): Promise<void>;
  prepare(): Promise<void>;
  connect(): void;
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
  const cloud = company.mode === "company",
    scopeKey = `${company.mode}:${company.user?.id ?? "demo"}:${snapshot.organization.id}`;
  const allowed =
    cloud && (!subscription.enabled || subscription.access?.active === true);
  const [online, setOnline] = useState(navigator.onLine),
    [configured, setConfigured] = useState<boolean | null>(null),
    [clientId, setClientId] = useState("");
  const [ready, setReady] = useState(false),
    [connecting, setConnecting] = useState(false),
    [error, setError] = useState("");
  const [session, setSession] = useState<{
    scope: string;
    mailbox: Mailbox;
    email: string;
    expiresAt: number;
  } | null>(null);
  const oauth = useRef<GoogleMailOAuth | null>(null),
    generation = useRef(0),
    activeScope = useRef(scopeKey),
    lock = useRef(false),
    controller = useRef<AbortController | null>(null);
  activeScope.current = scopeKey;
  const clear = () => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    lock.current = false;
    setSession(null);
    setConnecting(false);
  };
  useLayoutEffect(() => {
    const stop = () => {
      clear();
      setError("");
    };
    window.addEventListener(sessionExitEvent, stop);
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener(sessionExitEvent, stop);
      window.removeEventListener("pagehide", stop);
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
  useEffect(() => {
    clear();
    setReady(false);
    oauth.current = null;
    setConfigured(null);
    setClientId("");
    setError("");
    return () => {
      generation.current++;
      controller.current?.abort();
      lock.current = false;
    };
  }, [scopeKey, allowed]);
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      clear();
      setError("La sesión de correo ha caducado. Vuelve a entrar con Google.");
      return;
    }
    const timeout = setTimeout(() => {
      clear();
      setError("La sesión de correo ha caducado. Vuelve a entrar con Google.");
    }, remaining);
    return () => clearTimeout(timeout);
  }, [session]);
  async function configure() {
    if (!allowed || !navigator.onLine) return;
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
      // Public app metadata has no mailbox/user data; OAuth generation changes must
      // not discard this response during StrictMode's initial scope cleanup.
      if (activeScope.current !== key) return;
      const valid =
        data.configured === true &&
        data.provider === "google" &&
        data.mode === "personal_browser" &&
        publicGoogleClientId(data.client_id);
      setClientId(valid ? data.client_id : "");
      setConfigured(valid);
    } catch {
      if (activeScope.current === key) {
        setConfigured(null);
        setError(
          "No se ha podido comprobar Google. Comprueba la conexión y vuelve a intentarlo.",
        );
      }
    }
  }
  async function prepare() {
    if (!allowed || !online || !clientId || lock.current) return;
    lock.current = true;
    setConnecting(true);
    setError("");
    const version = generation.current,
      key = scopeKey;
    try {
      const library = await loadGoogleMailOAuth();
      if (generation.current !== version || activeScope.current !== key) return;
      oauth.current = library;
      setReady(true);
    } catch {
      if (generation.current === version)
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
  function connect() {
    if (
      !allowed ||
      !navigator.onLine ||
      !ready ||
      !oauth.current ||
      !publicGoogleClientId(clientId) ||
      lock.current
    )
      return;
    lock.current = true;
    setConnecting(true);
    setError("");
    const version = ++generation.current,
      key = scopeKey;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    try {
      const tokenClient = oauth.current.initTokenClient({
        client_id: clientId,
        scope: personalMailScope,
        include_granted_scopes: false,
        error_callback: () => {
          if (version !== generation.current || activeScope.current !== key)
            return;
          lock.current = false;
          setConnecting(false);
          setError(
            "Google se ha cerrado o el navegador ha bloqueado la ventana. Pulsa Entrar con Google para volver a abrirla.",
          );
        },
        callback: (response) => {
          if (version !== generation.current || activeScope.current !== key)
            return;
          void (async () => {
            try {
              const grant = grantedMailToken(response),
                mailbox = createGmailMailbox(grant.token, fetch, signal);
              const email = await mailbox.profile(signal);
              if (
                version !== generation.current ||
                activeScope.current !== key ||
                signal.aborted
              )
                return;
              setSession({
                scope: key,
                mailbox,
                email,
                expiresAt: grant.expiresAt,
              });
            } catch {
              if (version === generation.current && activeScope.current === key)
                setError(
                  "No se ha conectado el buzón. Debes autorizar Gmail; tu proveedor o la configuración de Google pueden limitar el acceso.",
                );
            } finally {
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
      lock.current = false;
      setConnecting(false);
      setError("No se ha podido abrir la autorización de Google.");
    }
  }
  const visible =
    session?.scope === scopeKey && allowed && session.expiresAt > Date.now()
      ? session
      : null;
  return (
    <Context.Provider
      value={{
        mailbox: visible?.mailbox ?? null,
        email: visible?.email ?? "",
        expiresAt: visible?.expiresAt ?? null,
        ready,
        configured,
        connecting,
        error,
        configure,
        prepare,
        connect,
        disconnect: () => {
          clear();
          setError("");
        },
        expire: () => {
          clear();
          setError(
            "La sesión de correo ha caducado o Google retiró el permiso. Vuelve a entrar.",
          );
        },
        scopeKey,
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
