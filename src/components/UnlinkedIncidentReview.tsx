import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, Field } from "./ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import { SubscriptionIncidentError } from "../integrations/supabase/subscription-incidents";
import { createUnlinkedIncidentClient } from "../integrations/supabase/subscription-unlinked-incidents";
import type { UnlinkedIncidentClient } from "../integrations/supabase/subscription-unlinked-incidents";
import { unlinkedDeclarationSchema } from "../domain/subscription-unlinked-incidents";
import type {
  UnlinkedAction,
  UnlinkedDeclaration,
  UnlinkedHistory,
  UnlinkedIncident,
  UnlinkedPage,
} from "../domain/subscription-unlinked-incidents";
import { money } from "../lib/format";
import "../styles/subscription-incidents.css";

const reviewLabels = {
  pending: "Revisión pendiente",
  reviewed: "Revisión declarada",
  dismissed: "Descarte declarado",
};
type Intent = {
  before: UnlinkedIncident;
  action: UnlinkedAction;
  input: UnlinkedDeclaration;
  operationId: string;
};

export function UnlinkedIncidentReview({
  userId,
  onOpenTask,
}: {
  userId: string;
  onOpenTask(taskId: string): void;
}) {
  const client = getSupabaseClient();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let previous: string | null | undefined;
    const reset = () => setEpoch((n) => n + 1);
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id === userId ? session.access_token : null;
      if (
        event === "SIGNED_OUT" ||
        (previous !== undefined && previous !== next)
      )
        reset();
      previous = next;
    });
    window.addEventListener("offline", reset);
    window.addEventListener("online", reset);
    return () => {
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("offline", reset);
      window.removeEventListener("online", reset);
    };
  }, [client, userId]);
  return (
    <UnlinkedPanel
      key={userId + ":" + epoch}
      userId={userId}
      onOpenTask={onOpenTask}
    />
  );
}

