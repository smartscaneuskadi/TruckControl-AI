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
import { Badge, Button, Field, Modal, PageHeading } from "../components/ui";
import { useCompany } from "../app/CompanyAccess";
import { Link } from "react-router-dom";
import { OfflineSettings } from "../components/OfflineSettings";
import { DemoBackupTools } from "../components/DemoBackupTools";
import { useOperations } from "../app/OperationsProvider";
import { AppearanceSettings } from "../components/AppearanceSettings";
import { CompanyBackupTools } from "../components/CompanyBackupTools";

export function Settings() {
  const { snapshot, reset, refresh, busy, notify } = useFleet();
  const operations = useOperations();
  const access = useCompany();
  const cloud = access.mode === "company";
  const { install, installed } = useInstall();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="TU ESPACIO DE TRABAJO"
        title="Configuración"
        description={
          cloud
            ? "Gestiona tu cuenta, tus empresas y sus conexiones."
            : "Controla tus datos de demostración y lleva la aplicación contigo."
        }
      />
      <AppearanceSettings />
      <div className="settings-grid">
        <OfflineSettings />
        {cloud && <CompanyBackupTools />}
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
          <Badge tone={cloud ? "green" : "amber"}>
            {cloud ? "Cuenta conectada" : "Acceso de empresas"}
          </Badge>
          <h2>
            {cloud
              ? snapshot.organization.name
              : "Cada empresa, su propio espacio"}
          </h2>
          <p>
            {cloud
              ? `Sesión de ${access.user?.email}. Tus empresas solo están disponibles desde tu cuenta.`
              : "Gestiona empresas con datos separados y una conexión Gmail propia. La demostración seguirá guardada en este navegador."}
          </p>
          <div className="config-fact">
            <ShieldCheck size={17} />
            Permisos por propietario y empresa
          </div>
          {cloud ? (
            <>
              <Field label="Empresa activa">
                <select
                  className="company-select"
                  value={snapshot.organization.id}
                  onChange={(e) => access.select(e.target.value)}
                >
                  {access.organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="access-links">
                <Button variant="secondary" onClick={access.newCompany}>
                  Crear otra empresa
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void refresh()
                      .then(() => notify("Datos actualizados."))
                      .catch((e) => setError(errorMessage(e)))
                  }
                >
                  Actualizar datos
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void access
                      .signOut()
                      .catch((e) => setError(errorMessage(e)))
                  }
                >
                  Cerrar sesión
                </Button>
              </div>
              <Link to="/invoices" className="button secondary">
                Gestionar Gmail de esta empresa
              </Link>
            </>
          ) : (
            <>
              <p>
                {access.configured
                  ? "El acceso de empresas está disponible."
                  : "La demo funciona sin conexión de empresa. El portal de TruckControl permite solicitar una cuenta y consultar los planes."}
              </p>
              <Button onClick={access.openAccount}>Acceso de empresas</Button>
            </>
          )}
        </section>
        <section className="card settings-card">
          <span className="settings-icon">
            <HardDrive size={25} />
          </span>
          <Badge tone="blue">
            {cloud ? "Copia de tu empresa" : "Solo este navegador"}
          </Badge>
          <h2>{cloud ? "Exportar mis datos" : "Tus datos de demostración"}</h2>
          <p>
            {snapshot.trucks.length} camiones · {snapshot.drivers.length}{" "}
            conductores · {snapshot.entries.length.toLocaleString("es-ES")}{" "}
            movimientos.
          </p>
          <p>
            {cloud
              ? "Descarga una copia de los registros de esta empresa. Guárdala en un lugar privado."
              : "Exporta una copia JSON antes de borrar los datos del navegador."}{" "}
            {cloud
              ? "La copia no incluye documentos ni operaciones; es una exportación de fichas y movimientos, no una restauración de servidor."
              : "Para incluir operaciones y restaurar una copia, utiliza Copias y recuperación de la demo."}
          </p>
          <Button
            variant="secondary"
            icon={Download}
            onClick={() =>
              downloadFile(
                cloud
                  ? `truckcontrol-${snapshot.organization.id}.json`
                  : "truckcontrol-demo-backup.json",
                JSON.stringify(snapshot, null, 2),
                "application/json",
              )
            }
          >
            Descargar copia JSON
          </Button>
        </section>
        {!cloud && <DemoBackupTools />}
        {!cloud && (
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
              disabled={busy || operations.busy}
              onClick={() => setConfirm(true)}
            >
              Restablecer demostración
            </Button>
          </section>
        )}
      </div>
      {error && !confirm && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {confirm && (
        <Modal
          title="¿Restablecer la demostración?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            Se sustituirán las fichas, movimientos y operaciones por la flota
            ficticia inicial de 50 camiones. Los PDF e imágenes de la biblioteca
            se conservan. Descarga una copia de registros si quieres conservar
            el estado actual.
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
                disabled={busy || operations.busy}
                onClick={() => setConfirm(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={busy || operations.busy}
                onClick={() => {
                  void reset()
                    .then(() => operations.refresh())
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
