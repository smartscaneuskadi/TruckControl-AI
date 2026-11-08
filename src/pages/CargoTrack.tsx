import { ArrowLeft, ExternalLink, MapPinned, ShieldCheck, Truck } from "lucide-react";

export const CARGOTRACK_LOGIN_URL = "https://on7.cargotrack.ro/signin";

export function CargoTrack() {
  return (
    <section className="cargotrack-page" aria-labelledby="cargotrack-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU FLOTA, CONECTADA</p>
          <h1 id="cargotrack-title">CargoTrack</h1>
          <p>Un acceso directo a tu plataforma de seguimiento.</p>
        </div>
      </div>
      <div className="card cargotrack-card">
        <div className="cargotrack-emblem" aria-hidden="true">
          <Truck size={36} />
          <MapPinned size={26} />
        </div>
        <div className="cargotrack-intro">
          <h2>Tu cuenta de CargoTrack, a un paso</h2>
          <p>
            Consulta la ubicación de tus camiones y los servicios que tengas
            contratados directamente en CargoTrack.
          </p>
          <a
            className="button primary cargotrack-enter"
            href={CARGOTRACK_LOGIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            aria-describedby="cargotrack-return"
          >
            Entrar en CargoTrack <ExternalLink size={18} aria-hidden="true" />
          </a>
          <p id="cargotrack-return" className="muted">
            Se abre una nueva pestaña del navegador. TruckControl AI permanece
            abierta aquí para que puedas volver cuando quieras.
          </p>
        </div>
        <div className="cargotrack-security">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <h3>Acceso directo y seguro</h3>
            <p>
              Inicia sesión únicamente en la página oficial HTTPS del proveedor.
              TruckControl AI no solicita ni guarda tu contraseña de CargoTrack.
            </p>
            <p>
              Las dos sesiones son independientes. Los datos de CargoTrack no se
              importan ni se sincronizan con tu empresa.
            </p>
          </div>
        </div>
        <a className="button secondary cargotrack-back" href="#/dashboard">
          <ArrowLeft size={18} aria-hidden="true" /> Volver al resumen
        </a>
      </div>
    </section>
  );
}
