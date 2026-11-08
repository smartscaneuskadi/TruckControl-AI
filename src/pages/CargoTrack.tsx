import { ExternalLink, MapPin, ShieldCheck, Truck } from "lucide-react";

export const CARGOTRACK_LOGIN_URL = "https://on7.cargotrack.ro/signin";

export function CargoTrack() {
  return (
    <section aria-labelledby="cargotrack-title" className="card" style={{ padding: "2rem", maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Truck size={32} aria-hidden="true" />
        <MapPin size={24} aria-hidden="true" />
        <h1 id="cargotrack-title">CargoTrack</h1>
      </div>
      <p>Accede a tu cuenta existente para consultar la localización de camiones, combustible y gastos disponibles en CargoTrack.</p>
      <p>El acceso se abre en la página oficial del proveedor. TruckControl AI no solicita ni guarda tus credenciales.</p>
      <a className="button primary" href={CARGOTRACK_LOGIN_URL} target="_blank" rel="noopener noreferrer">
        Entrar en CargoTrack <ExternalLink size={18} aria-hidden="true" />
      </a>
      <p className="muted" style={{ marginTop: 20 }}>
        <ShieldCheck size={16} aria-hidden="true" /> Conexión HTTPS externa. Puedes volver a TruckControl AI en cualquier momento.
      </p>
    </section>
  );
}
