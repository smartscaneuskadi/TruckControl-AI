import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { FileUp, Paperclip, Trash2 } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useDocuments } from "../app/DocumentsProvider";
import { errorMessage, useFleet } from "../app/FleetProvider";
import { useOffline } from "../app/OfflineContext";
import { useSubscription } from "../app/SubscriptionContext";
import { sessionExitEvent } from "../app/session-events";
import {
  clearDemoDocuments,
  listDemoDocuments,
  saveDemoDocument,
  updateDemoDocument,
} from "../data/demo-documents";
import {
  defaultDocumentInput,
  documentCategories,
  documentTrackingInput,
} from "../domain/documents";
import type { DocumentTrackingInput } from "../domain/documents";
import { getSupabaseClient } from "../integrations/supabase/client";
import type { CompanyDocument } from "../integrations/supabase/database.types";
import {
  DocumentUploadError,
  downloadCompanyDocument,
  updateCompanyDocument,
  uploadCompanyDocument,
} from "../integrations/supabase/documents";
import {
  DocumentRegister,
  DocumentTrackingFields,
  readDocumentTracking,
} from "./DocumentRegister";
import { Button, Empty, Modal } from "./ui";
import "../styles/entity-documents.css";

export type DocumentScope = {
  kind: "truck" | "driver" | "finance";
  id: string;
};
type Category = keyof typeof documentCategories;
export interface EntityDocumentsProps {
  scope: DocumentScope;
  defaultCategory?: Category;
  title?: string;
}
type QueueItem = {
  id: string;
  prefix: string;
  name: string;
  size: number;
  file?: File;
  status: "pending" | "uploading" | "saved" | "failed" | "uncertain";
  message?: string;
};

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
function matchesScope(document: CompanyDocument, scope?: DocumentScope) {
  return (
    !scope ||
    (scope.kind === "truck"
      ? document.truck_id === scope.id
      : scope.kind === "driver"
        ? document.driver_id === scope.id
        : document.tracking?.finance_entry_id === scope.id)
  );
}

/** Shared by saved finance movements and vehicle/driver detail screens. */
export function EntityDocuments(props: EntityDocumentsProps) {
  return <DocumentCollection {...props} />;
}
/** The general library uses exactly the same upload and private-file paths. */
export function DocumentLibrary() {
  return <DocumentCollection />;
}

function DocumentCollection({
  scope,
  defaultCategory = "other",
  title,
}: Partial<EntityDocumentsProps>) {
  const company = useCompany(),
    subscription = useSubscription(),
    offline = useOffline();
  const { snapshot } = useFleet(),
    register = useDocuments(),
    online = useOnline();
  const cloud = company.mode === "company";
  const enabled =
    !subscription.enabled ||
    (subscription.features.documents && subscription.access?.active === true);
  const connected = !cloud || (online && !offline.offline);
  const allowed =
    enabled &&
    register.available &&
    connected &&
    (cloud
      ? Boolean(company.user && getSupabaseClient())
      : company.mode === "demo");
  const writable =
    allowed &&
    (!subscription.enabled || subscription.access?.can_write === true);
  const exists =
    !scope ||
    (scope.kind === "truck"
      ? snapshot.trucks.some((row) => row.id === scope.id)
      : scope.kind === "driver"
        ? snapshot.drivers.some((row) => row.id === scope.id)
        : snapshot.entries.some((row) => row.id === scope.id));
  const key = `${register.scopeKey}:${scope?.kind ?? "library"}:${scope?.id ?? ""}:${allowed}:${writable}`;
  if (!enabled)
    return (
      <p className="muted">
        El módulo de documentos está desactivado para esta empresa.
      </p>
    );
  if (!connected)
    return (
      <p className="muted">
        Los adjuntos requieren conexión. Los originales no se guardan en la
        copia sin conexión.
      </p>
    );
  if (!allowed || !exists)
    return (
      <p className="muted">
        Esta ficha documental no está disponible en la cuenta actual.
      </p>
    );
  return (
    <DocumentCollectionBody
      key={key}
      scope={scope}
      defaultCategory={defaultCategory}
      title={title}
      writable={writable}
    />
  );
}

