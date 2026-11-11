import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  RefreshCw,
} from "lucide-react";
import { Badge, Button, Empty, Field, Modal } from "./ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  createSubscriptionIncidentClient,
  SubscriptionIncidentError,
} from "../integrations/supabase/subscription-incidents";
import type { SubscriptionIncidentClient } from "../integrations/supabase/subscription-incidents";
import {
  incidentExtentLabels,
  incidentInput,
} from "../domain/subscription-incidents";
import type {
  IncidentAction,
  IncidentHistory,
  IncidentInput,
  IncidentPage,
  SubscriptionIncident,
} from "../domain/subscription-incidents";
import { money } from "../lib/format";
import "../styles/subscription-incidents.css";

function date(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
const failureMessage = (failure: unknown) =>
  failure instanceof SubscriptionIncidentError
    ? failure.message
    : "No se ha podido comprobar el registro. Actualiza antes de continuar.";
type Intent = {
  before: SubscriptionIncident;
  action: IncidentAction;
  input: IncidentInput;
  operationId: string;
};
type Editor = { before: SubscriptionIncident; action: IncidentAction };

export function SubscriptionIncidents({
  userId,
  onOpenTask,
}: {
  userId: string;
  onOpenTask(taskId: string): void;
}) {
  const client = getSupabaseClient();
  const [epoch, setEpoch] = useState(0),
    [online, setOnline] = useState(navigator.onLine);
  const token = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    token.current = undefined;
    let active = true;
    const reset = () => {
      if (!active) return;
      setEpoch((n) => n + 1);
      setOnline(navigator.onLine);
    };
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const next = session?.user.id === userId ? session.access_token : null;
      if (
        _event === "SIGNED_OUT" ||
        (token.current !== undefined && token.current !== next)
      )
        reset();
      token.current = next;
    });
    window.addEventListener("online", reset);
    window.addEventListener("offline", reset);
    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
      token.current = undefined;
      window.removeEventListener("online", reset);
      window.removeEventListener("offline", reset);
    };
  }, [client, userId]);
  return (
    <IncidentPanel
      key={userId + ":" + epoch + ":" + online}
      userId={userId}
      online={online}
      onOpenTask={onOpenTask}
    />
  );
}
function IncidentPanel({
  userId,
  online,
  onOpenTask,
}: {
  userId: string;
  online: boolean;
  onOpenTask(taskId: string): void;
}) {
  const client = getSupabaseClient();
  const [page, setPage] = useState<IncidentPage | null>(null),
    [available, setAvailable] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]);
  const [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [detail, setDetail] = useState<SubscriptionIncident | null>(null),
    [history, setHistory] = useState<IncidentHistory | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null),
    [uncertain, setUncertain] = useState(false);
  const api = useRef<SubscriptionIncidentClient | null>(null),
    pending = useRef<Intent | null>(null);
  const generation = useRef(0),
    lock = useRef(false),
    lifetime = useRef<AbortController | null>(null);
  function clear(failure: unknown) {
    pending.current = null;
    setEditor(null);
    setUncertain(false);
    setDetail(null);
    setHistory(null);
    setPage(null);
    setAvailable(false);
    setMessage("");
    setError(failureMessage(failure));
  }
  useEffect(() => {
    const controller = new AbortController(),
      current = ++generation.current;
    lifetime.current = controller;
    setPage(null);
    setAvailable(false);
    setDetail(null);
    setHistory(null);
    setEditor(null);
    pending.current = null;
    setUncertain(false);
    setError("");
    setMessage("");
    setLoading(true);
    if (!client || !online) {
      setLoading(false);
      return () => controller.abort();
    }
    void (async () => {
      const scope = await createSubscriptionIncidentClient(
        client,
        userId,
        controller.signal,
      );
      if (controller.signal.aborted || current !== generation.current) {
        scope.close();
        return;
      }
      api.current = scope;
      const capabilities = await scope.capabilities(controller.signal);
      if (controller.signal.aborted || current !== generation.current) return;
      setAvailable(capabilities.available);
      if (capabilities.available) {
        const result = await scope.list(cursor, controller.signal);
        if (!controller.signal.aborted && current === generation.current)
          setPage(result);
      }
    })()
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && current === generation.current)
          clear(failure);
      })
      .finally(() => {
        if (!controller.signal.aborted && current === generation.current)
          setLoading(false);
      });
    return () => {
      generation.current++;
      controller.abort();
      api.current?.close();
      api.current = null;
      pending.current = null;
    };
  }, [client, userId, online, cursor, reload]);

  async function open(item: SubscriptionIncident) {
    if (!api.current || lock.current || !available || !online) return;
    const current = generation.current,
      scope = api.current,
      signal = lifetime.current?.signal;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setDetail(null);
    setHistory(null);
    try {
      const fresh = await scope.detail(item.id, signal),
        entries = await scope.history(item.id, null, signal);
      if (
        signal?.aborted ||
        generation.current !== current ||
        !navigator.onLine
      )
        return;
      if (
        fresh.task_id !== item.task_id ||
        fresh.buyer_company_id !== item.buyer_company_id
      )
        throw new SubscriptionIncidentError("invalid");
      if (entries.items.some((entry) => entry.row_version > fresh.row_version))
        throw new SubscriptionIncidentError("conflict");
      setDetail(fresh);
      setHistory(entries);
    } catch (failure) {
      if (!signal?.aborted && generation.current === current) clear(failure);
    } finally {
      lock.current = false;
      if (!signal?.aborted && generation.current === current) setBusy(false);
    }
  }
  async function olderHistory() {
    if (
      !api.current ||
      !detail ||
      !history?.next_before_version ||
      lock.current
    )
      return;
    const current = generation.current,
      signal = lifetime.current?.signal;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api.current.history(
        detail.id,
        history.next_before_version,
        signal,
      );
      if (
        !signal?.aborted &&
        generation.current === current &&
        navigator.onLine
      )
        setHistory(next);
    } catch (failure) {
      if (!signal?.aborted && generation.current === current) clear(failure);
    } finally {
      lock.current = false;
      if (!signal?.aborted && generation.current === current) setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !api.current ||
      !editor ||
      lock.current ||
      !online ||
      !navigator.onLine ||
      !available
    )
      return;
    let intent = pending.current;
    if (!intent) {
      const form = new FormData(event.currentTarget);
      if (form.get("confirmed") !== "on") return;
      try {
        const input = incidentInput(
          editor.action,
          editor.action === "review"
            ? { note: String(form.get("note") ?? "") }
            : {
                note: String(form.get("note") ?? ""),
                reference: String(form.get("reference") ?? ""),
              },
        );
        intent = {
          before: editor.before,
          action: editor.action,
          input,
          operationId: crypto.randomUUID(),
        };
        pending.current = intent;
      } catch {
        setError("Comprueba la nota y la referencia de la actuación.");
        return;
      }
    }
    const current = generation.current,
      scope = api.current,
      signal = lifetime.current?.signal,
      attempt = intent;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    let confirmed = false;
    try {
      const result = await scope.mutate(
        attempt.before,
        attempt.action,
        attempt.input,
        attempt.operationId,
        signal,
      );
      if (
        signal?.aborted ||
        current !== generation.current ||
        !navigator.onLine
      )
        return;
      confirmed = true;
      pending.current = null;
      setEditor(null);
      setUncertain(false);
      setDetail(result.case);
      setPage((old) =>
        old
          ? {
              ...old,
              items: old.items.map((row) =>
                row.id === result.case.id ? result.case : row,
              ),
            }
          : null,
      );
      setMessage(
        attempt.action === "review"
          ? "Revisión registrada. Las observaciones posteriores pueden requerir otra valoración."
          : "Referencia externa declarada. La aplicación no ha emitido ni certificado una factura rectificativa.",
      );
      const entries = await scope.history(result.case.id, null, signal);
      if (
        signal?.aborted ||
        current !== generation.current ||
        !navigator.onLine
      )
        return;
      if (
        entries.items.some(
          (entry) => entry.row_version > result.case.row_version,
        )
      ) {
        // Provider facts can arrive after the ACK. Read once; never repeat the
        // declaration or show its old review state beside a newer observation.
        const fresh = await scope.detail(result.case.id, signal);
        if (
          signal?.aborted ||
          current !== generation.current ||
          !navigator.onLine
        )
          return;
        if (
          fresh.task_id !== result.case.task_id ||
          fresh.buyer_company_id !== result.case.buyer_company_id ||
          fresh.provider_payment_id !== result.case.provider_payment_id ||
          fresh.amount_cents !== result.case.amount_cents ||
          entries.items.some((entry) => entry.row_version > fresh.row_version)
        )
          throw new SubscriptionIncidentError("conflict");
        setDetail(fresh);
        setPage((old) =>
          old
            ? {
                ...old,
                items: old.items.map((row) =>
                  row.id === fresh.id ? fresh : row,
                ),
              }
            : null,
        );
        setMessage(
          "La declaración se ha registrado. Las nuevas observaciones del proveedor ya se muestran y requieren su propia valoración.",
        );
      }
      setHistory(entries);
    } catch (failure) {
      if (!signal?.aborted && current === generation.current) {
        if (confirmed) {
          clear(failure);
          if (!(
            failure instanceof SubscriptionIncidentError &&
            (failure.kind === "denied" || failure.kind === "cancelled")
          )) {
            setMessage(
              "La declaración se ha confirmado. Actualiza para comprobar el historial posterior antes de registrar otra actuación.",
            );
          }
        } else if (
          failure instanceof SubscriptionIncidentError &&
          failure.kind === "uncertain"
        ) {
          setUncertain(true);
          setError(failure.message);
        } else clear(failure);
      }
    } finally {
      lock.current = false;
      if (!signal?.aborted && current === generation.current) setBusy(false);
    }
  }
  const ready = available && !loading && !busy && online;
  return (
    <section
      className="card admin-section subscription-incidents"
      aria-label="Incidencias de pagos del servicio"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">SEGUIMIENTO ADMINISTRATIVO</p>
          <h2>Incidencias de pagos</h2>
          <p>
            Hechos del proveedor, revisión humana y referencias fiscales
            externas.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={loading || busy || Boolean(editor) || !online}
          onClick={() => {
            setCursor(null);
            setPrevious([]);
            setReload((n) => n + 1);
          }}
        >
          Actualizar incidencias
        </Button>
      </div>
      <div className="setup-notice">
        <AlertTriangle aria-hidden="true" size={21} />
        <p>
          Este registro no ejecuta reembolsos, no cambia licencias y no emite
          rectificativas. «Pendiente de valoración» requiere una decisión
          humana; no determina por sí solo una obligación fiscal.
        </p>
      </div>
      {!online && (
        <p role="status">
          Conéctate para consultar estas incidencias. No se conservan datos para
          uso sin conexión.
        </p>
      )}
      {loading && (
        <p role="status">Comprobando acceso al registro de incidencias…</p>
      )}
      {!loading && online && !available && !error && (
        <p role="status">
          El registro de incidencias de pago todavía está en preparación.
        </p>
      )}
      {message && (
        <p role="status" className="access-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {page && !detail && (
        <>
          <p>
            {page.items.length} incidencias en esta página. Cada caso
            corresponde a su pago y solicitud de factura.
          </p>
          {!page.items.length && (
            <Empty title="No hay incidencias registradas">
              Los hechos conciliados del proveedor aparecerán cuando esté
              habilitado el circuito.
            </Empty>
          )}
          <div className="incident-grid">
            {page.items.map((item) => (
              <article
                className="incident-card"
                key={item.id}
                aria-label={`Incidencia de ${item.buyer_company_name}`}
              >
                <h3>{item.buyer_company_name}</h3>
                <div className="inline-actions">
                  <Badge
                    tone={item.review_state === "pending" ? "amber" : "blue"}
                  >
                    {item.review_state === "pending"
                      ? "Revisión pendiente"
                      : "Revisión declarada"}
                  </Badge>
                  <Badge
                    tone={
                      item.rectification_state === "pending"
                        ? "neutral"
                        : "blue"
                    }
                  >
                    {item.rectification_state === "pending"
                      ? "Pendiente de valoración fiscal"
                      : "Referencia externa declarada"}
                  </Badge>
                </div>
                <dl>
                  <dt>Pago original</dt>
                  <dd>
                    {money(item.amount_cents, true)} · {date(item.paid_at)}
                  </dd>
                  <dt>Observación</dt>
                  <dd>
                    {item.latest_provider.object_type} ·{" "}
                    {item.latest_provider.current_status}
                  </dd>
                  <dt>Última consulta al proveedor</dt>
                  <dd>{date(item.latest_provider.observed_at)}</dd>
                </dl>
                <Button
                  variant="secondary"
                  icon={History}
                  disabled={!ready}
                  onClick={() => void open(item)}
                >
                  Revisar incidencia
                </Button>
              </article>
            ))}
          </div>
          <div className="fiscal-pagination">
            <Button
              variant="ghost"
              icon={ChevronLeft}
              disabled={!ready || !previous.length}
              onClick={() => {
                setCursor(previous.at(-1) ?? null);
                setPrevious((old) => old.slice(0, -1));
              }}
            >
              Incidencias anteriores
            </Button>
            <Button
              variant="secondary"
              icon={ChevronRight}
              disabled={!ready || !page.next_cursor}
              onClick={() => {
                setPrevious((old) => [...old, cursor]);
                setCursor(page.next_cursor);
              }}
            >
              Más incidencias
            </Button>
          </div>
        </>
      )}
      {detail && (
        <>
          <div className="inline-actions">
            <Button
              variant="ghost"
              icon={ArrowLeft}
              disabled={busy || Boolean(editor)}
              onClick={() => {
                setDetail(null);
                setHistory(null);
                setError("");
              }}
            >
              Volver al listado de incidencias
            </Button>
            <Button
              variant="secondary"
              icon={FileText}
              disabled={!ready || Boolean(editor)}
              onClick={() => onOpenTask(detail.task_id)}
            >
              Ver solicitud fiscal
            </Button>
          </div>
          <article
            className="incident-detail"
            aria-label="Detalle de la incidencia"
          >
            <h3>{detail.buyer_company_name}</h3>
            <dl>
              <dt>Identidad del caso</dt>
              <dd>{detail.id}</dd>
              <dt>Solicitud fiscal</dt>
              <dd>{detail.task_id}</dd>
              <dt>Pago original</dt>
              <dd>
                {detail.provider_payment_id} ·{" "}
                {money(detail.amount_cents, true)}
              </dd>
              {detail.period_start && detail.period_end && (
                <>
                  <dt>Período original</dt>
                  <dd>
                    {date(detail.period_start)} — {date(detail.period_end)}
                  </dd>
                </>
              )}
              <dt>Revisión</dt>
              <dd>
                {detail.review_state === "pending"
                  ? "Pendiente de revisar"
                  : "Declarada por administración"}
              </dd>
              <dt>Valoración fiscal</dt>
              <dd>
                {detail.rectification_state === "pending"
                  ? "Pendiente de valoración humana"
                  : "Referencia externa declarada"}
              </dd>
              {detail.last_review && (
                <>
                  <dt>Última revisión</dt>
                  <dd>
                    {detail.last_review.note} ·{" "}
                    {date(detail.last_review.reported_at)}
                  </dd>
                </>
              )}
              {detail.rectification && (
                <>
                  <dt>Última referencia externa</dt>
                  <dd>
                    {detail.rectification.reference} ·{" "}
                    {detail.rectification.note} ·{" "}
                    {date(detail.rectification.reported_at)}
                  </dd>
                </>
              )}
            </dl>
            <ProviderObservation value={detail.latest_provider} />
            <div className="inline-actions">
              <Button
                variant="secondary"
                icon={ClipboardCheck}
                disabled={!ready || Boolean(editor)}
                onClick={() => {
                  setError("");
                  setEditor({ before: detail, action: "review" });
                }}
              >
                Declarar revisión
              </Button>
              <Button
                variant="secondary"
                icon={FileText}
                disabled={!ready || Boolean(editor)}
                onClick={() => {
                  setError("");
                  setEditor({ before: detail, action: "report_rectification" });
                }}
              >
                Declarar referencia rectificativa
              </Button>
            </div>
          </article>
          {history && (
            <section
              className="incident-history"
              aria-label="Historial inmutable de la incidencia"
            >
              <h3>Historial de observaciones y actuaciones</h3>
              <p>
                {history.items.length} entradas en esta página, ordenadas de más
                reciente a más antigua.
              </p>
              <ol>
                {history.items.map((entry) => (
                  <li key={entry.id}>
                    <h4>
                      Versión {entry.row_version} ·{" "}
                      {entry.kind === "provider"
                        ? "Observación del proveedor"
                        : entry.kind === "review"
                          ? "Revisión declarada"
                          : "Referencia externa declarada"}
                    </h4>
                    <p>{date(entry.created_at)}</p>
                    {entry.provider && (
                      <ProviderObservation value={entry.provider} />
                    )}
                    {entry.note && <p>{entry.note}</p>}
                    {entry.reference && <p>Referencia: {entry.reference}</p>}
                    {entry.actor_id && <p>Operador: {entry.actor_id}</p>}
                  </li>
                ))}
              </ol>
              <Button
                variant="secondary"
                disabled={
                  !ready || !history.next_before_version || Boolean(editor)
                }
                onClick={() => void olderHistory()}
              >
                Entradas anteriores
              </Button>
            </section>
          )}
        </>
      )}
      {editor && (
        <Modal
          title={
            editor.action === "review"
              ? "Declarar revisión de la incidencia"
              : "Declarar referencia rectificativa externa"
          }
          subtitle={editor.before.buyer_company_name}
          onClose={() => {
            if (!busy) {
              pending.current = null;
              setEditor(null);
              setUncertain(false);
              setError("");
            }
          }}
        >
          <form className="access-form" onSubmit={(event) => void save(event)}>
            <p>
              Actuación administrativa sobre la versión{" "}
              {editor.before.row_version}. No realiza operaciones en Stripe ni
              genera un documento fiscal.
            </p>
            {editor.action === "report_rectification" && (
              <Field label="Referencia real emitida en GDTaller">
                <input
                  name="reference"
                  minLength={1}
                  maxLength={200}
                  required
                  disabled={busy || uncertain}
                />
              </Field>
            )}
            <Field label="Nota de la actuación">
              <textarea
                name="note"
                minLength={3}
                maxLength={1000}
                rows={4}
                required
                disabled={busy || uncertain}
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                name="confirmed"
                required
                disabled={busy || uncertain}
              />
              He comprobado los hechos y confirmo esta declaración
              administrativa.
            </label>
            <p>
              La referencia y el historial son declaraciones del operador, no
              una certificación ni una emisión de TicketBAI.
            </p>
            {uncertain && (
              <p role="status">
                El resultado es incierto. Reintentar conserva la misma
                identidad, versión y datos para evitar duplicados. Al cerrar,
                comprueba el historial antes de registrar otra actuación.
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  pending.current = null;
                  setEditor(null);
                  setUncertain(false);
                  setError("");
                }}
              >
                Cerrar declaración
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Comprobando…"
                  : uncertain
                    ? "Reintentar la misma declaración"
                    : "Confirmar declaración"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
function ProviderObservation({
  value,
}: {
  value: SubscriptionIncident["latest_provider"];
}) {
  return (
    <div className="incident-observation">
      <h4>Datos comunicados por el proveedor</h4>
      <p>
        Un reembolso pendiente o fallido no acredita dinero entregado. El
        acumulado del cargo no se suma a las observaciones de reembolso.
      </p>
      <dl>
        <dt>Evento y objeto</dt>
        <dd>
          {value.event_id} · {value.event_type}
          <br />
          {value.object_id}
        </dd>
        <dt>Estado al ocurrir / al consultar</dt>
        <dd>
          {value.status_at_event} / {value.current_status}
        </dd>
        <dt>Importe del evento / actual observado</dt>
        <dd>
          {money(value.event_amount_cents, true)} /{" "}
          {money(value.current_amount_cents, true)}
        </dd>
        <dt>Acumulado reembolsado del cargo</dt>
        <dd>{money(value.charge_amount_refunded_cents, true)}</dd>
        <dt>Alcance comunicado</dt>
        <dd>{incidentExtentLabels[value.extent]}</dd>
        <dt>Fechas del evento / consulta</dt>
        <dd>
          {date(value.event_created)} / {date(value.observed_at)}
        </dd>
        <dt>Intento de pago y cargo</dt>
        <dd>
          {value.payment_intent_id} · {value.charge_id}
        </dd>
      </dl>
    </div>
  );
}
