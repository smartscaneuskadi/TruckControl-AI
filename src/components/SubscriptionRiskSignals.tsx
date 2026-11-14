import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Badge, Button, Field, Modal } from "./ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import { createRiskSignalClient } from "../integrations/supabase/subscription-risk-signals";
import type { RiskSignalClient } from "../integrations/supabase/subscription-risk-signals";
import { SubscriptionIncidentError as Failure } from "../integrations/supabase/subscription-incidents";
import { riskReviewInputSchema } from "../domain/subscription-risk-signals";
import type {
  RiskEntry,
  RiskHistory,
  RiskPage,
  RiskSignalCase,
} from "../domain/subscription-risk-signals";
import { money } from "../lib/format";
import { localizedDateFormat } from "../i18n/runtime";
import "../styles/subscription-incidents.css";

function date(value: string) {
  return localizedDateFormat({
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function SubscriptionRiskSignals({
  userId,
  onOpenTask,
}: {
  userId: string;
  onOpenTask(taskId: string): void;
}) {
  const client = getSupabaseClient(),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let token: string | null | undefined;
    const reset = () => setEpoch((n) => n + 1);
    const change = client?.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id === userId ? session.access_token : null;
      if (event === "SIGNED_OUT" || (token !== undefined && next !== token))
        reset();
      token = next;
    });
    window.addEventListener("offline", reset);
    window.addEventListener("online", reset);
    return () => {
      change?.data.subscription.unsubscribe();
      window.removeEventListener("offline", reset);
      window.removeEventListener("online", reset);
    };
  }, [client, userId]);
  return (
    <RiskPanel
      key={userId + ":" + epoch}
      userId={userId}
      onOpenTask={onOpenTask}
    />
  );
}

