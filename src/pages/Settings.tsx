import { useState } from "react";
import {
  Database,
  Download,
  HardDrive,
  MonitorSmartphone,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useInstall } from "../components/PwaTools";
import { downloadFile } from "../lib/export";
import { Badge, Button, Modal, PageHeading } from "../components/ui";

export function Settings() {
  const { snapshot, reset, busy, notify } = useFleet();
  const { install, installed } = useInstall();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="TU ESPACIO DE TRABAJO"
        title="Configuración"
        description="Controla tus datos de demostración y lleva la aplicación contigo."
      />
      <div className="settings-grid">
        <section className="card settings-card">
          <span className="settings-icon">
            <MonitorSmartphone size={25} />
          </span>
          <Badge tone="green">Windows + Android</Badge>
          <h2>Tu flota, donde estés</h2>
          <p>
            Instala la aplicación desde Edge o Chrome. La demo funciona sin
            conexión después de la primera visita.
          </p>
          <Button icon={Download} onClick={install}>
            {installed
              ? "Ver instrucciones de instalación"
              : "Instalar aplicación"}
          </Button>
          <small>
            Aplicación web instalable (PWA). Sin .exe ni .apk en esta fase.
          </small>
        </section>
        <section className="card settings-card">
          <span className="settings-icon">
            <Database size={25} />
          </span>
          <Badge>Preparado · sin conectar</Badge>
          <h2>Base para Supabase</h2>
          <p>
            El proyecto incluye el esquema SQL, aislamiento por organización y
            un cliente configurable. La demo usa el repositorio local y no
            necesita credenciales.
          </p>
          <div className="config-fact">
            <ShieldCheck size={17} />
            Esquema con políticas RLS por propietario
          </div>
          <small>
            La conexión, el inicio de sesión y la sincronización se incorporarán
            en una fase posterior.
          </small>
        </section>
        <section className="card settings-card">
          <span className="settings-icon">
            <HardDrive size={25} />
          </span>
          <Badge tone="blue">Solo este navegador</Badge>
          <h2>Tus datos de demostración</h2>
          <p>
            {snapshot.trucks.length} camiones · {snapshot.drivers.length}{" "}
            conductores · {snapshot.entries.length.toLocaleString("es-ES")}{" "}
            movimientos.
          </p>
          <p>
            Exporta una copia JSON antes de borrar los datos del navegador. La
            importación de copias no está incluida en esta fase.
          </p>
          <Button
            variant="secondary"
            icon={Download}
            onClick={() =>
              downloadFile(
                "truckcontrol-demo-backup.json",
                JSON.stringify(snapshot, null, 2),
                "application/json",
              )
            }
          >
            Descargar copia JSON
          </Button>
        </section>
        <section className="card settings-card reset-card">
          <span className="settings-icon">
            <RotateCcw size={25} />
          </span>
          <h2>Volver a empezar</h2>
          <p>
            Restablece la flota ficticia inicial de 50 camiones. Se eliminarán
            los registros y las ediciones que hayas hecho en este navegador.
          </p>
          <Button
            variant="secondary"
            icon={RotateCcw}
            onClick={() => setConfirm(true)}
          >
            Restablecer demostración
          </Button>
        </section>
      </div>
      {confirm && (
        <Modal
          title="¿Restablecer la demostración?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            Se sustituirán todos los registros locales por una nueva flota
            ficticia de 50 camiones. Descarga una copia JSON si quieres
            conservar el estado actual.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <div className="push-right inline-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  void reset()
                    .then(() => {
                      setConfirm(false);
                      notify("Flota de demostración restablecida.");
                    })
                    .catch((err) => setError(errorMessage(err)));
                }}
              >
                Sí, restablecer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
