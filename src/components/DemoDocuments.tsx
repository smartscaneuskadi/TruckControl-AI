import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Download, FileCheck2, FileUp, Trash2 } from "lucide-react";
import { errorMessage, useFleet } from "../app/FleetProvider";
import {
  clearDemoDocuments,
  listDemoDocuments,
  saveDemoDocument,
} from "../data/demo-documents";
import type { DemoDocument } from "../data/demo-documents";
import { Badge, Button, Empty, Modal } from "./ui";

export function DemoDocuments() {
  const { snapshot, notify } = useFleet();
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
      );
      form.reset();
      setRevision((n) => n + 1);
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
          <div className="document-grid">
            {documents.map((doc) => (
              <article className="card document-card" key={doc.id}>
                <FileCheck2 size={25} />
                <Badge tone="blue">Solo en este navegador</Badge>
                <h2>{doc.name}</h2>
                <p>
                  {(doc.file.size / 1024).toFixed(1)} KB ·{" "}
                  {new Date(doc.createdAt).toLocaleDateString("es-ES")}
                </p>
                <p>
                  {snapshot.trucks.find((t) => t.id === doc.truckId)?.plate ??
                    "Sin camión asignado"}
                  {doc.driverId
                    ? ` · ${snapshot.drivers.find((d) => d.id === doc.driverId)?.name ?? "Conductor"}`
                    : ""}
                </p>
                <Button
                  variant="secondary"
                  icon={Download}
                  onClick={() => {
                    const url = URL.createObjectURL(doc.file),
                      link = document.createElement("a");
                    link.href = url;
                    link.download = doc.name;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Descargar
                </Button>
              </article>
            ))}
          </div>
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
                  .then(() => {
                    setClear(false);
                    setRevision((n) => n + 1);
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
