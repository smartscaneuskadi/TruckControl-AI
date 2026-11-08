import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/database.types";
import type { ManualSubscriptionTask } from "../domain/manual-subscription-admin";
import { registerManualInvoiceInputSchema } from "../domain/manual-subscription-admin";
import type { ManualDocumentAck } from "../domain/manual-fiscal-documents";
import { MAX_MANUAL_FISCAL_PDF_BYTES } from "../domain/manual-fiscal-documents";
import { ManualDocumentError, loadManualDocumentCapabilities, uploadManualFiscalPdf } from "../integrations/supabase/manual-fiscal-documents";
import { ManualInvoiceAdminError, loadManualSubscriptionTask, mutateManualSubscriptionInvoice } from "../integrations/supabase/manual-subscription-admin";
import { Button, Field, Modal } from "./ui";

export function ManualFiscalPdfDialog({ client, task: initial, userId, onSaved, onClose, onDenied }: {
  client: SupabaseClient<Database>; task: ManualSubscriptionTask; userId: string;
  onSaved(task: ManualSubscriptionTask): void; onClose(): void; onDenied(): void;
}) {
  const [task, setTask] = useState(initial);
  const [file, setFile] = useState<File | null>(null), [fileKey, setFileKey] = useState(0);
  const [ack, setAck] = useState<ManualDocumentAck | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(""), [fiscalReference, setFiscalReference] = useState(""), [issuedAt, setIssuedAt] = useState("");
  const operation = useRef<string | null>(null), registration = useRef<{ key: string; id: string } | null>(null);
  const mounted = useRef(true), generation = useRef(0), lock = useRef(false), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; pending.current?.abort(); };
  }, [userId, initial.id]);
  const current = (value: number) => mounted.current && generation.current === value && navigator.onLine;
  async function upload() {
    if (!file || lock.current || !navigator.onLine) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    const epoch = generation.current, controller = new AbortController();
    pending.current = controller;
    operation.current ??= crypto.randomUUID();
    try {
      const result = await uploadManualFiscalPdf(client, task, file, operation.current, userId, controller.signal);
      if (!current(epoch)) return;
      setAck(result);
      setMessage("PDF guardado y comprobado. Revisa sus referencias fiscales antes de registrar la emisión.");
    } catch (failure) {
      if (!current(epoch)) return;
      if (failure instanceof ManualDocumentError && failure.kind === "denied") { onDenied(); return; }
      setError(failure instanceof ManualDocumentError ? failure.message : "No se ha podido confirmar la carga. Puedes comprobar el estado o repetir expresamente el mismo intento.");
    } finally { lock.current = false; if (current(epoch)) setBusy(false); }
  }
  async function refresh() {
    if (lock.current || !navigator.onLine) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    const epoch = generation.current, controller = new AbortController();
    pending.current = controller;
    try {
      const next = await loadManualSubscriptionTask(client, task.id, controller.signal);
      if (!current(epoch)) return;
      if (next.status !== "awaiting_issue") { onSaved(next); return; }
      if (next.row_version !== task.row_version) {
        setFile(null); setAck(null); setConfirmed(false); setFileKey((value) => value + 1);
        operation.current = null; registration.current = null;
        setMessage("Los datos han cambiado. Revisa el comprador y selecciona de nuevo el PDF que corresponda.");
      } else setMessage("Estado comprobado. Puedes continuar o repetir expresamente el mismo intento.");
      setTask(next);
    } catch (failure) {
      if (current(epoch) && failure instanceof ManualInvoiceAdminError && failure.permissionDenied) { onDenied(); return; }
      if (current(epoch)) setError("No se puede comprobar el estado. Mantén esta ventana y vuelve a comprobarlo al conectar.");
    } finally { lock.current = false; if (current(epoch)) setBusy(false); }
  }
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ack || lock.current || !navigator.onLine) return;
    if (!confirmed) return;
    const date = new Date(issuedAt);
    const input = registerManualInvoiceInputSchema.safeParse({
      invoice_number: invoiceNumber, ticketbai_reference: fiscalReference,
      issued_at: Number.isFinite(date.getTime()) ? date.toISOString() : "",
      pdf_object_key: ack.document.object_key, pdf_sha256: ack.document.sha256,
    });
    if (!input.success) { setError("Revisa el número, referencia y fecha reales de la factura emitida en GDTaller."); return; }
    const intent = JSON.stringify({ expected: task.row_version, data: input.data });
    if (registration.current?.key !== intent) registration.current = { key: intent, id: crypto.randomUUID() };
    const epoch = generation.current, controller = new AbortController();
    pending.current = controller;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const ready = await loadManualDocumentCapabilities(client, userId, controller.signal);
      if (!current(epoch)) return;
      if (!ready.available || !ready.document_upload_ready || !ready.downloads_ready) throw new ManualDocumentError("unavailable");
      const next = await mutateManualSubscriptionInvoice(client, task, "register_invoice", input.data, registration.current.id);
      if (current(epoch)) onSaved(next);
    } catch (failure) {
      if (current(epoch) && ((failure instanceof ManualInvoiceAdminError && failure.permissionDenied) || (failure instanceof ManualDocumentError && failure.kind === "denied"))) { onDenied(); return; }
      if (current(epoch)) setError("No se ha podido confirmar el registro de emisión. Conservamos los campos y el PDF comprobado. Comprueba el estado antes de volver a registrar.");
    } finally { lock.current = false; if (current(epoch)) setBusy(false); }
  }
  return (
    <Modal title="PDF y factura fiscal de GDTaller" onClose={() => { if (!busy) onClose(); }}>
      <p><strong>{task.buyer_company_name}</strong> · {task.buyer_tax_id}</p>
      <p>Adjunta el PDF fiscal que ya has emitido y comprobado en GDTaller. La integridad del archivo no certifica TicketBAI ni su envío.</p>
      <fieldset className="fiscal-fieldset" disabled={busy}>
        <legend>Documento privado de esta solicitud</legend>
        <Field label="PDF fiscal emitido (máximo 10 MiB)">
          <input key={fileKey} type="file" accept="application/pdf,.pdf" disabled={busy || Boolean(ack)}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setAck(null); setConfirmed(false); setError(""); setMessage(""); operation.current = null; registration.current = null;
              if (selected && (selected.type !== "application/pdf" || selected.size < 8 || selected.size > MAX_MANUAL_FISCAL_PDF_BYTES)) {
                setFile(null); setError("Selecciona un PDF de hasta 10 MiB."); return;
              }
              setFile(selected);
            }} />
        </Field>
        {file && <p>{file.name} · {(file.size / 1024).toFixed(1)} KiB</p>}
        <div className="inline-actions">
          <Button variant="secondary" disabled={!file || Boolean(ack)} onClick={() => void upload()}>Guardar y comprobar PDF privado</Button>
          {ack && <Button variant="ghost" onClick={() => {
            setAck(null); setFile(null); setConfirmed(false); setFileKey((value) => value + 1);
            operation.current = null; registration.current = null; setMessage(""); setError("");
          }}>Seleccionar otro PDF</Button>}
          <Button variant="ghost" onClick={() => void refresh()}>Comprobar estado de la solicitud</Button>
        </div>
      </fieldset>
      <form onSubmit={(event) => void register(event)}>
        <fieldset className="fiscal-fieldset" disabled={busy}>
          <legend>Referencia de la emisión manual</legend>
          <Field label="Número y serie de la factura fiscal"><input required maxLength={200} value={invoiceNumber} onChange={(event) => { setInvoiceNumber(event.target.value); setConfirmed(false); }} /></Field>
          <Field label="Referencia TicketBAI de la factura emitida"><input required maxLength={200} value={fiscalReference} onChange={(event) => { setFiscalReference(event.target.value); setConfirmed(false); }} /></Field>
          <Field label="Fecha y hora de emisión (hora local)"><input type="datetime-local" required value={issuedAt} onChange={(event) => { setIssuedAt(event.target.value); setConfirmed(false); }} /></Field>
          <label className="check-row"><input name="confirmed" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />He comprobado que el PDF y sus referencias corresponden a la factura fiscal emitida para este comprador.</label>
          <p>Registrar la emisión conserva su evidencia y deja el envío pendiente. La licencia y los cobros no cambian.</p>
          <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!ack}>Registrar factura emitida</Button></div>
        </fieldset>
      </form>
      {message && <p role="status" className="access-message">{message}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </Modal>
  );
}
