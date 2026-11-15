import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Clock3, RefreshCw } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  CompanyFullError,
  companyFullErrorMessage,
  companyFullHistory,
  companyFullSessionKey,
  listCompanyFull,
  setCompanyFull,
} from "../integrations/supabase/company-full";
import {
  fullExpiryFromInput,
  fullInputFromExpiry,
  fullStatusLabel,
} from "../domain/company-full";
import type {
  CompanyFullAudit,
  CompanyFullCommand,
  CompanyFullItem,
} from "../domain/company-full";
import { currentLocale, t } from "../i18n/runtime";
import { sessionExitEvent } from "../app/session-events";
import { Badge, Button, Empty, Field, Modal, SearchField } from "./ui";
import "../styles/company-full.css";

function dateLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(currentLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value)) + " UTC"
    : "Sin vencimiento";
}
type Editor = { item: CompanyFullItem; enabled: boolean; expiry: string };
type Pending = { command: CompanyFullCommand; name: string };
export function CompanyFullAdmin({ userId }: { userId: string }) {
  const client = getSupabaseClient();
  const [items, setItems] = useState<CompanyFullItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [observedAt, setObservedAt] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [historyFor, setHistoryFor] = useState<CompanyFullItem | null>(null);
  const [history, setHistory] = useState<CompanyFullAudit[]>([]);
  const [historyNext, setHistoryNext] = useState<number | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [revision, setRevision] = useState(0);
  const mounted = useRef(false),
    epoch = useRef(0),
    reads = useRef(0),
    historyReads = useRef(0);
  const sessionKey = useRef<string | null | undefined>(undefined);
  const editorRef = useRef(editor),
    historyRef = useRef(historyFor),
    pendingRef = useRef(pending);
  editorRef.current = editor;
  historyRef.current = historyFor;
  pendingRef.current = pending;
  useEffect(() => {
    mounted.current = true;
    const clear = () => {
      ++epoch.current;
      ++reads.current;
      ++historyReads.current;
      setItems([]);
      setNext(null);
      setAvailable(false);
      setEditor(null);
      setPending(null);
      setHistoryFor(null);
      setHistory([]);
      setError("");
      setLoadError("");
      setMessage("");
      setBusy(false);
    };
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      const nextKey = companyFullSessionKey(session);
      if (
        (session && session.user.id !== userId) ||
        (sessionKey.current !== undefined && nextKey !== sessionKey.current)
      )
        clear();
      sessionKey.current = nextKey;
    });
    const offline = () => {
      setAvailable(false);
      setLoadError("Comprueba la conexión antes de gestionar las licencias.");
    };
    window.addEventListener("offline", offline);
    window.addEventListener(sessionExitEvent, clear);
    return () => {
      mounted.current = false;
      ++epoch.current;
      ++reads.current;
      ++historyReads.current;
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("offline", offline);
      window.removeEventListener(sessionExitEvent, clear);
    };
  }, [client, userId]);
  useEffect(() => {
    const timer = setTimeout(() => setFilter(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(
    async (after?: string) => {
      if (!client || !navigator.onLine) return;
      const stamp = epoch.current,
        request = ++reads.current;
      const current = () => mounted.current && epoch.current === stamp;
      setLoading(true);
      try {
        const page = await listCompanyFull(
          client,
          userId,
          current,
          filter,
          after,
        );
        if (!current() || reads.current !== request) return;
        setItems((old) =>
          after
            ? old.concat(
                page.items.filter(
                  (item) =>
                    !old.some(
                      (row) => row.organization_id === item.organization_id,
                    ),
                ),
              )
            : page.items,
        );
        setNext(page.next_after);
        setObservedAt(page.observed_at);
        setAvailable(true);
        setLoadError("");
      } catch (cause) {
        if (!current() || reads.current !== request) return;
        setAvailable(false);
        setLoadError(companyFullErrorMessage(cause));
        if (cause instanceof CompanyFullError && cause.reason === "denied") {
          setItems([]);
          setEditor(null);
          setHistoryFor(null);
        }
      } finally {
        if (current() && reads.current === request) setLoading(false);
      }
    },
    [client, userId, filter],
  );
  useEffect(() => {
    void load();
  }, [load, revision]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && navigator.onLine) void load();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  async function submit(request: Pending) {
    if (!client || busy || !navigator.onLine) return;
    const stamp = epoch.current,
      current = () => mounted.current && epoch.current === stamp;
    setPending(request);
    pendingRef.current = request;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const receipt = await setCompanyFull(
        client,
        userId,
        current,
        request.command,
      );
      if (!current()) return;
      setItems((old) =>
        old.map((item) =>
          item.organization_id === receipt.item.organization_id &&
          item.manual_full.revision <= receipt.item.manual_full.revision
            ? receipt.item
            : item,
        ),
      );
      setObservedAt(receipt.observed_at);
      setPending(null);
      pendingRef.current = null;
      if (
        editorRef.current?.item.organization_id ===
        request.command.organizationId
      )
        setEditor(null);
      setMessage(
        receipt.item.manual_full.revision > receipt.applied_revision
          ? "Solicitud confirmada. Una modificación posterior determina el estado actual de la empresa."
          : "Solicitud confirmada. El estado mostrado procede del servidor.",
      );
      setRevision((value) => value + 1);
    } catch (cause) {
      if (!current()) return;
      setError(companyFullErrorMessage(cause));
      if (
        cause instanceof CompanyFullError &&
        ["conflict", "invalid", "denied"].includes(cause.reason)
      ) {
        setPending(null);
        pendingRef.current = null;
        setEditor(null);
        if (cause.reason === "denied") {
          setAvailable(false);
          setItems([]);
          setHistoryFor(null);
        } else void load();
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function audit(item: CompanyFullItem, before?: number) {
    if (!client) return;
    const stamp = epoch.current,
      request = ++historyReads.current;
    const current = () => mounted.current && epoch.current === stamp;
    if (before === undefined) {
      setHistoryFor(item);
      historyRef.current = item;
      setHistory([]);
      setHistoryNext(null);
    }
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const page = await companyFullHistory(
        client,
        userId,
        current,
        item.organization_id,
        before,
      );
      if (
        !current() ||
        historyReads.current !== request ||
        historyRef.current?.organization_id !== item.organization_id
      )
        return;
      setHistory((old) =>
        before === undefined ? page.items : old.concat(page.items),
      );
      setHistoryNext(page.next_before_revision);
    } catch (cause) {
      if (current() && historyReads.current === request)
        setHistoryError(companyFullErrorMessage(cause));
    } finally {
      if (current() && historyReads.current === request) setHistoryBusy(false);
    }
  }
  function confirm() {
    if (!editor || busy || pending || !available) return;
    try {
      const expiresAt = editor.enabled
        ? fullExpiryFromInput(editor.expiry)
        : null;
      void submit({
        name: editor.item.company_name,
        command: {
          organizationId: editor.item.organization_id,
          expected: editor.item.manual_full.revision,
          operationId: crypto.randomUUID(),
          enabled: editor.enabled,
          expiresAt,
        },
      });
    } catch {
      setError(
        "Introduce una fecha y hora UTC válidas o deja el vencimiento vacío.",
      );
    }
  }
  return (
    <section
      className="card admin-section company-full-admin"
      aria-labelledby="company-full-title"
    >
      <div className="admin-section-heading">
        <div>
          <h2 id="company-full-title">Empresas · Pack Full</h2>
          <p>
            Gestiona el acceso comercial de cada empresa. La activación manual
            no inicia ningún cobro.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={loading}
          onClick={() => void load()}
        >
          Actualizar empresas
        </Button>
      </div>
      <SearchField
        value={query}
        onChange={(value) => setQuery(value.slice(0, 160))}
        label="Buscar empresa"
        placeholder="Empresa o correo del propietario"
      />
      {observedAt && (
        <p className="company-full-observed">
          Estado comprobado: {dateLabel(observedAt)}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {message && (
        <p className="access-message" role="status">
          {message}
        </p>
      )}
      {pending && (
        <div className="company-full-pending" role="status">
          <p>
            Solicitud pendiente de confirmar para {pending.name}. El reintento
            conserva la misma solicitud y la misma empresa.
          </p>
          <Button
            disabled={busy || !navigator.onLine}
            onClick={() => void submit(pending)}
          >
            Reintentar la misma solicitud
          </Button>
        </div>
      )}
      {loading && <p role="status">Comprobando empresas y licencias…</p>}
      {!loading && !items.length && available && (
        <Empty title="No hay empresas que coincidan" />
      )}
      <div className="company-full-list">
        {items.map((item) => (
          <article
            className="company-full-row"
            key={item.organization_id}
            aria-label={item.company_name}
          >
            <div className="company-full-identity">
              <Building2 size={22} aria-hidden="true" />
              <div>
                <h3>{item.company_name}</h3>
                <p>{item.owner_email ?? item.owner_id}</p>
                <small translate="no">{item.organization_id}</small>
              </div>
            </div>
            <div className="company-full-state">
              <Badge
                tone={
                  (
                    item.manual_full.configured
                      ? item.manual_full.status === "active"
                      : item.effective_active
                  )
                    ? "green"
                    : item.manual_full.status === "expired"
                      ? "amber"
                      : "neutral"
                }
              >
                {fullStatusLabel(item.manual_full, item.effective_active)}
              </Badge>
              <p>
                {item.manual_full.configured
                  ? dateLabel(item.manual_full.expires_at)
                  : t("Plan anterior: {0}. Sin asignación manual.", [
                      item.effective_plan === "full"
                        ? "Full"
                        : t(
                            item.effective_plan === "limited"
                              ? "Básico"
                              : "sin acceso activo",
                          ),
                    ])}
              </p>
              {item.manual_full.status === "active" &&
                !item.effective_active && (
                  <p>
                    El Pack Full está activado; otras condiciones de la cuenta
                    impiden el acceso comercial.
                  </p>
                )}
            </div>
            <div className="company-full-actions">
              <Button
                disabled={!available || busy || Boolean(pending)}
                onClick={() => {
                  setError("");
                  setMessage("");
                  setEditor({
                    item,
                    enabled: true,
                    expiry:
                      item.manual_full.status === "active"
                        ? fullInputFromExpiry(item.manual_full.expires_at)
                        : "",
                  });
                }}
              >
                {item.manual_full.status === "active"
                  ? "Editar Pack Full"
                  : "Activar Pack Full"}
              </Button>
              <Button
                variant="secondary"
                disabled={
                  !available ||
                  busy ||
                  Boolean(pending) ||
                  item.manual_full.enabled === false
                }
                onClick={() => {
                  setError("");
                  setMessage("");
                  setEditor({ item, enabled: false, expiry: "" });
                }}
              >
                Desactivar Pack Full
              </Button>
              <Button
                variant="ghost"
                icon={Clock3}
                disabled={!available}
                onClick={() => void audit(item)}
              >
                Ver historial
              </Button>
            </div>
          </article>
        ))}
      </div>
      {next && (
        <Button
          variant="secondary"
          disabled={loading || !available}
          onClick={() => void load(next)}
        >
          Mostrar más empresas
        </Button>
      )}
      {editor && (
        <Modal
          title={editor.enabled ? "Activar Pack Full" : "Desactivar Pack Full"}
          onClose={() => setEditor(null)}
        >
          <h3>{editor.item.company_name}</h3>
          <p translate="no">{editor.item.organization_id}</p>
          <p>
            El cambio se aplicará únicamente a esta empresa y quedará registrado
            con tu cuenta y la hora del servidor.
          </p>
          {editor.enabled ? (
            <>
              <p>
                Incluye los módulos Full. Las conexiones, autorizaciones y
                límites de los servicios se mantienen.
              </p>
              <Field label="Vencimiento opcional · fecha y hora UTC">
                <input
                  type="datetime-local"
                  value={editor.expiry}
                  disabled={busy || Boolean(pending)}
                  onChange={(event) =>
                    setEditor({ ...editor, expiry: event.target.value })
                  }
                />
              </Field>
              <p>
                Déjalo vacío para activar sin vencimiento. Las fechas de esta
                pantalla se muestran en UTC.
              </p>
            </>
          ) : (
            <p>
              El acceso comercial a esta empresa se bloqueará, incluido el plan
              o prueba anterior. La empresa y sus datos se conservan para poder
              reactivarlos.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Cerrar ventana
            </Button>
            {pending?.command.organizationId === editor.item.organization_id ? (
              <Button disabled={busy} onClick={() => void submit(pending)}>
                Reintentar la misma solicitud
              </Button>
            ) : (
              <Button
                variant={editor.enabled ? "primary" : "danger"}
                disabled={busy || Boolean(pending) || !available}
                onClick={confirm}
              >
                Confirmar cambio
              </Button>
            )}
          </div>
        </Modal>
      )}
      {historyFor && (
        <Modal
          title="Historial de Pack Full"
          subtitle={historyFor.company_name}
          onClose={() => {
            ++historyReads.current;
            setHistoryFor(null);
            historyRef.current = null;
          }}
          wide
        >
          {historyBusy && <p role="status">Cargando historial…</p>}
          {historyError && (
            <p className="form-error" role="alert">
              {historyError}
            </p>
          )}
          {!historyBusy && !history.length && !historyError && (
            <p>
              Todavía no hay cambios manuales registrados para esta empresa.
            </p>
          )}
          <ol className="company-full-audit">
            {history.map((entry) => (
              <li key={entry.operation_id}>
                <strong>{fullStatusLabel(entry.after)}</strong>
                <span>{dateLabel(entry.changed_at)}</span>
                <span>{entry.actor_email ?? entry.actor_id}</span>
                <p>Vencimiento: {dateLabel(entry.after.expires_at)}</p>
              </li>
            ))}
          </ol>
          {historyNext !== null && (
            <Button
              disabled={historyBusy}
              variant="secondary"
              onClick={() => void audit(historyFor, historyNext)}
            >
              Mostrar cambios anteriores
            </Button>
          )}
        </Modal>
      )}
    </section>
  );
}