function UnlinkedPanel({
  userId,
  onOpenTask,
}: {
  userId: string;
  onOpenTask(taskId: string): void;
}) {
  const client = getSupabaseClient(),
    api = useRef<UnlinkedIncidentClient | null>(null);
  const [page, setPage] = useState<UnlinkedPage | null>(null),
    [detail, setDetail] = useState<UnlinkedIncident | null>(null);
  const [history, setHistory] = useState<UnlinkedHistory | null>(null),
    [action, setAction] = useState<UnlinkedAction | null>(null);
  const [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]);
  const [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lifetime = useRef<AbortController | null>(null),
    lock = useRef(false),
    pending = useRef<Intent | null>(null);
  function failure(error: unknown) {
    if (
      error instanceof SubscriptionIncidentError &&
      (error.kind === "denied" || error.kind === "cancelled")
    ) {
      api.current?.close();
      api.current = null;
      setPage(null);
      setDetail(null);
      setHistory(null);
      setAction(null);
      pending.current = null;
    }
    setError(
      error instanceof SubscriptionIncidentError
        ? error.message
        : "No se ha podido contrastar el registro. Actualiza antes de continuar.",
    );
  }
  useEffect(() => {
    if (!client || !navigator.onLine) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    lifetime.current = controller;
    setLoading(true);
    setPage(null);
    setError("");
    void (async () => {
      try {
        const scope = await createUnlinkedIncidentClient(
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
        if (!capabilities.available)
          throw new SubscriptionIncidentError("unavailable");
        const result = await scope.list(cursor);
        if (!controller.signal.aborted) setPage(result);
      } catch (error) {
        if (!controller.signal.aborted) failure(error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      api.current?.close();
      api.current = null;
      pending.current = null;
    };
  }, [client, userId, cursor, revision]);
  async function open(item: UnlinkedIncident) {
    if (!api.current || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const scope = api.current,
        current = await scope.detail(item.id),
        entries = await scope.history(item.id);
      if (!lifetime.current?.signal.aborted && api.current === scope) {
        setDetail(current);
        setHistory(entries);
        setAction(null);
        pending.current = null;
      }
    } catch (error) {
      if (!lifetime.current?.signal.aborted) failure(error);
    } finally {
      lock.current = false;
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api.current || !detail || !action || lock.current || !navigator.onLine)
      return;
    let intent = pending.current;
    if (!intent) {
      const form = new FormData(event.currentTarget);
      if (form.get("confirmed") !== "on") return;
      const parsed = unlinkedDeclarationSchema.safeParse({
        reason: String(form.get("reason") ?? ""),
        evidence_reference: String(form.get("evidence_reference") ?? ""),
      });
      if (!parsed.success) {
        setError(
          "Indica el motivo y una referencia verificable de la evidencia.",
        );
        return;
      }
      intent = {
        before: detail,
        action,
        input: parsed.data,
        operationId: crypto.randomUUID(),
      };
      pending.current = intent;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const scope = api.current;
    try {
      const result = await scope.mutate(
        intent.before,
        intent.action,
        intent.input,
        intent.operationId,
      );
      if (api.current !== scope || lifetime.current?.signal.aborted) return;
      pending.current = null;
      setAction(null);
      setDetail(result.case);
      setPage((old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.id === result.case.id ? result.case : item,
              ),
            }
          : old,
      );
      setMessage(
        "Declaración registrada. El pago, la licencia y las obligaciones fiscales requieren su propia conciliación.",
      );
      const entries = await scope.history(result.case.id);
      if (api.current === scope && !lifetime.current?.signal.aborted) {
        setHistory(entries);
        if (
          entries.items.some(
            (entry) => entry.row_version > result.case.row_version,
          )
        ) {
          const fresh = await scope.detail(result.case.id);
          if (api.current === scope && !lifetime.current?.signal.aborted)
            setDetail(fresh);
        }
      }
    } catch (error) {
      if (api.current !== scope || lifetime.current?.signal.aborted) return;
      if (
        error instanceof SubscriptionIncidentError &&
        error.kind === "conflict"
      ) {
        pending.current = null;
        setAction(null);
        try {
          const fresh = await scope.detail(detail.id),
            entries = await scope.history(detail.id);
          if (api.current === scope && !lifetime.current?.signal.aborted) {
            setDetail(fresh);
            setHistory(entries);
          }
        } catch (refreshFailure) {
          if (api.current === scope && !lifetime.current?.signal.aborted)
            failure(refreshFailure);
          return;
        }
      }
      failure(error);
    } finally {
      lock.current = false;
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  async function moreHistory() {
    if (
      !api.current ||
      !detail ||
      !history?.next_before_version ||
      lock.current
    )
      return;
    lock.current = true;
    setBusy(true);
    const scope = api.current;
    try {
      const more = await scope.history(detail.id, history.next_before_version);
      if (api.current === scope && !lifetime.current?.signal.aborted)
        setHistory({ ...more, items: [...history.items, ...more.items] });
    } catch (error) {
      if (!lifetime.current?.signal.aborted) failure(error);
    } finally {
      lock.current = false;
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="card admin-section subscription-incidents"
      aria-label="Incidencias sin tarea vinculada"
    >
      <div className="admin-section-heading">
        <h2>Incidencias sin tarea vinculada</h2>
        <Button
          variant="secondary"
          disabled={busy || loading || Boolean(action) || !navigator.onLine}
          onClick={() => {
            setDetail(null);
            setHistory(null);
            setRevision((n) => n + 1);
          }}
        >
          Actualizar revisión
        </Button>
      </div>
      <p>
        Observaciones de compras propias contrastadas con Stripe cuyo pago
        todavía no tiene una tarea fiscal vinculada.
      </p>
      <p>
        Revisar o descartar solo registra una declaración administrativa. No
        resuelve el pago, la licencia ni las obligaciones fiscales y no emite
        una factura.
      </p>
      {!navigator.onLine && (
        <p role="status">
          Conéctate para revisar estas incidencias. El registro no se guarda sin
          conexión.
        </p>
      )}
      {loading && <p role="status">Comprobando el registro de revisión…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {page && (
        <>
          <p>{page.items.length} registros en esta página.</p>
          {!page.items.length && <p>No hay incidencias en esta página.</p>}
          <div className="incident-grid">
            {page.items.map((item) => (
              <article className="incident-card" key={item.id}>
                <h3>Pedido {item.request_id}</h3>
                <p>
                  {reviewLabels[item.review_state]} ·{" "}
                  {money(item.amount_cents / 100)}
                </p>
                <p>
                  {item.link
                    ? "Vínculo con un pago registrado disponible"
                    : "Sin tarea fiscal nativa vinculada"}
                </p>
                <Button
                  variant="secondary"
                  disabled={busy || Boolean(action)}
                  onClick={() => void open(item)}
                >
                  Revisar registro
                </Button>
              </article>
            ))}
          </div>
          <div className="inline-actions">
            <Button
              variant="secondary"
              disabled={busy || Boolean(action) || !previous.length}
              onClick={() => {
                setCursor(previous.at(-1) ?? null);
                setPrevious((old) => old.slice(0, -1));
                setDetail(null);
                setHistory(null);
              }}
            >
              Página anterior
            </Button>
            <Button
              variant="secondary"
              disabled={busy || Boolean(action) || !page.next_cursor}
              onClick={() => {
                setPrevious((old) => [...old, cursor]);
                setCursor(page.next_cursor);
                setDetail(null);
                setHistory(null);
              }}
            >
              Página siguiente
            </Button>
          </div>
        </>
      )}
      {detail && (
        <div className="incident-detail">
          <h3>Revisión del pedido {detail.request_id}</h3>
          <p>{reviewLabels[detail.review_state]}</p>
          <dl>
            <dt>Referencia de pago</dt>
            <dd>{detail.payment_intent_id}</dd>
            <dt>Checkout contrastado</dt>
            <dd>{detail.checkout_id}</dd>
            <dt>Empresa interna</dt>
            <dd>{detail.buyer_company_id}</dd>
            <dt>Observación</dt>
            <dd>
              {detail.latest_provider.event_type} ·{" "}
              {detail.latest_provider.current_status}
            </dd>
          </dl>
          {detail.link && (
            <Button
              variant="secondary"
              disabled={busy || Boolean(action)}
              onClick={() => onOpenTask(detail.link!.task_id)}
            >
              Ver tarea fiscal existente
            </Button>
          )}
          {!action && (
            <div className="inline-actions">
              <Button disabled={busy} onClick={() => setAction("review")}>
                Declarar revisión
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setAction("dismiss")}
              >
                Declarar descarte de revisión
              </Button>
            </div>
          )}
          {action && (
            <form onSubmit={(event) => void save(event)}>
              <h4>
                {action === "review"
                  ? "Declaración de revisión"
                  : "Declaración de descarte"}
              </h4>
              <fieldset disabled={busy || Boolean(pending.current)}>
                <Field label="Motivo">
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </Field>
                <Field label="Referencia de evidencia">
                  <input
                    name="evidence_reference"
                    required
                    minLength={3}
                    maxLength={240}
                  />
                </Field>
                <label>
                  <input name="confirmed" type="checkbox" required /> Confirmo
                  que esta declaración no modifica el pago, la licencia ni
                  ninguna factura.
                </label>
              </fieldset>
              {pending.current && (
                <p role="status">
                  El resultado anterior requiere confirmación. Un reintento
                  conserva exactamente la misma declaración.
                </p>
              )}
              <Button type="submit" disabled={busy}>
                {pending.current
                  ? "Reintentar la misma declaración"
                  : "Registrar declaración"}
              </Button>
              {!pending.current && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  Cancelar declaración
                </Button>
              )}
            </form>
          )}
          {history && (
            <div className="incident-history">
              <h4>Historial de revisión</h4>
              <ol>
                {history.items.map((entry) => (
                  <li key={entry.id}>
                    <strong>
                      {entry.kind === "provider"
                        ? "Observación del proveedor"
                        : entry.kind === "linked"
                          ? "Vínculo con tarea existente"
                          : entry.kind === "review"
                            ? "Revisión declarada"
                            : "Descarte declarado"}
                    </strong>
                    <p>{new Date(entry.created_at).toLocaleString()}</p>
                    {entry.kind === "provider" ? (
                      <p>
                        {entry.data.event_type} · {entry.data.status_at_event}
                      </p>
                    ) : entry.kind === "linked" ? (
                      <p>Tarea {entry.data.task_id}</p>
                    ) : (
                      <>
                        <p>{entry.data.reason}</p>
                        <p>Evidencia: {entry.data.evidence_reference}</p>
                        <p>Operador: {entry.actor_id}</p>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              {history.next_before_version && (
                <Button
                  variant="secondary"
                  disabled={busy || Boolean(action)}
                  onClick={() => void moreHistory()}
                >
                  Ver historial anterior
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
