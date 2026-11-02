import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { errorMessage, useFleet } from "../app/FleetProvider";
import {
  clearDemoDocuments,
  listDemoDocuments,
  saveDemoDocument,
  updateDemoDocument,
} from "../data/demo-documents";
import {
  DocumentRegister,
  DocumentTrackingFields,
  readDocumentTracking,
} from "./DocumentRegister";
import { useDocuments } from "../app/DocumentsProvider";
import type { DemoDocument } from "../data/demo-documents";
import { Button, Empty, Modal } from "./ui";

export function DemoDocuments() {
  const { snapshot, notify } = useFleet();
  const register = useDocuments();
  const [documents, setDocuments] = useState<DemoDocument[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [clear, setClear] = useState(false);
  useEffect(() => {
    let active = true;
    void listDemoDocuments(snapshot.organization.id)
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [snapshot.organization.id, revision]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      data = new FormData(form),
      file = data.get("document");
    if (
      !(file instanceof File) ||
      !file.size ||
      data.get("fictitious") !== "on"
    )
      return;
    setBusy(true);
    setError("");
    try {
      await saveDemoDocument(
        snapshot.organization.id,
        file,
        String(data.get("truck") || ""),
        String(data.get("driver") || ""),
        readDocumentTracking(data),
      );
      form.reset();
      setRevision((n) => n + 1);
      await register.refresh();
      notify("Documento ficticio guardado en este navegador.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="card integration-card document-upload" onSubmit={upload}>
        <fieldset className="operation-fieldset" disabled={busy}>
          <h2>
            <FileUp size={23} /> Probar la biblioteca documental
          </h2>
          <p>
            Los archivos de demostración se guardan únicamente en este
            navegador, sin cifrado y sin enviarse a servidores ni a IA. Utiliza
            solo documentos ficticios. Se pueden perder al borrar los datos del
            navegador.
          </p>
          <div className="integration-fields">
            <label>
              Documento PDF o imagen
              <input
                type="file"
                name="document"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
            </label>
            <label>
              Camión de demostración
              <select name="truck" aria-label="Camión de demostración">
                <option value="">Sin vincular</option>
                {snapshot.trucks.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.plate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Conductor de demostración
              <select name="driver" aria-label="Conductor de demostración">
                <option value="">Sin vincular</option>
                {snapshot.drivers.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-field">
            <input type="checkbox" name="fictitious" required /> Confirmo que el
            archivo contiene únicamente datos ficticios.
          </label>
          <DocumentTrackingFields />
          <small>
            PDF, JPG, PNG o WebP. Máximo 10 MB por archivo y 50 MB en esta
            biblioteca de prueba. Cada subida crea un archivo independiente.
          </small>
          <Button type="submit" icon={FileUp}>
            {busy ? "Guardando…" : "Guardar documento de prueba"}
          </Button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {documents.length ? (
        <>
          <DocumentRegister
            cloud={false}
            busy={busy}
            documents={documents.map((d) => ({
              id: d.id,
              organization_id: d.organizationId,
              name: d.name,
              object_path: `${d.organizationId}/${d.id}/demo`,
              content_type: d.file.type,
              size_bytes: d.file.size,
              truck_id: d.truckId || null,
              driver_id: d.driverId || null,
              created_at: d.createdAt,
              tracking: d.tracking,
            }))}
            onRefresh={async () => {
              setRevision((n) => n + 1);
              await register.refresh();
            }}
            onSave={async (doc, value) => {
              await updateDemoDocument(
                snapshot.organization.id,
                doc.id,
                value,
                doc.tracking?.row_version ?? 0,
              );
              setRevision((n) => n + 1);
              await register.refresh();
            }}
            onDownload={(doc) => {
              const original = documents.find((d) => d.id === doc.id);
              if (!original) throw Error("Documento no disponible.");
              const url = URL.createObjectURL(original.file),
                link = document.createElement("a");
              link.href = url;
              link.download = doc.name;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          />
          <Button
            variant="secondary"
            icon={Trash2}
            disabled={busy}
            onClick={() => setClear(true)}
          >
            Vaciar biblioteca de prueba
          </Button>
        </>
      ) : (
        <section className="card">
          <Empty title="Sin documentos de prueba">
            Sube un archivo ficticio para probar su asignación y descarga.
          </Empty>
        </section>
      )}
      {clear && (
        <Modal
          title="¿Vaciar la biblioteca de prueba?"
          onClose={() => {
            if (!busy) setClear(false);
          }}
        >
          <p>
            Se eliminarán los {documents.length} archivos ficticios de esta
            biblioteca del navegador. Las fichas y los documentos de empresas no
            se modifican.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setClear(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void clearDemoDocuments(snapshot.organization.id)
                  .then(async () => {
                    setClear(false);
                    setRevision((n) => n + 1);
                    await register.refresh();
                  })
                  .catch((e) => setError(errorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Confirmar vaciado
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