function DocumentCollectionBody({
  scope,
  defaultCategory,
  title,
  writable,
}: {
  scope?: DocumentScope;
  defaultCategory: Category;
  title?: string;
  writable: boolean;
}) {
  const company = useCompany(),
    { snapshot, notify } = useFleet(),
    register = useDocuments();
  const client = getSupabaseClient(),
    cloud = company.mode === "company",
    organizationId = snapshot.organization.id;
  const [queue, setQueue] = useState<QueueItem[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [clear, setClear] = useState(false);
  const alive = useRef(true),
    lock = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    const stop = () => {
      alive.current = false;
      setQueue([]);
      setClear(false);
      setError("");
    };
    window.addEventListener(sessionExitEvent, stop);
    window.addEventListener("pagehide", stop);
    return () => {
      alive.current = false;
      window.removeEventListener(sessionExitEvent, stop);
      window.removeEventListener("pagehide", stop);
    };
  }, []);
  const current = () => alive.current;
  const documents = register.documents.filter(
    (doc) => doc.organization_id === organizationId && matchesScope(doc, scope),
  );
  const initialTracking: DocumentTrackingInput = {
    ...defaultDocumentInput,
    category: defaultCategory,
  };
  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!writable || lock.current || !current()) return;
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (queue.length + selected.length > 50) {
      setError(
        "Añade hasta 50 archivos por tanda. Retira de la cola los ya guardados para añadir más.",
      );
      return;
    }
    setError("");
    setQueue((rows) => [
      ...rows,
      ...selected.map((file, index) => {
        const id = crypto.randomUUID();
        return {
          id,
          prefix: !rows.length && index === 0 ? "document" : `document_${id}`,
          name: file.name,
          size: file.size,
          file,
          status: "pending" as const,
        };
      }),
    ]);
  }
  async function upload(form: HTMLFormElement, failedOnly = false) {
    if (lock.current || !writable || !current() || !form.reportValidity())
      return;
    const values = new FormData(form);
    if (!cloud && values.get("fictitious") !== "on") return;
    const eligible = queue.filter(
      (row) =>
        row.file &&
        (failedOnly ? row.status === "failed" : row.status === "pending"),
    );
    if (!eligible.length) {
      setError("Selecciona al menos un archivo pendiente.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    let successes = 0;
    try {
      for (const row of eligible) {
        if (!current()) break;
        setQueue((rows) =>
          rows.map((item) =>
            item.id === row.id
              ? { ...item, status: "uploading", message: "" }
              : item,
          ),
        );
        let started = false;
        try {
          const metadata = readDocumentTracking(values, row.prefix);
          const tracking = documentTrackingInput.parse(
            scope?.kind === "finance"
              ? { ...metadata, finance_entry_id: scope.id }
              : metadata,
          );
          const truck = scope
            ? scope.kind === "truck"
              ? scope.id
              : ""
            : String(values.get(`${row.prefix}_truck`) || "");
          const driver = scope
            ? scope.kind === "driver"
              ? scope.id
              : ""
            : String(values.get(`${row.prefix}_driver`) || "");
          if (!current()) break;
          started = true;
          if (cloud) {
            if (!client)
              throw new DocumentUploadError(
                "La conexión documental de la empresa no está disponible.",
                "not_saved",
              );
            await uploadCompanyDocument(
              client,
              organizationId,
              row.file!,
              truck,
              driver,
              tracking,
              current,
              company.user?.id,
            );
          } else
            await saveDemoDocument(
              organizationId,
              row.file!,
              truck,
              driver,
              tracking,
              current,
            );
          if (!current()) break;
          successes++;
          setQueue((rows) =>
            rows.map((item) =>
              item.id === row.id
                ? {
                    ...item,
                    file: undefined,
                    status: "saved",
                    message: "Original guardado. Puedes añadir más archivos.",
                  }
                : item,
            ),
          );
        } catch (failure) {
          if (!current()) break;
          const safe =
            !started ||
            !cloud ||
            (failure instanceof DocumentUploadError &&
              failure.outcome === "not_saved");
          setQueue((rows) =>
            rows.map((item) =>
              item.id === row.id
                ? {
                    ...item,
                    status: safe ? "failed" : "uncertain",
                    message: errorMessage(failure),
                  }
                : item,
            ),
          );
        }
      }
      if (successes && current()) {
        await register.refresh();
        if (current())
          notify(
            cloud
              ? "Documentos guardados. Los originales se conservan."
              : "Documento ficticio guardado en este navegador.",
          );
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void upload(event.currentTarget);
  }
  async function download(doc: CompanyDocument) {
    if (!current() || !documents.some((row) => row.id === doc.id)) return;
    if (cloud) {
      if (!client)
        throw Error("La conexión documental de la empresa no está disponible.");
      return downloadCompanyDocument(
        client,
        doc.object_path,
        doc.name,
        current,
        company.user?.id,
      );
    }
    const original = (await listDemoDocuments(organizationId)).find(
      (row) => row.id === doc.id,
    );
    if (!current()) return;
    if (!original) throw Error("Documento no disponible.");
    const url = URL.createObjectURL(original.file),
      link = document.createElement("a");
    link.href = url;
    link.download = original.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save(doc: CompanyDocument, tracking: DocumentTrackingInput) {
    if (!writable || !current() || !documents.some((row) => row.id === doc.id))
      return;
    if (cloud) {
      if (!client)
        throw Error("La conexión documental de la empresa no está disponible.");
      await updateCompanyDocument(
        client,
        organizationId,
        doc.id,
        tracking,
        doc.tracking?.row_version ?? 0,
        current,
        company.user?.id,
      );
    } else
      await updateDemoDocument(
        organizationId,
        doc.id,
        tracking,
        doc.tracking?.row_version ?? 0,
        current,
      );
    if (current()) await register.refresh();
  }
  const pending = queue.some((row) => row.status === "pending"),
    failed = queue.some((row) => row.status === "failed");
  return (
    <section
      className="entity-documents"
      aria-label={title ?? "Documentos adjuntos"}
    >
      {scope && (
        <div className="detail-section-heading">
          <h3>
            <Paperclip size={18} aria-hidden="true" />{" "}
            {title ?? "Documentos adjuntos"}
          </h3>
          <span>{documents.length} archivos</span>
        </div>
      )}
      {writable ? (
        <form
          className="card integration-card document-upload entity-document-upload"
          onSubmit={submit}
        >
          <fieldset className="operation-fieldset" disabled={busy}>
            <h2>
              <FileUp size={23} aria-hidden="true" />{" "}
              {cloud ? "Añadir documentos" : "Probar la biblioteca documental"}
            </h2>
            {!cloud && (
              <p>
                Los archivos de demostración se guardan únicamente en este
                navegador, sin cifrado y sin enviarse a servidores ni a IA.
                Utiliza solo documentos ficticios. Se pueden perder al borrar
                los datos del navegador.
              </p>
            )}
            <label className="entity-document-picker">
              Documento PDF o imagen
              <input
                type="file"
                name="document"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={addFiles}
              />
            </label>
            <p className="small-text muted">
              PDF, JPG, PNG o WebP. Máximo 10 MB por archivo. Cada subida
              conserva un original independiente, aunque tenga el mismo nombre.
            </p>
            {!cloud && (
              <label className="check-field">
                <input type="checkbox" name="fictitious" required /> Confirmo
                que el archivo contiene únicamente datos ficticios.
              </label>
            )}
            <div
              className="document-upload-queue"
              role="group"
              aria-label="Archivos seleccionados"
            >
              {queue.map((row, index) => (
                <fieldset
                  className={`document-upload-item status-${row.status}`}
                  key={row.id}
                  disabled={
                    busy || row.status === "saved" || row.status === "uncertain"
                  }
                >
                  <legend>
                    {index + 1}. {row.name}
                  </legend>
                  <div className="document-upload-item-heading">
                    <span>{(row.size / 1024).toFixed(1)} KB</span>
                    <strong>
                      {row.status === "saved"
                        ? "Guardado"
                        : row.status === "uncertain"
                          ? "Sin confirmar · no repetir"
                          : row.status === "failed"
                            ? "No guardado"
                            : row.status === "uploading"
                              ? "Guardando…"
                              : "Pendiente"}
                    </strong>
                  </div>
                  <DocumentTrackingFields
                    value={initialTracking}
                    prefix={row.prefix}
                  />
                  {!scope && (
                    <div className="integration-fields">
                      <label>
                        {cloud ? "Camión" : "Camión de demostración"}
                        <select name={`${row.prefix}_truck`}>
                          <option value="">Sin vincular</option>
                          {snapshot.trucks.map((truck) => (
                            <option key={truck.id} value={truck.id}>
                              {truck.plate}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {cloud ? "Conductor" : "Conductor de demostración"}
                        <select name={`${row.prefix}_driver`}>
                          <option value="">Sin vincular</option>
                          {snapshot.drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  {row.message && (
                    <p
                      className={
                        row.status === "failed" || row.status === "uncertain"
                          ? "form-error"
                          : "muted"
                      }
                      role={
                        row.status === "failed" || row.status === "uncertain"
                          ? "alert"
                          : "status"
                      }
                    >
                      {row.message}
                    </p>
                  )}
                  {(row.status === "pending" || row.status === "failed") && (
                    <Button
                      variant="ghost"
                      icon={Trash2}
                      onClick={() =>
                        setQueue((rows) =>
                          rows.filter((item) => item.id !== row.id),
                        )
                      }
                    >
                      Retirar de la cola
                    </Button>
                  )}
                </fieldset>
              ))}
            </div>
            <div className="access-links document-upload-actions">
              <Button type="submit" icon={FileUp} disabled={!pending}>
                {busy
                  ? "Guardando…"
                  : cloud
                    ? queue.length > 1
                      ? "Guardar documentos"
                      : "Guardar documento"
                    : "Guardar documento de prueba"}
              </Button>
              {failed && (
                <Button
                  variant="secondary"
                  onClick={(event) => {
                    if (event.currentTarget.form)
                      void upload(event.currentTarget.form, true);
                  }}
                >
                  Reintentar archivos fallidos
                </Button>
              )}
              {queue.some((row) => row.status === "saved") && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setQueue((rows) =>
                      rows.filter((row) => row.status !== "saved"),
                    )
                  }
                >
                  Retirar guardados de la cola
                </Button>
              )}
            </div>
            {!cloud && (
              <small>
                Máximo 50 MB en esta biblioteca de prueba. Retirar de la cola no
                elimina los originales guardados.
              </small>
            )}
          </fieldset>
        </form>
      ) : (
        <p className="muted">
          Tu cuenta puede consultar y descargar los documentos, pero no
          modificarlos.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {register.loading ? (
        <p role="status">Cargando documentos…</p>
      ) : !documents.length && !cloud ? (
        <div className="card">
          <Empty title="Sin documentos de prueba">
            Sube un archivo ficticio para probar su asignación y descarga.
          </Empty>
        </div>
      ) : (
        <DocumentRegister
          documents={documents}
          cloud={cloud}
          busy={busy}
          writable={writable}
          onRefresh={register.refresh}
          onDownload={download}
          onSave={save}
        />
      )}
      {register.error && (
        <p className="form-error" role="alert">
          {register.error}
        </p>
      )}
      {!cloud && !scope && documents.length > 0 && (
        <Button
          variant="secondary"
          icon={Trash2}
          disabled={busy}
          onClick={() => setClear(true)}
        >
          Vaciar biblioteca de prueba
        </Button>
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
                if (!current() || lock.current) return;
                lock.current = true;
                setBusy(true);
                setError("");
                void clearDemoDocuments(organizationId, current)
                  .then(async () => {
                    if (current()) {
                      setClear(false);
                      await register.refresh();
                    }
                  })
                  .catch((failure) => {
                    if (current()) setError(errorMessage(failure));
                  })
                  .finally(() => {
                    lock.current = false;
                    if (current()) setBusy(false);
                  });
              }}
            >
              Confirmar vaciado
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
