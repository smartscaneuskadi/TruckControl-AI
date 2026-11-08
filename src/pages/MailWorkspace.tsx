import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, FileText, ShieldCheck } from "lucide-react";
import { webmailUrl } from "../domain/webmail";

const providers = [
  { label: "Gmail", url: "https://mail.google.com/" },
  { label: "Yahoo Mail", url: "https://mail.yahoo.com/" },
  { label: "Webmail Porkbun", url: "https://webmail.porkbun.com/" },
  { label: "Outlook", url: "https://outlook.live.com/mail/" },
];
interface MailView {
  id: string;
  url: string;
  label: string;
}

/** Documents stay mounted across route/tab switches; identity/company changes reset them. */
export function MailWorkspace({
  active,
  available,
}: {
  active: boolean;
  available: boolean;
}) {
  const nextView = useRef(0);
  const [address, setAddress] = useState("");
  const [views, setViews] = useState<MailView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!active && !views.length) return null;
  const enabled = available && online;
  function open(url: string, label = new URL(url).hostname) {
    if (!enabled) return;
    const id = String(++nextView.current);
    setViews((current) => [...current, { id, url, label }]);
    setSelected(id);
    setError("");
    setAddress("");
  }
  function close(id: string) {
    setViews((current) => current.filter((view) => view.id !== id));
    if (selected === id) setSelected(null);
  }
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
            Abre tus correos y cambia entre ellos sin salir de TruckControl.
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
      {views.length > 0 && (
        <nav className="mail-open-views" aria-label="Correos abiertos">
          {views.map((view, index) => (
            <div className="mail-view-tab" key={view.id}>
              <button
                className={`button ${selected === view.id ? "primary" : "secondary"}`}
                type="button"
                aria-pressed={selected === view.id}
                onClick={() => setSelected(view.id)}
              >
                {view.label} · {index + 1}
              </button>
              <button
                className="button secondary"
                type="button"
                aria-label={`Cerrar vista ${view.label} · ${index + 1}`}
                onClick={() => close(view.id)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </nav>
      )}
      {!enabled && (
        <p className="card cargotrack-offline" role="status">
          Necesitas conexión a Internet para abrir tu correo.
        </p>
      )}
      {(!selected || !available) && (
        <div className="card mail-provider-card">
          <h2>Elige tu correo</h2>
          <p>
            Inicia sesión directamente en el proveedor con tu cuenta habitual.
            Puedes abrir tantos correos como necesites; TruckControl no fija un
            máximo.
          </p>
          <div className="mail-provider-grid">
            {providers.map((provider) => (
              <button
                key={provider.url}
                className="button secondary"
                type="button"
                disabled={!enabled}
                onClick={() => open(provider.url, provider.label)}
              >
                {provider.label}
              </button>
            ))}
          </div>
          <p className="muted">
            Cada vista permanece abierta al cambiar de correo o sección. Algunos
            proveedores bloquean las vistas integradas; en ese caso puedes abrir
            el correo en esta misma pestaña y regresar con Atrás.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const url = webmailUrl(address);
              if (!url) {
                setError(
                  "Introduce la dirección HTTPS pública de tu webmail, sin usuario ni contraseña.",
                );
                return;
              }
              open(url);
            }}
          >
            <label htmlFor="webmail-address">
              Otro enlace · dirección de tu webmail
            </label>
            <input
              id="webmail-address"
              type="url"
              required
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="https://correo.tudominio.com"
              autoComplete="off"
              aria-describedby="webmail-address-help"
            />
            <p id="webmail-address-help" className="muted">
              Usa el enlace de acceso que te facilite tu proveedor, aunque el
              dominio esté comprado en Porkbun.
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="button primary"
              disabled={!enabled}
              type="submit"
            >
              Abrir correo aquí
            </button>
          </form>
          <p className="mail-security">
            <ShieldCheck size={20} aria-hidden="true" /> Las contraseñas se
            introducen en el proveedor. Esta vista no importa mensajes ni
            adjuntos a TruckControl.
          </p>
          <p className="muted">
            Las cuentas del mismo proveedor pueden compartir la sesión del
            navegador. Para usar varias cuentas, utiliza el selector de cuentas
            que ofrezca el proveedor. La capacidad práctica depende de la
            memoria de tu dispositivo.
          </p>
        </div>
      )}
      {available &&
        views.map((view) => (
          <div
            className="cargotrack-workspace mail-provider-view"
            key={view.id}
            hidden={selected !== view.id}
          >
            <div className="card cargotrack-toolbar">
              <div>
                <p className="cargotrack-view-status" role="status">
                  Vista de correo abierta
                </p>
                <p className="muted">
                  {new URL(view.url).hostname} · Conserva su página al cambiar
                  de sección. La sesión depende del proveedor.
                </p>
              </div>
            </div>
            <iframe
              className="cargotrack-frame"
              title={`Correo · ${view.label}`}
              src={view.url}
              referrerPolicy="no-referrer"
              sandbox="allow-forms allow-scripts allow-same-origin allow-downloads"
            />
            <div className="card cargotrack-help">
              <h2>¿No aparece el correo o no puedes entrar?</h2>
              <p>
                El proveedor puede bloquear las vistas integradas. Abrir la
                vista no confirma que hayas iniciado sesión.
              </p>
              <a
                className="button secondary"
                href={view.url}
                target="_self"
                rel="noreferrer"
                referrerPolicy="no-referrer"
              >
                Abrir correo en esta misma pestaña
              </a>
            </div>
            <p className="muted">
              Cerrar esta vista no cierra la sesión del proveedor. Antes de
              compartir el dispositivo, cierra la sesión también desde tu
              correo.
            </p>
          </div>
        ))}
    </section>
  );
}
