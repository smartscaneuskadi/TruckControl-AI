import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArchiveRestore, Download, ShieldCheck } from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { useOffline } from "../app/OfflineContext";
import { getSupabaseClient } from "../integrations/supabase/client";
import { SupabaseCompanyBackup } from "../integrations/supabase/company-backup";
import {
  collectCompanyBackup,
  decryptCompanyBackup,
  encryptCompanyBackup,
  decodeBackupBytes,
  maxEncryptedBackupBytes,
  backupRequiredFeatures,
} from "../data/company-backup";
import type { CompanyBackup } from "../data/company-backup";
import { downloadFile } from "../lib/export";
import { Badge, Button, Field, Modal } from "./ui";

export function CompanyBackupTools() {
  const fleet = useFleet(),
    company = useCompany(),
    subscription = useSubscription(),
    offline = useOffline();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const [preview, setPreview] = useState<CompanyBackup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState("");
  const controller = useRef<AbortController | null>(null),
    lock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const manager =
    subscription.access?.can_manage === true && subscription.access.active;
  if (company.mode !== "company" || !manager) return null;
  const unavailable = busy || fleet.busy || offline.offline;
  async function run(event: FormEvent<HTMLFormElement>, create: boolean) {
    event.preventDefault();
    if (lock.current || unavailable) return;
    const form = event.currentTarget,
      data = new FormData(form),
      passphrase = String(data.get("backup_phrase") ?? ""),
      client = getSupabaseClient();
    const organization = fleet.snapshot.organization;
    lock.current = true;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy(true);
    setError("");
    setProgress("");
    setPreview(null);
    try {
      if (!client)
        throw Error(
          "La empresa necesita conexión para verificar los permisos de la copia.",
        );
      const gateway = new SupabaseCompanyBackup(client, organization);
      if (create) {
        if (passphrase !== data.get("backup_phrase_repeat"))
          throw Error("Las dos frases no coinciden.");
        if (passphrase.length < 12 || passphrase.length > 256)
          throw Error("Usa una frase de entre 12 y 256 caracteres.");
        const backup = await collectCompanyBackup(
          gateway,
          organization.id,
          (text) => {
            if (!signal.aborted) setProgress(text);
          },
          signal,
        );
        setProgress("Cifrando la copia…");
        const text = await encryptCompanyBackup(backup, passphrase),
          access = await gateway.authorize();
        if (signal.aborted) return;
        if (
          !access.active ||
          !access.canManage ||
          access.organizationId !== organization.id ||
          backupRequiredFeatures.some((f) => !access.features[f]) ||
          JSON.stringify(access.coverage) !== JSON.stringify(backup.coverage)
        )
          throw Error(
            "Los permisos han cambiado. La copia no se ha descargado.",
          );
        downloadFile(
          `truckcontrol-empresa-${organization.id}-${backup.exportedAt.slice(0, 10)}.truckcontrol`,
          text,
          "application/json",
        );
        setProgress(
          "Copia cifrada descargada. Compruébala antes de confiar en ella.",
        );
      } else {
        const access = await gateway.authorize();
        if (
          !access.active ||
          !access.canManage ||
          access.organizationId !== organization.id
        )
          throw Error(
            "No tienes permiso para comprobar una copia de esta empresa.",
          );
        const file = data.get("company_backup");
        if (
          !(file instanceof File) ||
          !file.size ||
          file.size > maxEncryptedBackupBytes
        )
          throw Error("Selecciona una copia cifrada de hasta 32 MB.");
        setProgress("Descifrando y comprobando originales…");
        const backup = await decryptCompanyBackup(
          await file.text(),
          passphrase,
          organization.id,
        );
        const current = await gateway.authorize();
        if (signal.aborted) return;
        if (
          !current.active ||
          !current.canManage ||
          current.organizationId !== organization.id
        )
          throw Error("Los permisos han cambiado.");
        if (
          (backup.coverage.documents === "library" &&
            current.coverage.documents !== "library") ||
          (backup.coverage.documents === "invoice-attachments" &&
            current.coverage.documents === "none") ||
          (backup.coverage.invoices && !current.coverage.invoices)
        )
          throw Error(
            "Esta copia requiere permisos de archivo y facturas que tu cuenta no tiene ahora.",
          );
        setPreview(backup);
        setSelectedDocument(backup.documents[0]?.id ?? "");
        setConfirmed(false);
        setProgress("");
      }
      form.reset();
    } catch (e) {
      if (!signal.aborted) {
        setError(errorMessage(e));
        setProgress("");
      }
    } finally {
      lock.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }
  async function recoverOriginal(id: string) {
    if (!preview || !confirmed) return;
    const doc = preview.documents.find((d) => d.id === id),
      file = preview.files.find((f) => f.documentId === id);
    if (!doc || !file) return;
    const client = getSupabaseClient();
    if (!client || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const access = await new SupabaseCompanyBackup(
        client,
        preview.fleet.organization,
      ).authorize();
      if (
        !access.active ||
        !access.canManage ||
        access.organizationId !== preview.fleet.organization.id ||
        (preview.coverage.documents === "library" &&
          access.coverage.documents !== "library") ||
        access.coverage.documents === "none"
      )
        throw Error("Ya no tienes permiso para recuperar este original.");
      if (controller.current?.signal.aborted) return;
      const url = URL.createObjectURL(
          new Blob([decodeBackupBytes(file.base64)], {
            type: doc.content_type,
          }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = doc.name.replace(/[\\/\x00-\x1f]/g, "_");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setPreview(null);
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card settings-card company-backup-card">
        <span className="settings-icon">
          <ShieldCheck size={25} />
        </span>
        <Badge tone="green">Copia cifrada de empresa</Badge>
        <h2>Conserva registros y originales</h2>
        <p>
          Incluye fichas, movimientos, operaciones y los documentos y facturas
          que tu cuenta puede leer. Cada original se comprueba con su huella
          digital.
        </p>
        <p>
          No incluye usuarios, contraseñas, conexiones de proveedores ni todo el
          buzón. No sustituye la copia del servidor. Máximo 20 MB de contenido y
          2.000 documentos.
        </p>
        <form onSubmit={(e) => void run(e, true)}>
          <Field label="Frase para cifrar la copia">
            <input
              type="password"
              name="backup_phrase"
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
              required
              disabled={unavailable}
            />
          </Field>
          <Field label="Repite la frase de la copia">
            <input
              type="password"
              name="backup_phrase_repeat"
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
              required
              disabled={unavailable}
            />
          </Field>
          <small>
            Guarda la frase por separado. TruckControl no la almacena ni puede
            recuperarla.
          </small>
          <Button
            type="submit"
            variant="secondary"
            icon={Download}
            disabled={unavailable}
          >
            Descargar copia cifrada
          </Button>
        </form>
        <form onSubmit={(e) => void run(e, false)}>
          <Field label="Copia cifrada de esta empresa">
            <input
              type="file"
              name="company_backup"
              accept=".truckcontrol,application/json"
              required
              disabled={unavailable}
            />
          </Field>
          <Field label="Frase para abrir la copia">
            <input
              type="password"
              name="backup_phrase"
              minLength={12}
              maxLength={256}
              autoComplete="off"
              required
              disabled={unavailable}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            icon={ArchiveRestore}
            disabled={unavailable}
          >
            Comprobar recuperación
          </Button>
        </form>
        {offline.offline && (
          <p>
            Conecta para verificar tus permisos y preparar o comprobar la copia.
          </p>
        )}
        {progress && <p role="status">{progress}</p>}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
      {preview && (
        <Modal
          title="Comprobación de recuperación"
          onClose={() => setPreview(null)}
        >
          <p>
            <strong>{preview.fleet.organization.name}</strong> ·{" "}
            {new Date(preview.exportedAt).toLocaleString("es-ES")}
          </p>
          <p>
            {preview.fleet.trucks.length} camiones ·{" "}
            {preview.fleet.drivers.length} conductores ·{" "}
            {preview.fleet.entries.length} movimientos ·{" "}
            {preview.operations.length} operaciones · {preview.files.length}{" "}
            originales · {preview.invoices.length} facturas.
          </p>
          <p>
            Los datos se han descifrado y validado en esta ventana. La empresa
            del servidor y los movimientos contables no se han modificado.
          </p>
          <p>
            Archivo incluido:{" "}
            {preview.coverage.documents === "library"
              ? "biblioteca autorizada"
              : preview.coverage.documents === "invoice-attachments"
                ? "solo adjuntos de facturas"
                : "sin documentos"}
            .{" "}
            {preview.coverage.invoices
              ? "Incluye las facturas autorizadas."
              : "No incluye fichas de facturas de correo."}
          </p>
          <Field label="Confirmo que guardaré los originales en un lugar privado">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
          </Field>
          {preview.documents.length > 0 && (
            <>
              <Field label="Original para recuperar">
                <select
                  value={selectedDocument}
                  onChange={(e) => setSelectedDocument(e.target.value)}
                >
                  {preview.documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                variant="secondary"
                icon={Download}
                disabled={!confirmed || busy || !selectedDocument}
                onClick={() => void recoverOriginal(selectedDocument)}
              >
                Recuperar original
              </Button>
            </>
          )}
          <p>
            La restauración de registros en producción requiere un procedimiento
            de mantenimiento. Esta comprobación no reemplaza una restauración
            completa de Supabase.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cerrar comprobación
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
