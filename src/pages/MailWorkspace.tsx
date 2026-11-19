import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, X, ShieldCheck, Mail } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useFleet } from "../app/FleetProvider";
import { usePersonalMail } from "../app/PersonalMailProvider";
import { GoogleMailOriginNotice } from "../components/GoogleMailOriginNotice";
import { sessionExitEvent } from "../app/session-events";
import { ConnectedMailView } from "./PersonalMail";
import { createImapMailbox } from "../integrations/personal-mail/imap";
import { createDemoMailbox } from "../integrations/personal-mail/demo";
import { MailError } from "../integrations/personal-mail/gmail";
import type { Mailbox } from "../integrations/personal-mail/gmail";
import type { MailConnection } from "../integrations/personal-mail/imap";
import { mailConnectorPrivacy } from "../domain/mail-privacy";
import { MailConnectorDisclosure } from "../components/MailConnectorDisclosure";
import { t } from "../i18n/runtime";
import {
  ConnectedMailAutomationProvider,
  ConnectedMailAutomationControls,
} from "../app/ConnectedMailAutomation";

export interface UnifiedMailboxAccount {
  id: string;
  email: string;
  provider: "gmail" | "imap";
  mailbox: Mailbox;
  expiresAt: number | null;
  disconnect(): void;
  expire(): void;
}
type View = {
  id: string;
  scope: string;
  email: string;
  mailbox: Mailbox;
  expiresAt: number;
  dispose: () => void;
  timer: ReturnType<typeof setTimeout>;
};
const empty: MailConnection = {
  email: "",
  username: "",
  password: "",
  imapHost: "",
  smtpHost: "",
};
const presets = {
  yahoo: { imapHost: "imap.mail.yahoo.com", smtpHost: "smtp.mail.yahoo.com" },
  porkbun: { imapHost: "imap.porkbun.com", smtpHost: "smtp.porkbun.com" },
  gmail: { imapHost: "imap.gmail.com", smtpHost: "smtp.gmail.com" },
  other: { imapHost: "", smtpHost: "" },
};
type Provider = "google" | keyof typeof presets;
export function MailWorkspace({
  active,
  available,
  renderInvoiceAction,
}: {
  active: boolean;
  available: boolean;
  renderInvoiceAction?(account: UnifiedMailboxAccount): ReactNode;
}) {
  const company = useCompany(),
    { snapshot } = useFleet(),
    personal = usePersonalMail();
  const cloud = company.mode === "company";
  const [views, setViews] = useState<View[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [adding, setAdding] = useState(true);
  const [provider, setProvider] = useState<Provider>("google"),
    [form, setForm] = useState<MailConnection>({ ...empty });
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [serviceNotice, setServiceNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const refs = useRef<View[]>([]),
    generation = useRef(0),
    attempt = useRef<AbortController | null>(null),
    currentScope = useRef(personal.scopeKey),
    observedGmailIds = useRef<string[]>([]),
    serviceSequence = useRef(0);
  refs.current = views;
  currentScope.current = personal.scopeKey;
  function clear() {
    generation.current++;
    serviceSequence.current++;
    attempt.current?.abort();
    attempt.current = null;
    for (const view of refs.current) {
      clearTimeout(view.timer);
      view.dispose();
    }
    refs.current = [];
    setViews([]);
    setSelected(null);
    setAdding(true);
    setProvider("google");
    setForm({ ...empty });
    setConsent(false);
    setBusy(false);
    setChecking(false);
    setError("");
    setServiceNotice("");
  }
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("pagehide", clear);
    window.addEventListener(sessionExitEvent, clear);
    return () => {
      generation.current++;
      attempt.current?.abort();
      for (const view of refs.current) {
        clearTimeout(view.timer);
        view.dispose();
      }
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener(sessionExitEvent, clear);
    };
  }, []);
  useLayoutEffect(() => {
    clear();
  }, [personal.scopeKey, available]);
  useEffect(() => {
    if (active && cloud && available) void personal.configure();
  }, [active, cloud, available, personal.scopeKey]);
  const gmailIdentity = personal.accounts
    .map((account) => account.id)
    .join(":");
  useEffect(() => {
    const added = personal.accounts.find(
      (account) => !observedGmailIds.current.includes(account.id),
    );
    observedGmailIds.current = personal.accounts.map((account) => account.id);
    if (added) {
      setSelected(added.id);
      setAdding(false);
      setForm((current) => ({ ...current, password: "" }));
    }
  }, [gmailIdentity]);
  function close(id: string) {
    const view = refs.current.find((item) => item.id === id);
    if (view) {
      clearTimeout(view.timer);
      view.dispose();
    }
    const remaining = refs.current.filter((item) => item.id !== id);
    refs.current = remaining;
    setViews(remaining);
    setSelected((current) => (current === id ? null : current));
  }
  function add(email: string, mailbox: Mailbox, dispose: () => void) {
    const previous = refs.current.filter(
      (item) => item.email.toLowerCase() === email.toLowerCase(),
    );
    for (const item of previous) {
      clearTimeout(item.timer);
      item.dispose();
    }
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const timer = setTimeout(() => close(id), 60 * 60 * 1000);
    const next = [
      ...refs.current.filter((item) => !previous.includes(item)),
      {
        id,
        scope: personal.scopeKey,
        email,
        mailbox,
        dispose,
        expiresAt,
        timer,
      },
    ];
    refs.current = next;
    setViews(next);
    setSelected(id);
    setAdding(false);
  }
  function choose(value: Provider) {
    serviceSequence.current++;
    setChecking(false);
    setProvider(value);
    setForm((current) => ({
      ...current,
      ...(value === "google" ? { imapHost: "", smtpHost: "" } : presets[value]),
      password: "",
    }));
    setError("");
    setServiceNotice("");
    setConsent(false);
  }
  function changeForm(value: MailConnection) {
    serviceSequence.current++;
    setChecking(false);
    setServiceNotice("");
    setForm(value);
    setConsent(false);
    setError("");
  }
  async function connect() {
    if (
      busy ||
      !online ||
      !available ||
      !cloud ||
      Boolean(attempt.current && !attempt.current.signal.aborted) ||
      provider === "google" ||
      !consent
    )
      return;
    setBusy(true);
    setError("");
    const version = generation.current,
      scope = personal.scopeKey,
      controller = new AbortController();
    attempt.current = controller;
    let mailbox: ReturnType<typeof createImapMailbox> | null = null;
    const config = {
      ...form,
      username: form.username.trim() || form.email.trim(),
      email: form.email.trim(),
      imapHost: form.imapHost.trim(),
      smtpHost: form.smtpHost.trim(),
    };
    setConsent(false);
    setForm((current) => ({ ...current, password: "" }));
    try {
      mailbox = createImapMailbox(config, snapshot.organization.id, {
        version: mailConnectorPrivacy.version,
        accepted: true,
      });
      const email = await mailbox.profile(controller.signal);
      if (
        controller.signal.aborted ||
        generation.current !== version ||
        currentScope.current !== scope
      ) {
        mailbox.dispose();
        return;
      }
      const connected = mailbox;
      add(email, connected, () => connected.dispose());
      setConsent(false);
      setForm({ ...empty, ...presets[provider] });
    } catch (reason) {
      mailbox?.dispose();
      if (
        generation.current === version &&
        currentScope.current === scope &&
        !controller.signal.aborted
      )
        setError(
          reason instanceof MailError && reason.code === "denied"
            ? "El proveedor ha rechazado el acceso. Revisa el usuario y la contraseña del buzón o de aplicación."
            : reason instanceof MailError && reason.code === "consent_required"
              ? "Actualiza TruckControl y acepta la información de privacidad de IMAP/SMTP antes de volver a conectar este buzón."
              : reason instanceof MailError && reason.code === "expired"
                ? "La sesión de TruckControl ha caducado. Vuelve a entrar en tu cuenta."
                : "No se ha conectado el buzón. Comprueba los servidores IMAP/SMTP y la contraseña de aplicación. No se ha guardado tu contraseña.",
        );
    } finally {
      config.password = "";
      if (attempt.current === controller) attempt.current = null;
      if (generation.current === version && currentScope.current === scope)
        setBusy(false);
    }
  }
  async function checkService() {
    if (checking || !online || provider === "google") return;
    setChecking(true);
    setServiceNotice("");
    const version = generation.current,
      scope = personal.scopeKey,
      sequence = ++serviceSequence.current;
    try {
      const path =
        provider === "porkbun" || provider === "yahoo"
          ? `transport-check?provider=${provider}`
          : "health";
      const response = await fetch(
        `https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/personal-mail/${path}`,
        {
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await response.json();
      if (
        !response.ok ||
        (result.tls_verified &&
          (!result.tls_verified.imap || !result.tls_verified.smtp))
      )
        throw Error();
      if (
        generation.current !== version ||
        currentScope.current !== scope ||
        serviceSequence.current !== sequence
      )
        return;
      setServiceNotice(
        result.tls_verified
          ? "Conexión cifrada de lectura y envío con el proveedor verificada. Falta autorizar tu cuenta para conectar el buzón."
          : "Servicio de correo disponible. La conexión de tu cuenta se verifica al autorizar el buzón.",
      );
    } catch {
      if (
        generation.current === version &&
        currentScope.current === scope &&
        serviceSequence.current === sequence
      )
        setServiceNotice(
          "No se ha podido verificar el servicio de correo en este momento. No se ha conectado ningún buzón.",
        );
    } finally {
      if (
        generation.current === version &&
        currentScope.current === scope &&
        serviceSequence.current === sequence
      )
        setChecking(false);
    }
  }
  const accounts: UnifiedMailboxAccount[] = [
    ...personal.accounts.map((account) => ({
      ...account,
      disconnect: () => personal.disconnectAccount(account.id),
      expire: () => personal.expireAccount(account.id),
    })),
    ...views
      .filter(
        (view) =>
          view.scope === personal.scopeKey && view.expiresAt > Date.now(),
      )
      .map((view) => ({
        id: view.id,
        email: view.email,
        provider: "imap" as const,
        mailbox: view.mailbox,
        expiresAt: view.expiresAt,
        disconnect: () => close(view.id),
        expire: () => close(view.id),
      })),
  ];
  const selectedAccount = accounts.find((account) => account.id === selected);
  const showForm = adding || !selectedAccount;
  if (!active && !accounts.length) return null;
  return (
    <ConnectedMailAutomationProvider
      accounts={accounts}
      available={cloud && online && available}
    >
      <section
        className="mail-workspace"
        hidden={!active}
        aria-labelledby="mail-title"
      >
        <div className="page-heading">
          <div>
            <p className="eyebrow">TU ESPACIO DE TRABAJO</p>
            <h1 id="mail-title">Correo</h1>
            <p>Conecta las cuentas que quieras utilizar y elige tu buzón.</p>
          </div>
        </div>
        <div className="mail-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => {
              setAdding(true);
              setConsent(false);
              setForm((current) => ({ ...current, password: "" }));
              setError("");
            }}
          >
            <Plus size={18} aria-hidden="true" /> Añadir correo
          </button>
        </div>
        <ConnectedMailAutomationControls />
        {accounts.length > 0 && (
          <nav className="mail-open-views" aria-label="Correos conectados">
            {accounts.map((account) => (
              <div className="mail-view-tab" key={account.id}>
                <button
                  type="button"
                  className={`button ${selected === account.id && !adding ? "primary" : "secondary"}`}
                  aria-pressed={selected === account.id && !adding}
                  onClick={() => {
                    setSelected(account.id);
                    setAdding(false);
                    setForm((current) => ({ ...current, password: "" }));
                    setConsent(false);
                    if (account.provider === "gmail")
                      personal.select(account.id);
                  }}
                >
                  <Mail size={16} aria-hidden="true" /> {account.email}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  aria-label={`Desconectar ${account.email}`}
                  onClick={account.disconnect}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </nav>
        )}
        {(!online || !available) && (
          <p className="card cargotrack-offline" role="status">
            Necesitas conexión a Internet para utilizar tu correo.
          </p>
        )}
        {showForm && (
          <div className="card mail-provider-card">
            <h2>Añadir una cuenta de correo</h2>
            <p>
              Escribe tu correo y elige cómo quieres conectarlo. La descarga de
              facturas por IA se autoriza después, dentro de cada cuenta.
            </p>
            {cloud ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (provider === "google") {
                    if (personal.ready) personal.connect(form.email);
                    else void personal.prepare();
                  } else void connect();
                }}
              >
                <label htmlFor="mail-email">Correo electrónico</label>
                <input
                  id="mail-email"
                  type="email"
                  required
                  maxLength={254}
                  value={form.email}
                  disabled={busy || personal.connecting}
                  onChange={(event) =>
                    changeForm({ ...form, email: event.target.value })
                  }
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                />
                <label htmlFor="mail-provider">Proveedor de correo</label>
                <select
                  id="mail-provider"
                  value={provider}
                  disabled={busy || personal.connecting}
                  onChange={(event) => choose(event.target.value as Provider)}
                >
                  <option value="google">Gmail / Google Workspace</option>
                  <option value="yahoo">Yahoo Mail</option>
                  <option value="porkbun">Porkbun</option>
                  <option value="gmail">
                    Gmail con contraseña de aplicación
                  </option>
                  <option value="other">Otro proveedor IMAP/SMTP</option>
                </select>
                {provider === "google" ? (
                  <>
                    <p className="muted">
                      Elige esa misma cuenta en la ventana oficial de Google.
                      Autorizar el correo no activa la IA ni descarga facturas.
                    </p>
                    {!personal.googleOriginAllowed ? (
                      <GoogleMailOriginNotice />
                    ) : personal.configured === true ? (
                      <button
                        className="button primary"
                        type="submit"
                        disabled={personal.connecting || !online || !available}
                      >
                        {personal.connecting
                          ? "Preparando Google…"
                          : personal.ready
                            ? "Entrar con Google"
                            : "Preparar conexión con Google"}
                      </button>
                    ) : (
                      <>
                        <p className="muted">
                          {personal.configured === false
                            ? "La conexión de Google aún no está configurada para esta aplicación."
                            : "Comprobando la conexión de Google…"}
                        </p>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={!online || !available}
                          onClick={() => void personal.configure()}
                        >
                          Comprobar Google
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <label htmlFor="mail-password">
                      Contraseña del buzón o de aplicación
                    </label>
                    <input
                      id="mail-password"
                      type="password"
                      required
                      maxLength={2048}
                      value={form.password}
                      disabled={busy}
                      onChange={(event) =>
                        changeForm({ ...form, password: event.target.value })
                      }
                      autoComplete="off"
                    />
                    <details
                      className="mail-provider-advanced"
                      open={provider === "other" ? true : undefined}
                    >
                      <summary>Configuración avanzada del proveedor</summary>
                      <div className="form-grid">
                        <label htmlFor="mail-username">
                          Usuario del buzón (si es diferente del correo)
                        </label>
                        <input
                          id="mail-username"
                          maxLength={254}
                          value={form.username}
                          disabled={busy}
                          onChange={(event) =>
                            changeForm({
                              ...form,
                              username: event.target.value,
                            })
                          }
                          autoComplete="off"
                        />
                        <label htmlFor="mail-imap">
                          Servidor de entrada IMAP · puerto 993, TLS
                        </label>
                        <input
                          id="mail-imap"
                          required
                          maxLength={253}
                          value={form.imapHost}
                          disabled={busy}
                          onChange={(event) =>
                            changeForm({
                              ...form,
                              imapHost: event.target.value,
                            })
                          }
                          placeholder="imap.tuproveedor.com"
                          autoComplete="off"
                        />
                        <label htmlFor="mail-smtp">
                          Servidor de salida SMTP · puerto 465, TLS
                        </label>
                        <input
                          id="mail-smtp"
                          required
                          maxLength={253}
                          value={form.smtpHost}
                          disabled={busy}
                          onChange={(event) =>
                            changeForm({
                              ...form,
                              smtpHost: event.target.value,
                            })
                          }
                          placeholder="smtp.tuproveedor.com"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={checking || !online}
                        onClick={() => void checkService()}
                      >
                        {checking
                          ? "Comprobando servicio…"
                          : "Comprobar servicio de correo"}
                      </button>
                      {serviceNotice && <p role="status">{serviceNotice}</p>}
                    </details>
                    <MailConnectorDisclosure />
                    <label className="mail-consent">
                      <input
                        type="checkbox"
                        required
                        checked={consent}
                        disabled={busy}
                        aria-describedby="mail-connector-disclosure"
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      {t(mailConnectorPrivacy.consentLabel)}
                    </label>
                    {(provider === "yahoo" || provider === "gmail") && (
                      <p className="muted">
                        Usa una contraseña de aplicación si tu proveedor la
                        requiere.
                      </p>
                    )}
                    {provider === "porkbun" && (
                      <p className="muted">
                        Usa la contraseña de este buzón, que puede ser distinta
                        de la del panel de Porkbun.
                      </p>
                    )}
                    <button
                      className="button primary"
                      type="submit"
                      disabled={busy || !consent || !online || !available}
                    >
                      {busy
                        ? "Verificando lectura y envío…"
                        : "Conectar y verificar buzón"}
                    </button>
                  </>
                )}
                {(error || (provider === "google" && personal.error)) && (
                  <p role="alert" className="form-error">
                    {error || personal.error}
                  </p>
                )}
              </form>
            ) : (
              <>
                <p className="muted">
                  Estás en la demo. Las cuentas reales se conectan después de
                  entrar con tu usuario de TruckControl.
                </p>
                <button
                  className="button primary"
                  type="button"
                  onClick={() =>
                    add("demo@example.invalid", createDemoMailbox(), () => {})
                  }
                >
                  Probar buzón ficticio
                </button>
              </>
            )}
            <p className="mail-security">
              <ShieldCheck size={20} aria-hidden="true" /> Las cuentas y
              credenciales permanecen temporalmente en memoria y se desconectan
              al salir, cambiar de empresa o recargar. Los mensajes no se
              guardan en copias offline.
            </p>
            <p className="muted">
              Microsoft 365/Outlook necesita una conexión OAuth compatible con
              su proveedor.
            </p>
            {accounts.length > 0 && (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setSelected(accounts[0].id);
                  setAdding(false);
                  setForm((current) => ({ ...current, password: "" }));
                  setConsent(false);
                }}
              >
                Volver al buzón conectado
              </button>
            )}
          </div>
        )}
        {accounts.map((account) => (
          <div
            key={account.id}
            className="mail-provider-view"
            hidden={showForm || selected !== account.id}
          >
            <ConnectedMailView
              connection={{
                mailbox: account.mailbox,
                email: account.email,
                online: online && available,
                disconnect: account.disconnect,
                expire: account.expire,
              }}
              toolbarAction={
                active && !showForm && selected === account.id
                  ? renderInvoiceAction?.(account)
                  : null
              }
              active={active && !showForm && selected === account.id}
            />
          </div>
        ))}
      </section>
      {!active && <ConnectedMailAutomationControls floating />}
    </ConnectedMailAutomationProvider>
  );
}