function RiskPanel({
  userId,
  onOpenTask,
}: {
  userId: string;
  onOpenTask(taskId: string): void;
}) {
  const client = getSupabaseClient(),
    api = useRef<RiskSignalClient | null>(null),
    lifetime = useRef<AbortController | null>(null);
  const [page, setPage] = useState<RiskPage | null>(null),
    [detail, setDetail] = useState<RiskSignalCase | null>(null);
  const [history, setHistory] = useState<RiskHistory | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editor, setEditor] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null),
    [cursors, setCursors] = useState<(string | null)[]>([]),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    pending = useRef<{
      before: RiskSignalCase;
      data: { note: string };
      operation: string;
    } | null>(null);
  function failure(error: unknown) {
    if (
      error instanceof Failure &&
      (error.kind === "denied" || error.kind === "cancelled")
    ) {
      api.current?.close();
      api.current = null;
      setPage(null);
      setDetail(null);
      setHistory(null);
      setEditor(false);
      pending.current = null;
    }
    setError(
      error instanceof Failure
        ? error.message
        : "No se ha podido contrastar el registro. Actualiza antes de continuar.",
    );
  }
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setPage(null);
    setDetail(null);
    setHistory(null);
    setEditor(false);
    setError("");
    setMessage("");
    setLoading(true);
    pending.current = null;
    if (!client || !navigator.onLine) {
      setLoading(false);
      return () => controller.abort();
    }
    void (async () => {
      const scope = await createRiskSignalClient(
        client,
        userId,
        controller.signal,
      );
      if (controller.signal.aborted) {
        scope.close();
        return;
      }
      api.current = scope;
      const capabilities = await scope.capabilities();
      if (!capabilities.available) return;
      const rows = await scope.list(cursor);
      if (!controller.signal.aborted) setPage(rows);
    })()
      .catch((e) => {
        if (!controller.signal.aborted) failure(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      api.current?.close();
      api.current = null;
      pending.current = null;
    };
  }, [client, userId, cursor, revision]);
  async function inspect(row: RiskSignalCase) {
    if (lock.current || !api.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const controller = lifetime.current;
    try {
      const current = await api.current.detail(row),
        audit = await api.current.history(current);
      if (!controller?.signal.aborted) {
        setDetail(current);
        setHistory(audit);
      }
    } catch (e) {
      if (!controller?.signal.aborted) failure(e);
    } finally {
      lock.current = false;
      if (!controller?.signal.aborted) setBusy(false);
    }
  }
  async function moreHistory() {
    if (
      lock.current ||
      !api.current ||
      !detail ||
      !history?.next_before_version
    )
      return;
    lock.current = true;
    setBusy(true);
    const controller = lifetime.current;
    try {
      const result = await api.current.history(
        detail,
        history.next_before_version,
      );
      if (!controller?.signal.aborted) setHistory(result);
    } catch (e) {
      if (!controller?.signal.aborted) failure(e);
    } finally {
      lock.current = false;
      if (!controller?.signal.aborted) setBusy(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !detail || !api.current) return;
    if (!pending.current) {
      const data = riskReviewInputSchema.safeParse({
        note: new FormData(event.currentTarget).get("note"),
      });
      if (!data.success) {
        setError("Revisa la nota antes de continuar.");
        return;
      }
      pending.current = {
        before: detail,
        data: data.data,
        operation: crypto.randomUUID(),
      };
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const controller = lifetime.current;
    try {
      const intent = pending.current,
        result = await api.current.review(
          intent.before,
          intent.data,
          intent.operation,
        );
      if (controller?.signal.aborted) return;
      setDetail(result.case);
      setPage((old) =>
        old
          ? {
              ...old,
              items: old.items.map((row) =>
                row.id === result.case.id ? result.case : row,
              ),
            }
          : old,
      );
      pending.current = null;
      setEditor(false);
      setUncertain(false);
      setMessage("Revisión declarada. No modifica el pago ni el acceso.");
      const audit = await api.current.history(result.case);
      if (!controller?.signal.aborted) setHistory(audit);
    } catch (e) {
      if (!controller?.signal.aborted) {
        const unknown = e instanceof Failure && e.kind === "uncertain";
        setUncertain(unknown);
        if (!unknown) {
          pending.current = null;
          setEditor(false);
        }
        failure(e);
      }
    } finally {
      lock.current = false;
      if (!controller?.signal.aborted) setBusy(false);
    }
  }
  function closeEditor() {
    if (busy) return;
    pending.current = null;
    setEditor(false);
    setUncertain(false);
    setRevision((n) => n + 1);
  }
  return (
    <section
      className="card admin-section subscription-incidents"
      aria-label="Señales tempranas de fraude"
    >
      <div className="admin-section-heading">
        <h2>Señales tempranas de fraude</h2>
        <Badge tone="amber">Solo información</Badge>
      </div>
      <p>
        Una señal de Stripe no confirma fraude, un contracargo ni una pérdida.
        No se ejecutan reembolsos, cambios de licencia ni facturas.
      </p>
      <p>
        Este registro no acredita que el receptor esté activado. Los datos
        reflejan la última observación guardada, no una consulta en tiempo real.
      </p>
      <Button
        variant="secondary"
        disabled={loading || busy || editor}
        onClick={() => setRevision((n) => n + 1)}
      >
        Actualizar señales
      </Button>
      {!navigator.onLine && (
        <p role="status">
          Las señales privadas no están disponibles sin conexión.
        </p>
      )}
      {loading && <p role="status">Comprobando registro de señales…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!loading && !page && !error && navigator.onLine && (
        <p>El registro de señales todavía no está disponible.</p>
      )}
      {page && (
        <>
          {page.items.length === 0 && (
            <p>
              No hay observaciones guardadas en esta página. Esto no certifica
              ausencia de riesgo.
            </p>
          )}
          <div className="incident-grid">
            {page.items.map((row) => (
              <article className="incident-card" key={row.id}>
                <h3>{row.buyer_company_name}</h3>
                <p>
                  {row.mode === "test" ? "Entorno de prueba" : "Entorno real"} ·{" "}
                  {row.warning_id}
                </p>
                <p>
                  {row.review_state === "reviewed"
                    ? "Revisión declarada"
                    : "Revisión pendiente"}
                </p>
                <Button
                  variant="secondary"
                  disabled={busy || editor}
                  onClick={() => void inspect(row)}
                >
                  Ver señal
                </Button>
              </article>
            ))}
          </div>
          <div className="inline-actions">
            <Button
              variant="secondary"
              disabled={busy || editor || cursors.length === 0}
              onClick={() => {
                setCursor(cursors.at(-1) ?? null);
                setCursors((old) => old.slice(0, -1));
              }}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={busy || editor || !page.next_cursor}
              onClick={() => {
                setCursors((old) => [...old, cursor]);
                setCursor(page.next_cursor);
              }}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      {detail && (
        <div className="incident-detail">
          <h3>Señal observada</h3>
          <p>
            {detail.buyer_company_name} · {detail.warning_id}
          </p>
          <p>
            Importe original del pago: {money(detail.amount_cents, true)}. Este
            importe no representa una pérdida.
          </p>
          <Observation entry={detail.latest_provider} />
          <div className="inline-actions">
            <Button
              disabled={busy || editor}
              onClick={() => {
                setEditor(true);
                setError("");
              }}
            >
              Declarar revisión de señal
            </Button>
            <Button
              variant="secondary"
              disabled={busy || editor}
              onClick={() => onOpenTask(detail.task_id)}
            >
              Ver tarea fiscal existente
            </Button>
          </div>
          <h4>Historial de señales y revisiones</h4>
          {history?.items.map((entry) => (
            <article className="incident-observation" key={entry.id}>
              <p>
                {entry.kind === "review"
                  ? "Revisión declarada"
                  : "Observación del proveedor"}{" "}
                · {date(entry.created_at)} · {entry.row_version}
              </p>
              {entry.kind === "review" ? (
                <p>{entry.note}</p>
              ) : (
                <Observation entry={entry} />
              )}
            </article>
          ))}
          {history?.next_before_version && (
            <Button
              variant="secondary"
              disabled={busy || editor}
              onClick={() => void moreHistory()}
            >
              Ver entradas anteriores
            </Button>
          )}
        </div>
      )}
      {editor && detail && (
        <Modal title="Declarar revisión de señal" onClose={closeEditor}>
          <form onSubmit={(event) => void review(event)}>
            <p>
              Esta declaración no confirma fraude ni resuelve el pago. No cambia
              el acceso del cliente.
            </p>
            <Field label="Nota de revisión">
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
              <input type="checkbox" required disabled={busy || uncertain} />
              He comprobado los hechos y confirmo esta declaración
              administrativa.
            </label>
            {uncertain && (
              <p role="status">
                El resultado es incierto. Reintentar conserva la misma
                identidad, versión y nota. Al cerrar se vuelve a comprobar el
                registro.
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button variant="secondary" disabled={busy} onClick={closeEditor}>
                Cerrar declaración
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Comprobando…"
                  : uncertain
                    ? "Reintentar la misma declaración"
                    : "Confirmar revisión de señal"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Observation({ entry }: { entry: RiskEntry }) {
  const p = entry.provider;
  if (!p) return null;
  return (
    <dl>
      <dt>Evento y fecha</dt>
      <dd>
        {p.event_id} · {p.event_type} · {date(p.event_created)}
      </dd>
      <dt>Señal accionable al ocurrir / al observar</dt>
      <dd>
        {p.actionable_at_event ? "Sí" : "No"} / {p.actionable_now ? "Sí" : "No"}
      </dd>
      <dt>Tipo comunicado por el emisor</dt>
      <dd>
        {p.fraud_type_at_event} / {p.fraud_type_now}
      </dd>
      <dt>Intento de pago y cargo</dt>
      <dd>
        {p.payment_intent_id} · {p.charge_id}
      </dd>
      <dt>Observación guardada</dt>
      <dd>{date(entry.created_at)}</dd>
    </dl>
  );
}
