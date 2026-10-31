import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArchiveRestore, Download, FileUp, HardDrive } from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import {
  createDemoBackup,
  maxDemoBackupBytes,
  parseDemoBackupText,
  prepareDemoRestore,
  readDemoRecovery,
  restoreDemoBackup,
} from "../data/demo-backup";
import type { DemoBackup, DemoRestorePreview } from "../data/demo-backup";
import { demoRestoreViewKey } from "../data/demo-keys";
import { downloadFile } from "../lib/export";
import { Badge, Button, Field, Modal } from "./ui";

export function DemoBackupTools() {
  const fleet = useFleet(),
    operations = useOperations();
  const [preview, setPreview] = useState<DemoRestorePreview | null>(null),
    [legacy, setLegacy] = useState(false),
    [filename, setFilename] = useState(""),
    [recovery, setRecovery] = useState<DemoBackup | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false);
  const unavailable =
    busy ||
    fleet.busy ||
    operations.busy ||
    operations.loading ||
    Boolean(operations.error);
  useEffect(() => {
    try {
      setRecovery(readDemoRecovery(localStorage));
    } catch {
      setError(
        "La copia de recuperación guardada no es válida. Se conserva sin modificar.",
      );
    }
  }, []);
  function downloadCurrent() {
    try {
      const backup = createDemoBackup(fleet.snapshot, operations.rows);
      downloadFile(
        `truckcontrol-demo-registros-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
        "application/json",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function stage(backup: DemoBackup, name: string, old = false) {
    setPreview(prepareDemoRestore(localStorage, backup));
    setFilename(name);
    setLegacy(old);
    setAccepted(false);
    setError("");
  }
  async function select(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable) return;
    const form = event.currentTarget,
      data = new FormData(form),
      file = data.get("backup");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > maxDemoBackupBytes)
        throw Error("La copia supera el máximo de 10 MB.");
      const parsed = parseDemoBackupText(await file.text());
      stage(parsed.backup, file.name, parsed.legacy);
      form.reset();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function confirm() {
    if (!preview || !accepted || unavailable) return;
    setBusy(true);
    setError("");
    try {
      restoreDemoBackup(localStorage, preview);
      try {
        sessionStorage.setItem(demoRestoreViewKey, "yes");
      } catch {
        /* Preference only; data is already durable. */
      }
      window.location.reload();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card settings-card demo-backup-card">
        <span className="settings-icon">
          <HardDrive size={25} />
        </span>
        <Badge tone="blue">Copias y recuperación de la demo</Badge>
        <h2>Conserva fichas y operaciones</h2>
        <p>
          La copia incluye camiones, conductores, movimientos, remolques,
          clientes, viajes, mantenimiento, combustible y avisos. Se descarga sin
          cifrar: utiliza únicamente datos ficticios.
        </p>
        <p>
          Los PDF e imágenes de la biblioteca no están incluidos. Descárgalos
          desde Documentos. La restauración conserva los archivos que ya están
          en este navegador.
        </p>
        <Button
          variant="secondary"
          icon={Download}
          disabled={unavailable}
          onClick={downloadCurrent}
        >
          Descargar copia de registros
        </Button>
        <form className="demo-backup-form" onSubmit={select}>
          <Field label="Seleccionar copia JSON de la demo">
            <input
              type="file"
              name="backup"
              accept="application/json,.json"
              required
              disabled={unavailable}
            />
          </Field>
          <small>
            Máximo 10 MB. El archivo se comprueba localmente antes de cambiar
            datos.
          </small>
          <Button
            variant="secondary"
            icon={FileUp}
            type="submit"
            disabled={unavailable}
          >
            Revisar copia
          </Button>
        </form>
        {recovery && (
          <Button
            variant="secondary"
            icon={ArchiveRestore}
            disabled={unavailable}
            onClick={() => {
              try {
                stage(recovery, "Estado anterior a la última restauración");
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Recuperar estado anterior
          </Button>
        )}
        {error && !preview && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {preview && (
        <Modal
          title="Revisar restauración de la demo"
          onClose={() => {
            if (!busy) {
              setPreview(null);
              setError("");
            }
          }}
        >
          <p>
            <strong>{filename}</strong>
          </p>
          <p>
            La copia contiene {preview.backup.fleet.trucks.length} camiones,{" "}
            {preview.backup.fleet.drivers.length} conductores,{" "}
            {preview.backup.fleet.entries.length} movimientos y{" "}
            {preview.backup.operations.length} operaciones.
          </p>
          {legacy && (
            <p>
              Esta copia usa el formato antiguo. Solo se restaurarán las
              operaciones que incluya; las copias antiguas de fichas no
              contienen operaciones.
            </p>
          )}
          <p>
            Al confirmar se sustituirán los registros de demostración actuales.
            Antes se guardará un punto de recuperación con el estado actual;
            podrás recuperarlo desde Configuración. Se conserva únicamente el
            punto de la última restauración.
          </p>
          <Button
            variant="secondary"
            icon={Download}
            disabled={busy}
            onClick={downloadCurrent}
          >
            Descargar mis registros actuales
          </Button>
          <label className="backup-confirmation">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={busy}
            />{" "}
            Confirmo que la copia contiene solo datos ficticios y quiero
            sustituir los registros de esta demo.
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={!accepted || unavailable}
              onClick={confirm}
            >
              Confirmar restauración
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
