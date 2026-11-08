import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPinned,
  ShieldCheck,
  Truck,
  WifiOff,
} from "lucide-react";

export const CARGOTRACK_LOGIN_URL = "https://on7.cargotrack.ro/signin";

export const CARGOTRACK_FRAME_SANDBOX =
  "allow-forms allow-scripts allow-same-origin allow-downloads allow-popups";

/** Kept mounted by Workspace across routes; recreated on identity/company changes. */
export function CargoTrack({
  active = true,
  available = true,
}: {
  active?: boolean;
  available?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!active && !opened) return null;
  return (
    <section
      className="cargotrack-page"
      aria-labelledby="cargotrack-title"
      hidden={!active}
      data-open={opened && available ? "true" : "false"}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU FLOTA, CONECTADA</p>
          <h1 id="cargotrack-title">CargoTrack</h1>
          <p>Tu plataforma de seguimiento, dentro de TruckControl AI.</p>
        </div>
      </div>
      {!opened || !available ? (
        <div className="card cargotrack-card">
          <div className="cargotrack-emblem" aria-hidden="true">
            <Truck size={36} />
            <MapPinned size={26} />
          </div>
          <div className="cargotrack-intro">
            <h2>Tu cuenta de CargoTrack, en esta pantalla</h2>
            <p>
              Consulta la ubicación de tus camiones y los servicios que tengas
              contratados directamente en CargoTrack.
            </p>
            <button
              className="button primary cargotrack-enter"
              type="button"
              disabled={!online || !available}
              onClick={() => setOpened(true)}
              aria-describedby="cargotrack-return"
            >
              Entrar en CargoTrack <MapPinned size={18} aria-hidden="true" />
            </button>
            <p id="cargotrack-return" className="muted">
              Se abre aquí. Puedes cambiar de sección y volver sin recargar
              CargoTrack. La duración de tu sesión la gestiona el proveedor.
            </p>
          </div>
          <div className="cargotrack-security">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h3>Acceso directo y seguro</h3>
              <p>
                Inicia sesión únicamente en la página oficial HTTPS del
                proveedor. TruckControl AI no solicita ni guarda tu contraseña
                de CargoTrack.
              </p>
              <p>
                CargoTrack utiliza su propia sesión en este navegador. Si
                cambias de cuenta o compartes el dispositivo, cierra también esa
                sesión desde CargoTrack. Sus datos no se importan a TruckControl
                AI.
              </p>
            </div>
          </div>
          <a className="button secondary cargotrack-back" href="#/dashboard">
            <ArrowLeft size={18} aria-hidden="true" /> Volver al resumen
          </a>
        </div>
      ) : (
        <div className="cargotrack-workspace">
          <div className="card cargotrack-toolbar">
            <div>
              <p className="cargotrack-view-status" role="status">
                Vista de CargoTrack abierta
              </p>
              <p className="muted">
                Permanece abierta al cambiar de sección. Inicia sesión
                directamente en CargoTrack.
              </p>
            </div>
            <a className="button secondary" href="#/dashboard">
              <ArrowLeft size={18} aria-hidden="true" /> Volver al resumen
            </a>
          </div>
          <iframe
            className="cargotrack-frame"
            title="CargoTrack · acceso y seguimiento"
            src={CARGOTRACK_LOGIN_URL}
            referrerPolicy="no-referrer"
            sandbox={CARGOTRACK_FRAME_SANDBOX}
            allow="fullscreen"
            allowFullScreen
          />
          <details className="card cargotrack-help">
            <summary>¿No se muestra CargoTrack?</summary>
            <p>
              Algunos navegadores restringen el almacenamiento de páginas
              integradas. Puedes abrir el proveedor en esta misma pestaña y
              regresar con Atrás.
            </p>
            <a
              className="button secondary"
              href={CARGOTRACK_LOGIN_URL}
              target="_self"
              rel="noreferrer"
              referrerPolicy="no-referrer"
            >
              Abrir directamente en esta misma pestaña
            </a>
          </details>
        </div>
      )}
      {(!online || !available) && (
        <p className="card cargotrack-offline" role="status">
          <WifiOff size={20} aria-hidden="true" /> CargoTrack necesita conexión
          a Internet. Su información puede no estar actualizada.
        </p>
      )}
    </section>
  );
}
