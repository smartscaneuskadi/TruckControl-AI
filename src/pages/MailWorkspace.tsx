import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, FileText, ShieldCheck } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useFleet } from "../app/FleetProvider";
import { sessionExitEvent } from "../app/session-events";
import { ConnectedMailView } from "./PersonalMail";
import { createImapMailbox } from "../integrations/personal-mail/imap";
import { createDemoMailbox } from "../integrations/personal-mail/demo";
import { MailError } from "../integrations/personal-mail/gmail";
import type { Mailbox } from "../integrations/personal-mail/gmail";
import type { MailConnection } from "../integrations/personal-mail/imap";

type View = {
  id: string;
  email: string;
  mailbox: Mailbox;
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
export function MailWorkspace({
  active,
  available,
}: {
  active: boolean;
  available: boolean;
}) {
  const company = useCompany(),
    { snapshot } = useFleet();
  const cloud = company.mode === "company";
  const [views, setViews] = useState<View[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const [provider, setProvider] = useState<keyof typeof presets>("porkbun"),
    [form, setForm] = useState<MailConnection>({
      ...empty,
      ...presets.porkbun,
    });
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [serviceNotice, setServiceNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const refs = useRef<View[]>([]),
    next = useRef(0),
    generation = useRef(0),
    attempt = useRef<AbortController | null>(null);
  refs.current = views;
  function clear() {
    generation.current++;
    attempt.current?.abort();
    for (const view of refs.current) {
      clearTimeout(view.timer);
      view.dispose();
    }
    refs.current = [];
    setViews([]);
    setSelected(null);
    setForm({ ...empty, ...presets.porkbun });
    setConsent(false);
    setBusy(false);
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
  function close(id: string) {
    const view = refs.current.find((v) => v.id === id);
    if (view) {
      clearTimeout(view.timer);
      view.dispose();
    }
    setViews((current) => current.filter((v) => v.id !== id));
    setSelected((current) => (current === id ? null : current));
  }
  function add(email: string, mailbox: Mailbox, dispose: () => void) {
    const id = String(++next.current);
    const timer = setTimeout(() => close(id), 60 * 60 * 1000);
    setViews((current) => [...current, { id, email, mailbox, dispose, timer }]);
    setSelected(id);
  }
  function choose(value: keyof typeof presets) {
    setProvider(value);
    setForm((current) => ({ ...current, ...presets[value], password: "" }));
    setError("");
    setConsent(false);
  }
  async function connect() {
    if (busy || !online || !available || !cloud || !consent) return;
    setBusy(true);
    setError("");
    const version = generation.current;
    const controller = new AbortController();
    attempt.current = controller;
    let mailbox: ReturnType<typeof createImapMailbox> | null = null;
    const config = {
      ...form,
      username: form.username.trim() || form.email.trim(),
      email: form.email.trim(),
      imapHost: form.imapHost.trim(),
      smtpHost: form.smtpHost.trim(),
    };
    setForm((current) => ({ ...current, password: "" }));
    try {
      mailbox = createImapMailbox(config, snapshot.organization.id);
      const email = await mailbox.profile(controller.signal);
      if (controller.signal.aborted || generation.current !== version) {
        mailbox.dispose();
        return;
      }
      const connected = mailbox;
      add(email, connected, () => connected.dispose());
      setConsent(false);
      setForm({ ...empty, ...presets[provider] });
    } catch (reason) {
      mailbox?.dispose();
      if (generation.current === version && !controller.signal.aborted)
        setError(
          reason instanceof MailError && reason.code === "denied"
            ? "El proveedor ha rechazado el acceso. Revisa el usuario y la contraseña del buzón o de aplicación; no uses la contraseña del panel de Porkbun."
            : reason instanceof MailError && reason.code === "expired"
              ? "La sesión de TruckControl ha caducado. Vuelve a entrar en tu cuenta."
              : "No se ha conectado el buzón. Comprueba los servidores IMAP/SMTP, el permiso de acceso y la contraseña de aplicación. No se ha guardado tu contraseña.",
        );
    } finally {
      config.password = "";
      if (generation.current === version) setBusy(false);
    }
  }
  async function checkService() {
    if (checking || !online) return;
    setChecking(true);
    setServiceNotice("");
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
      setServiceNotice(
        result.tls_verified
          ? "Conexión cifrada de lectura y envío con el proveedor verificada. Falta autorizar tu cuenta para conectar el buzón."
          : "Servicio de correo disponible. La conexión de tu cuenta se verifica al autorizar el buzón.",
      );
    } catch {
      setServiceNotice(
        "No se ha podido verificar el servicio de correo en este momento. No se ha conectado ningún buzón.",
      );
    } finally {
      setChecking(false);
    }
  }
  if (!active && !views.length) return null;
  return (
    <section
      className="mail-workspace"
      hidden={!active}
      aria-labelledby="mail-title"
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU ESPACIO DE TRABAJO</p>
          <h1 id="mail-title">Correo</h1>
          <p>
            Conecta tu cuenta para leer, responder y enviar mensajes dentro de
            TruckControl.
          </p>
        </div>
      </div>
      <div className="mail-actions">
        <button
          className="button primary"
          type="button"
          onClick={() => setSelected(null)}
        >
          <Plus size={18} aria-hidden="true" /> Añadir otro correo
        </button>
        <Link className="button secondary" to="/invoices">
          <FileText size={18} aria-hidden="true" /> Facturas del correo
        </Link>
      </div>
      {!selected && (
        <div className="mail-actions">
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
        </div>
      )}
      {views.length > 0 && (
        <nav className="mail-open-views" aria-label="Correos conectados">
          {views.map((view) => (
            <div className="mail-view-tab" key={view.id}>
              <button
                type="button"
                className={`button ${selected === view.id ? "primary" : "secondary"}`}
                aria-pressed={selected === view.id}
                onClick={() => setSelected(view.id)}
              >
                {view.email}
              </button>
              <button
                type="button"
                className="button secondary"
                aria-label={`Desconectar ${view.email}`}
                onClick={() => close(view.id)}
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
      {!selected && (
        <div className="card mail-provider-card">
          <h2>Conectar una cuenta de correo</h2>
          <p>
            Utiliza la autorización de Google o los servidores de tu proveedor.
            Tus mensajes se muestran en el buzón de TruckControl.
          </p>
          <div className="mail-provider-grid">
            <Link className="button secondary" to="/mailbox/gmail">
              Conectar Gmail con Google
            </Link>
            <button
              className="button secondary"
              type="button"
              onClick={() => choose("yahoo")}
            >
              Yahoo Mail
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => choose("porkbun")}
            >
              Porkbun
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => choose("other")}
            >
              Otro proveedor IMAP/SMTP
            </button>
          </div>
          {cloud ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void connect();
              }}
            >
              <label htmlFor="mail-provider">Proveedor</label>
              <select
                id="mail-provider"
                value={provider}
                disabled={busy}
                onChange={(event) =>
                  choose(event.target.value as keyof typeof presets)
                }
              >
                <option value="porkbun">Porkbun</option>
                <option value="yahoo">Yahoo Mail</option>
                <option value="gmail">
                  Gmail con contraseña de aplicación
                </option>
                <option value="other">Otro proveedor IMAP/SMTP</option>
              </select>
              <label htmlFor="mail-email">Correo electrónico</label>
              <input
                id="mail-email"
                type="email"
                required
                maxLength={254}
                value={form.email}
                disabled={busy}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
              <label htmlFor="mail-username">
                Usuario del buzón (si es diferente del correo)
              </label>
              <input
                id="mail-username"
                maxLength={254}
                value={form.username}
                disabled={busy}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="off"
              />
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
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
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
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                placeholder="smtp.tuproveedor.com"
                autoComplete="off"
              />
              <label className="mail-consent">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                Autorizo a TruckControl a conectar este buzón para leer y enviar
                mis mensajes mediante estos servidores.
              </label>
              {provider === "yahoo" && (
                <p className="muted">
                  Yahoo necesita una contraseña de aplicación. Puedes generarla
                  en la seguridad de tu cuenta de Yahoo.
                </p>
              )}
              {provider === "porkbun" && (
                <p className="muted">
                  Usa la contraseña de este buzón de correo, que puede ser
                  distinta de la contraseña del panel de Porkbun.
                </p>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
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
            <ShieldCheck size={20} aria-hidden="true" /> Tus contraseñas y
            mensajes no se guardan en copias offline. Los datos de acceso se
            envían cifrados al servidor de conexión y se conservan solo en
            memoria durante esta sesión, hasta una hora.
          </p>
          <p className="muted">
            Puedes conectar varias cuentas sin un máximo fijado por
            TruckControl. Es necesario que el proveedor admita IMAP 993 y SMTP
            465 o una autorización compatible. Microsoft 365/Outlook requiere
            una integración OAuth específica; no queda conectado por introducir
            un enlace. Las cuentas se desconectan al salir, cambiar de empresa o
            recargar la app.
          </p>
        </div>
      )}
      {views.map((view) => (
        <div
          key={view.id}
          className="mail-provider-view"
          hidden={selected !== view.id}
        >
          <ConnectedMailView
            connection={{
              mailbox: view.mailbox,
              email: view.email,
              online: online && available,
              disconnect: () => close(view.id),
              expire: () => close(view.id),
            }}
          />
        </div>
      ))}
    </section>
  );
}
