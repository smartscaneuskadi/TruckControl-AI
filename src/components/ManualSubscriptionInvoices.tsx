import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, FileText, RefreshCw } from "lucide-react";
import { Badge, Button, Empty, Field, Modal } from "./ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  loadManualInvoiceCapabilities,
  loadManualSubscriptionInvoices,
  loadManualSubscriptionTask,
  mutateManualSubscriptionInvoice,
  ManualInvoiceAdminError,
} from "../integrations/supabase/manual-subscription-admin";
import {
  manualInvoiceStates,
  manualReviewReasons,
} from "../domain/manual-subscription-admin";
import type {
  ManualInvoiceAction,
  ManualInvoiceCapabilities,
  ManualSubscriptionPage,
  ManualSubscriptionTask,
} from "../domain/manual-subscription-admin";
import { money } from "../lib/format";
import { ManualFiscalPdfDialog } from "./ManualFiscalPdfDialog";
import { ManualDocumentError, downloadManualFiscalPdf, loadManualDocumentCapabilities } from "../integrations/supabase/manual-fiscal-documents";
import type { ManualDocumentCapabilities } from "../domain/manual-fiscal-documents";
import "../styles/manual-subscription-admin.css";

type Editor = { task: ManualSubscriptionTask; action: ManualInvoiceAction };
function time(value: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function ManualSubscriptionInvoices({ userId, focusTaskId, onClearFocus }: { userId: string; focusTaskId?: string; onClearFocus?(): void }) {
  const client = getSupabaseClient();
  const [page, setPage] = useState<ManualSubscriptionPage | null>(null);
  const [capabilities, setCapabilities] = useState<ManualInvoiceCapabilities | null>(null);
  const [documentCapabilities, setDocumentCapabilities] = useState<ManualDocumentCapabilities | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Editor | null>(null);
  const lock = useRef(false), mounted = useRef(true), generation = useRef(0);
  const downloads = useRef(new Set<string>()), downloadTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const transfer = useRef<AbortController | null>(null);
  const discardDownloads = () => {
    transfer.current?.abort();
    for (const timer of downloadTimers.current) clearTimeout(timer);
    downloadTimers.current.clear();
    for (const url of downloads.current) URL.revokeObjectURL(url);
    downloads.current.clear();
  };

  useEffect(() => {
    mounted.current = true;
    const change = () => {
      generation.current++;
      discardDownloads();
      setDocumentCapabilities(null);
      setOnline(navigator.onLine);
      setPage(null);
      setCapabilities(null);
      setEditing(null);
      setMessage("");
    };
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      mounted.current = false;
      generation.current++;
      discardDownloads();
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    let active = true;
    setPage(null); setCapabilities(null); setDocumentCapabilities(null); setEditing(null);
    setError(""); setLoading(true);
    if (!client || !online) {
      setLoading(false);
      return () => controller.abort();
    }
    void (async () => {
      const available = await loadManualInvoiceCapabilities(client, controller.signal, userId);
      if (!active || !navigator.onLine) return;
      setCapabilities(available);
      if (!available.available) return;
      const next = focusTaskId
        ? { items: [await loadManualSubscriptionTask(client, focusTaskId, controller.signal, userId)], next_cursor: null }
        : await loadManualSubscriptionInvoices(client, cursor, controller.signal, userId);
      if (active && navigator.onLine) setPage(next);
      try {
        const documents = await loadManualDocumentCapabilities(client, userId, controller.signal);
        if (active && navigator.onLine) setDocumentCapabilities(documents);
      } catch (failure) {
        if (active && navigator.onLine && failure instanceof ManualDocumentError && failure.kind === "denied") {
          setPage(null); setCapabilities(null); discardDownloads();
          setError(failure.message);
        }
      }
    })().catch((failure: unknown) => {
      if (active) {
        setPage(null); setCapabilities(null);
        setError(failure instanceof Error && failure.name !== "ZodError"
          ? failure.message : "No se puede comprobar el registro de facturas. Actualiza antes de continuar.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [client, cursor, revision, online, userId, focusTaskId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !editing || editing.action === "register_invoice" || !online || lock.current) return;
    const form = new FormData(event.currentTarget);
    if (form.get("confirmed") !== "on") return;
    const selected = editing;
    const currentGeneration = generation.current;
    let input: unknown;
    if (selected.action === "validate_buyer") input = {
      company_name: String(form.get("company_name") ?? ""),
      tax_id: String(form.get("tax_id") ?? ""),
      address: String(form.get("address") ?? ""),
      email: String(form.get("email") ?? ""),
      evidence_reference: String(form.get("evidence_reference") ?? ""),
    };
    else if (selected.action === "report_sent") {
      const sent = new Date(String(form.get("sent_at") ?? ""));
      if (!Number.isFinite(sent.getTime())) { setError("Indica la fecha y hora reales del envío."); return; }
      input = { sent_at: sent.toISOString(), recipient: String(form.get("recipient") ?? ""), reference: String(form.get("reference") ?? "") };
    } else input = { reason: String(form.get("reason") ?? "") };
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const next = await mutateManualSubscriptionInvoice(client, selected.task, selected.action, input, crypto.randomUUID(), userId);
      if (!mounted.current || !navigator.onLine || generation.current !== currentGeneration) return;
      setPage((current) => current ? { ...current, items: current.items.map((row) => row.id === next.id ? next : row) } : null);
      setEditing(null);
      setMessage(selected.action === "validate_buyer"
        ? "Datos fiscales contrastados y validación registrada."
        : selected.action === "report_sent"
          ? "Envío declarado por el operador. La recepción por el destinatario sigue sin acreditarse."
          : "Incidencia registrada para revisión. La solicitud se conserva.");
    } catch (failure) {
      if (mounted.current && generation.current === currentGeneration) {
        setPage(null); setEditing(null);
        if (failure instanceof ManualInvoiceAdminError && failure.permissionDenied) { setDocumentCapabilities(null); discardDownloads(); }
        setError(failure instanceof Error && failure.name !== "ZodError"
          ? failure.message : "Revisa los datos. No se ha podido confirmar la operación.");
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function download(task: ManualSubscriptionTask) {
    if (!client || lock.current || !online || !documentCapabilities?.downloads_ready) return;
    const epoch = generation.current, controller = new AbortController();
    transfer.current = controller; lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const blob = await downloadManualFiscalPdf(client, task, userId, controller.signal);
      if (!mounted.current || generation.current !== epoch || !navigator.onLine) return;
      const url = URL.createObjectURL(blob);
      downloads.current.add(url);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "factura-fiscal.pdf"; anchor.rel = "noopener";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url); downloads.current.delete(url); downloadTimers.current.delete(timer);
      }, 1000);
      downloadTimers.current.add(timer);
    } catch (failure) {
      if (mounted.current && generation.current === epoch) {
        if (failure instanceof ManualDocumentError && failure.kind === "denied") {
          setPage(null); setEditing(null); setDocumentCapabilities(null); discardDownloads();
        }
        setError(failure instanceof ManualDocumentError ? failure.message : "No se ha podido comprobar la descarga del PDF.");
      }
    } finally { lock.current = false; if (mounted.current && generation.current === epoch) setBusy(false); }
  }
  return (
    <section className="card admin-section manual-subscription-admin" aria-label="Facturas del servicio TruckControl">
      <div className="admin-section-heading">
        <div><h2>Facturas del servicio</h2><p>Registro privado de facturación de ELEVADANCOR con GDTaller y TicketBAI.</p></div>
        <Button variant="secondary" icon={RefreshCw} disabled={loading || busy || Boolean(editing) || !online}
          onClick={() => { setCursor(null); setHistory([]); setRevision((value) => value + 1); }}>Actualizar facturas</Button>
      </div>
      {focusTaskId && <div className="inline-actions"><Badge tone="blue">Solicitud fiscal seleccionada</Badge>{onClearFocus && <Button variant="secondary" disabled={busy || Boolean(editing)} onClick={onClearFocus}>Volver a todas las facturas</Button>}</div>}
      <p>Emisor: ELEVADANCOR S.L. · B02993426 · Polígono Arzabalza n.º 50, 20400 Tolosa, Gipuzkoa.</p>
      <p>La emisión fiscal se realiza en GDTaller. El objetivo operativo de envío es de 24–48 horas, sujeto a los plazos legales aplicables.</p>
      {!online && <p role="status">Conéctate para consultar o gestionar estas facturas. Los datos fiscales no se guardan para uso sin conexión.</p>}
      {loading && <p role="status">Comprobando acceso a las facturas…</p>}
      {capabilities && !capabilities.available && <p role="status">El registro de facturación todavía está en preparación.</p>}
      {capabilities?.available && !documentCapabilities?.document_upload_ready && (
        <p className="fiscal-revocation-note">La carga privada del PDF y el registro de emisión siguen pendientes de habilitación. Puedes revisar los datos fiscales y registrar incidencias. Esta pantalla no habilita cobros ni emite facturas.</p>
      )}
      {message && <p role="status" className="access-message">{message}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {page && <>
        <p>{page.items.length} solicitudes en esta página. Cada renovación conserva su propia referencia.</p>
        {!page.items.length && <Empty title="No hay solicitudes de factura">Los pagos confirmados y conciliados aparecerán aquí cuando esté habilitado el circuito de contratación.</Empty>}
        <div className="fiscal-company-grid">
          {page.items.map((task) => (
            <article className="fiscal-company-row" key={task.id} aria-label={"Factura de " + task.buyer_company_name}>
              <div className="fiscal-company-title"><FileText size={21} aria-hidden="true" /><h3>{task.buyer_company_name}</h3></div>
              <Badge tone={task.status === "needs_review" ? "amber" : task.status === "sent_reported" ? "blue" : "neutral"}>{manualInvoiceStates[task.status]}</Badge>
              <dl>
                <dt>Comprador</dt><dd>{task.buyer_tax_id} · {task.buyer_address}</dd>
                <dt>Correo de facturación</dt><dd>{task.buyer_email}</dd>
                <dt>Total abonado</dt><dd>{money(task.amount_cents)}</dd>
                {task.net_cents !== undefined && task.vat_cents !== undefined && <>
                  <dt>Base e IVA</dt><dd>{money(task.net_cents)} + {money(task.vat_cents)}</dd>
                </>}
                <dt>Pago</dt><dd>{task.provider_payment_id} · {time(task.paid_at)}</dd>
                {task.provider_invoice_id && <><dt>Factura del procesador</dt><dd>{task.provider_invoice_id}</dd></>}
                {task.period_start && task.period_end && <><dt>Período</dt><dd>{time(task.period_start)} — {time(task.period_end)}</dd></>}
                <dt>Datos fiscales</dt><dd>{task.buyer_validated ? "Contrastados por administración" : "Pendientes de contrastar con el soporte de contratación"}</dd>
                {task.invoice && <><dt>Factura fiscal registrada</dt><dd>{task.invoice.invoice_number} · {time(task.invoice.issued_at)}</dd><dt>Referencia TicketBAI declarada</dt><dd>{task.invoice.ticketbai_reference}</dd></>}
                {task.dispatch && <><dt>Envío declarado</dt><dd>{time(task.dispatch.sent_at)} · {task.dispatch.recipient} · {task.dispatch.reference}</dd></>}
                {task.review_reason && <><dt>Incidencia</dt><dd>{manualReviewReasons[task.review_reason]}</dd></>}
              </dl>
              {task.status === "sent_reported" && <p>Declaración del operador; no acredita la recepción del correo.</p>}
              <div className="inline-actions">
                {task.status === "awaiting_issue" && <Button variant="secondary" icon={ClipboardCheck} disabled={busy || !online}
                  onClick={() => { setError(""); setMessage(""); setEditing({ task, action: "validate_buyer" }); }}>{task.buyer_validated ? "Corregir datos fiscales" : "Contrastar datos fiscales"}</Button>}
                {task.status === "awaiting_issue" && <Button variant="secondary"
                  disabled={busy || !online || !task.buyer_validated || !documentCapabilities?.document_upload_ready || !documentCapabilities.downloads_ready}
                  onClick={() => { setError(""); setMessage(""); setEditing({ task, action: "register_invoice" }); }}>
                  {documentCapabilities?.document_upload_ready ? "Adjuntar PDF y registrar factura" : "Registrar factura fiscal · pendiente"}
                </Button>}
                {task.invoice && <Button variant="secondary" disabled={busy || !online || !documentCapabilities?.downloads_ready} onClick={() => void download(task)}>Descargar PDF fiscal</Button>}
                {task.status === "awaiting_send" && <Button variant="secondary" disabled={busy || !online}
                  onClick={() => { setError(""); setMessage(""); setEditing({ task, action: "report_sent" }); }}>Registrar envío realizado</Button>}
                {(task.status === "awaiting_issue" || task.status === "awaiting_send" || task.status === "sent_reported") && <Button variant="ghost" icon={AlertTriangle} disabled={busy || !online}
                  onClick={() => { setError(""); setMessage(""); setEditing({ task, action: "needs_review" }); }}>Registrar incidencia</Button>}
              </div>
            </article>
          ))}
        </div>
        {!focusTaskId && <div className="fiscal-pagination">
          <Button variant="ghost" icon={ChevronLeft} disabled={busy || Boolean(editing) || !history.length || !online}
            onClick={() => { setCursor(history.at(-1) ?? null); setHistory((items) => items.slice(0, -1)); }}>Facturas anteriores</Button>
          <Button variant="secondary" icon={ChevronRight} disabled={busy || Boolean(editing) || !page.next_cursor || !online}
            onClick={() => { setHistory((items) => [...items, cursor]); setCursor(page.next_cursor); }}>Más facturas</Button>
        </div>}
      </>}
      {editing?.action === "register_invoice" && client && <ManualFiscalPdfDialog
        key={userId + ":" + editing.task.id} client={client} task={editing.task} userId={userId}
        onClose={() => setEditing(null)}
        onDenied={() => { setEditing(null); setPage(null); setDocumentCapabilities(null); discardDownloads(); setError("Tu sesión ya no permite gestionar estas facturas."); }}
        onSaved={(next) => {
          setPage((current) => current ? { ...current, items: current.items.map((row) => row.id === next.id ? next : row) } : null);
          setEditing(null); setMessage("Estado fiscal actualizado desde el servidor.");
        }} />}
      {editing && editing.action !== "register_invoice" && <Modal title={editing.action === "validate_buyer" ? "Contrastar comprador de la factura" : editing.action === "report_sent" ? "Registrar envío manual realizado" : "Registrar incidencia de facturación"}
        onClose={() => { if (!busy) setEditing(null); }}>
        <form onSubmit={(event) => void save(event)}>
          <fieldset className="fiscal-fieldset" disabled={busy || !online}>
            <legend>{editing.task.buyer_company_name}</legend>
            {editing.action === "validate_buyer" ? <>
              <p>Contrasta estos datos con el soporte fiscal de la contratación. La validación conserva la evidencia original y registra al operador responsable.</p>
              <Field label="Razón social confirmada"><input name="company_name" minLength={2} maxLength={100} defaultValue={editing.task.buyer_company_name} required /></Field>
              <Field label="NIF/CIF confirmado"><input name="tax_id" minLength={3} maxLength={30} defaultValue={editing.task.buyer_tax_id} required /></Field>
              <Field label="Domicilio fiscal confirmado"><input name="address" minLength={5} maxLength={240} defaultValue={editing.task.buyer_address} required /></Field>
              <Field label="Correo de facturación confirmado"><input name="email" type="email" maxLength={320} defaultValue={editing.task.buyer_email} required /></Field>
              <Field label="Referencia del soporte comprobado"><input name="evidence_reference" minLength={3} maxLength={200} required placeholder="Referencia interna del soporte de contratación" /></Field>
            </> : editing.action === "report_sent" ? <>
              <p>Registra un envío que ya hayas realizado desde el canal aprobado, adjuntando el PDF fiscal válido. Esta declaración no envía correo ni acredita recepción.</p>
              <Field label="Fecha y hora reales del envío"><input name="sent_at" type="datetime-local" required /></Field>
              <Field label="Destinatario"><input name="recipient" type="email" value={editing.task.buyer_email} readOnly required /></Field>
              <Field label="Referencia del envío realizado"><input name="reference" minLength={3} maxLength={200} required /></Field>
            </> : <>
              <Field label="Motivo de revisión"><select name="reason" required>{Object.entries(manualReviewReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <p>La solicitud quedará pendiente de revisión sin borrar ni reescribir las evidencias fiscales.</p>
            </>}
            <label className="check-row"><input name="confirmed" type="checkbox" required />He comprobado los datos y confirmo esta actuación administrativa.</label>
            <div className="modal-actions"><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit">Confirmar y registrar</Button></div>
          </fieldset>
        </form>
      </Modal>}
    </section>
  );
}
