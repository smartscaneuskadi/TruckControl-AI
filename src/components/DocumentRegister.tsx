import { useState } from "react";
import type { FormEvent } from "react";
import { Download, FileCheck2, Pencil, RefreshCw } from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { Badge, Button, Empty, Modal, Pagination, SearchField } from "./ui";
import {
  defaultDocumentTracking,
  documentCategories,
  documentState,
  documentStateLabels,
  documentTrackingInput,
  filterDocuments,
} from "../domain/documents";
import type {
  DocumentTracking,
  DocumentTrackingInput,
} from "../domain/documents";
import type { CompanyDocument } from "../integrations/supabase/database.types";
import { useCurrentDay } from "../lib/use-current-day";
import { date } from "../lib/format";
import { exportCsv } from "../lib/export";

export function readDocumentTracking(data: FormData): DocumentTrackingInput {
  return documentTrackingInput.parse({
    category: String(data.get("document_category") || "other"),
    status: String(data.get("document_status") || "active"),
    expires_on: String(data.get("document_expires_on") || "") || null,
    remind_days: Number(data.get("document_remind_days") ?? 30),
  });
}
export function DocumentTrackingFields({
  value = defaultDocumentTracking,
  editableStatus = false,
}: {
  value?: DocumentTracking;
  editableStatus?: boolean;
}) {
  return (
    <div className="integration-fields">
      <label>
        Tipo de documento
        <select
          aria-label="Tipo de documento"
          name="document_category"
          defaultValue={value.category}
        >
          {Object.entries(documentCategories).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fecha de vencimiento (opcional)
        <input
          name="document_expires_on"
          type="date"
          defaultValue={value.expires_on ?? ""}
        />
      </label>
      <label>
        Avisar con días de antelación
        <input
          name="document_remind_days"
          type="number"
          required
          min={0}
          max={365}
          step={1}
          defaultValue={value.remind_days}
        />
      </label>
      {editableStatus && (
        <label>
          Estado del documento
          <select
            aria-label="Estado del documento"
            name="document_status"
            defaultValue={value.status}
          >
            <option value="active">Activo</option>
            <option value="archived">Archivado · conservar original</option>
          </select>
        </label>
      )}
    </div>
  );
}
export function DocumentRegister({
  documents,
  cloud,
  busy = false,
  writable = true,
  onDownload,
  onSave,
  onRefresh,
}: {
  documents: CompanyDocument[];
  cloud: boolean;
  busy?: boolean;
  writable?: boolean;
  onDownload(d: CompanyDocument): Promise<void> | void;
  onSave(d: CompanyDocument, value: DocumentTrackingInput): Promise<void>;
  onRefresh(): Promise<void> | void;
}) {
  const { snapshot, notify } = useFleet(),
    day = useCurrentDay();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("active"),
    [category, setCategory] = useState("all"),
    [truck, setTruck] = useState("");
  const [page, setPage] = useState(1),
    [editor, setEditor] = useState<CompanyDocument | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const rows = filterDocuments(documents, day, search, status, category)
    .filter((d) => !truck || d.truck_id === truck)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor || saving || !writable) return;
    const form = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      await onSave(editor, readDocumentTracking(form));
      setEditor(null);
      notify("Ficha documental actualizada. El original se conserva.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function action(fn: () => Promise<void> | void) {
    if (saving || busy) return;
    setSaving(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <section className="card operation-register">
        <div className="table-toolbar">
          <div>
            <h2>Archivo y vencimientos</h2>
            <p>
              Los avisos aparecen dentro de la app. Archivar conserva el
              original y retira sus avisos.
            </p>
          </div>
          <div className="access-links">
            <Button
              variant="secondary"
              icon={RefreshCw}
              disabled={busy || saving}
              onClick={() => void action(onRefresh)}
            >
              Actualizar archivo
            </Button>
            <Button
              variant="secondary"
              icon={Download}
              disabled={busy || saving || !rows.length}
              onClick={() =>
                exportCsv("truckcontrol-documentos.csv", [
                  [
                    "Documento",
                    "Tipo",
                    "Estado",
                    "Vencimiento",
                    "Avisar días antes",
                    "Matrícula",
                    "Conductor",
                  ],
                  ...rows.map((d) => [
                    d.name,
                    documentCategories[d.tracking?.category ?? "other"],
                    documentStateLabels[documentState(d, day)],
                    d.tracking?.expires_on ?? "",
                    d.tracking?.remind_days ?? 30,
                    snapshot.trucks.find((t) => t.id === d.truck_id)?.plate ??
                      "",
                    snapshot.drivers.find((r) => r.id === d.driver_id)?.name ??
                      "",
                  ]),
                ])
              }
            >
              Exportar documentos
            </Button>
          </div>
        </div>
        <div className="list-toolbar">
          <SearchField
            label="Buscar documento"
            placeholder="Nombre del documento…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <div className="inline-actions">
            <select
              aria-label="Filtrar estado documental"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="active">Activos</option>
              <option value="all">Todos</option>
              {Object.entries(documentStateLabels).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar tipo documental"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos los tipos</option>
              {Object.entries(documentCategories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar camión documental"
              value={truck}
              onChange={(e) => {
                setTruck(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los camiones</option>
              {snapshot.trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.plate}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!rows.length && (
          <Empty
            title={
              documents.length
                ? "No hay documentos en este filtro"
                : "Todavía no hay documentos"
            }
          >
            Sube un documento o cambia los filtros para consultar el archivo.
          </Empty>
        )}
        <div className="document-grid">
          {rows.slice((actual - 1) * 12, actual * 12).map((d) => {
            const state = documentState(d, day);
            return (
              <article className="card document-card" key={d.id}>
                <FileCheck2 size={25} />
                <Badge tone={cloud ? "green" : "blue"}>
                  {cloud ? "Privado" : "Solo en este navegador"}
                </Badge>
                <h2>{d.name}</h2>
                <Badge
                  tone={
                    state === "expired"
                      ? "red"
                      : state === "due"
                        ? "amber"
                        : "blue"
                  }
                >
                  {documentStateLabels[state]}
                </Badge>
                <p>
                  {documentCategories[d.tracking?.category ?? "other"]} ·{" "}
                  {(d.size_bytes / 1024).toFixed(1)} KB
                </p>
                <p>
                  {snapshot.trucks.find((t) => t.id === d.truck_id)?.plate ??
                    "Documento de empresa"}
                  {d.driver_id
                    ? ` · ${snapshot.drivers.find((r) => r.id === d.driver_id)?.name ?? "Conductor"}`
                    : ""}
                </p>
                <p>
                  {d.tracking?.expires_on
                    ? `Vencimiento: ${date(d.tracking.expires_on)}`
                    : "Sin fecha de vencimiento"}
                </p>
                <Button
                  variant="secondary"
                  icon={Download}
                  disabled={busy || saving}
                  onClick={() => void action(() => onDownload(d))}
                >
                  Descargar
                </Button>
                {writable && (
                  <Button
                    variant="secondary"
                    icon={Pencil}
                    disabled={busy || saving}
                    onClick={() => {
                      setError("");
                      setEditor(d);
                    }}
                  >
                    Ficha y vencimiento
                  </Button>
                )}
              </article>
            );
          })}
        </div>
        <Pagination
          total={rows.length}
          page={actual}
          pageSize={12}
          onChange={setPage}
        />
      </section>
      {error && !editor && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editor && (
        <Modal
          title={`Ficha documental · ${editor.name}`}
          subtitle="El archivo original se conserva. Los cambios se comprueban antes de guardarlos."
          onClose={() => {
            if (!saving) setEditor(null);
          }}
        >
          <form onSubmit={save}>
            <fieldset className="operation-fieldset" disabled={saving}>
              <DocumentTrackingFields
                value={editor.tracking ?? defaultDocumentTracking}
                editableStatus
              />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="access-links">
                <Button variant="secondary" onClick={() => setEditor(null)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {saving ? "Guardando…" : "Guardar ficha documental"}
                </Button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </>
  );
}
