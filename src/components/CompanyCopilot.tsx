import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Bot,
  Check,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { useOffline } from "../app/OfflineContext";
import { useFleet } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  copilotChat,
  copilotPending,
  copilotResult,
  copilotStatus,
  copilotTask,
  copilotTaskState,
} from "../integrations/supabase/copilot";
import { changedCopilotFields, copilotLabels } from "../domain/copilot";
import type {
  ChatMessage,
  CopilotAction,
  CopilotStatus,
  CopilotTurn,
} from "../domain/copilot";
import { operationFields } from "../domain/operation-fields";
import { categories, truckStatuses, driverStatuses } from "../domain/models";
import { money, number, date } from "../lib/format";
import {
  recognizedText,
  recognitionConstructor,
  stopRecognition,
} from "../lib/copilot-voice";
import type { VoiceRecognition } from "../lib/copilot-voice";
import { Badge, Button, Field } from "./ui";

const examples = [
  "¿Cómo van los ingresos y gastos de este mes?",
  "Prepara un cliente con los datos que te voy a indicar.",
  "Quiero programar la revisión de un camión.",
];
export function CompanyCopilot() {
  const company = useCompany();
  if (company.mode !== "company" || !company.organization)
    return (
      <section
        className="card company-copilot"
        aria-label="Asistente de empresa"
      >
        <div className="copilot-title">
          <Bot size={28} aria-hidden="true" />
          <div>
            <Badge tone="blue">Vista previa · datos ficticios</Badge>
            <h2>Tu asistente por voz y texto</h2>
          </div>
        </div>
        <p>
          Conversación con IA para consultar tu empresa y preparar camiones,
          conductores, clientes, viajes, gastos, ingresos, mantenimiento,
          combustible, remolques y avisos. Revisa cada propuesta antes de
          guardarla.
        </p>
        <ul className="copilot-examples">
          {examples.map((e) => (
            <li key={e}>«{e}»</li>
          ))}
        </ul>
        <p className="copilot-notice">
          <ShieldCheck size={19} aria-hidden="true" /> El chat real se utiliza
          dentro de tu empresa con el permiso y consentimiento de IA. El dictado
          depende del navegador. Esta vista previa no consulta el modelo ni
          modifica datos.
        </p>
      </section>
    );
  return (
    <ConnectedCopilot
      key={`${company.user?.id}:${company.organization.id}`}
      organizationId={company.organization.id}
      organizationName={company.organization.name}
    />
  );
}
function ConnectedCopilot({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const company = useCompany(),
    subscription = useSubscription(),
    offline = useOffline(),
    fleet = useFleet(),
    operations = useOperations(),
    client = getSupabaseClient();
  const [status, setStatus] = useState<CopilotStatus | null>(null),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [online, setOnline] = useState(navigator.onLine);
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [draft, setDraft] = useState(""),
    [actions, setActions] = useState<CopilotAction[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [unknownRequest, setUnknownRequest] = useState<string | null>(null);
  const [voiceConsent, setVoiceConsent] = useState(false),
    [listening, setListening] = useState(false),
    [now, setNow] = useState(Date.now());
  const mounted = useRef(true),
    generation = useRef(0),
    lock = useRef(false),
    microphone = useRef<VoiceRecognition | null>(null),
    requestController = useRef<AbortController | null>(null);
  const cloud = online && !offline.offline;
  const ready = cloud && status?.allowed === true && status.configured;
  const writable =
    ready && status.can_write && subscription.access?.can_write !== false;
  const canDictate = Boolean(recognitionConstructor());
  const capabilities = JSON.stringify({
    features: subscription.features,
    can_write: subscription.access?.can_write,
  });
  function releaseVoice() {
    stopRecognition(microphone.current);
    microphone.current = null;
    if (mounted.current) setListening(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  useEffect(() => {
    mounted.current = true;
    const network = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) releaseVoice();
    };
    const visibility = () => {
      if (document.hidden) releaseVoice();
    };
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      generation.current++;
      requestController.current?.abort();
      releaseVoice();
      window.clearInterval(tick);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const epoch = ++generation.current,
      controller = new AbortController();
    requestController.current?.abort();
    releaseVoice();
    setStatus(null);
    setActions([]);
    setMessages([]);
    setDraft("");
    setUnknownRequest(null);
    setNotice("");
    setError("");
    setLoading(true);
    if (!cloud || !client) {
      setLoading(false);
      return () => controller.abort();
    }
    void copilotStatus(client, organizationId, controller.signal)
      .then(async (next) => {
        if (!mounted.current || epoch !== generation.current) return;
        setStatus(next);
        if (next.allowed) {
          const pending = await copilotPending(
            client,
            organizationId,
            controller.signal,
          );
          if (mounted.current && epoch === generation.current)
            setActions(pending);
        }
      })
      .catch(() => {
        if (mounted.current && epoch === generation.current) {
          setStatus(null);
          setActions([]);
          setError(
            "No se puede comprobar el estado del asistente. Actualiza la conexión y tus permisos.",
          );
        }
      })
      .finally(() => {
        if (mounted.current && epoch === generation.current) setLoading(false);
      });
    return () => controller.abort();
  }, [
    client,
    organizationId,
    company.user?.id,
    cloud,
    revision,
    capabilities,
    subscription.access?.profile?.ai_opt_in,
    subscription.access?.profile?.ai_allowed,
  ]);
  function live(epoch: number) {
    return mounted.current && epoch === generation.current && navigator.onLine;
  }
  function acceptTurn(turn: CopilotTurn) {
    if (turn.state === "complete" && turn.reply) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: turn.reply! },
      ]);
      setActions((current) => [
        ...turn.actions,
        ...current.filter((a) => !turn.actions.some((n) => n.id === a.id)),
      ]);
      setNotice(
        turn.actions.length
          ? "Propuestas preparadas. Los cambios se guardan al confirmarlos abajo."
          : "Respuesta recibida. No se han modificado registros.",
      );
      setUnknownRequest(null);
    } else if (turn.state === "failed") {
      setUnknownRequest(null);
      setError(
        "La consulta no pudo completarse. Revisa la petición antes de iniciar una nueva.",
      );
    } else {
      setUnknownRequest(turn.request_id);
      setNotice(
        "La consulta sigue en proceso. Comprueba su estado para evitar otra llamada de IA.",
      );
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !ready ||
      !client ||
      lock.current ||
      !draft.trim() ||
      listening ||
      unknownRequest
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const epoch = generation.current,
      requestId = crypto.randomUUID(),
      next: ChatMessage[] = [
        ...messages,
        { role: "user", content: draft.trim() },
      ];
    setMessages(next);
    setDraft("");
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const result = await copilotChat(
        client,
        organizationId,
        requestId,
        next,
        controller.signal,
      );
      if (live(epoch)) acceptTurn(result);
    } catch (e) {
      if (live(epoch)) {
        setUnknownRequest(requestId);
        setError(
          e instanceof Error
            ? e.message
            : "No se puede confirmar el resultado de la consulta.",
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function recover() {
    if (!client || !unknownRequest || lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const epoch = generation.current;
    try {
      const result = await copilotResult(
        client,
        organizationId,
        unknownRequest,
      );
      if (live(epoch)) acceptTurn(result);
    } catch (e) {
      if (live(epoch))
        setError(
          e instanceof Error ? e.message : "No se puede comprobar la consulta.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function decide(action: CopilotAction, decision: "execute" | "cancel") {
    if (!client || !writable || lock.current || !cloud) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const epoch = generation.current;
    try {
      const saved = await copilotTask(client, organizationId, action, decision);
      if (!live(epoch)) return;
      setActions((current) =>
        current.map((a) => (a.id === saved.id ? saved : a)),
      );
      setNotice(
        decision === "execute"
          ? `Tarea guardada en ${organizationName}: ${copilotLabels[saved.entity]}.`
          : "Propuesta cancelada. Los registros se conservan.",
      );
      if (decision === "execute") {
        try {
          await fleet.refresh();
          if (live(epoch)) await operations.refresh();
        } catch {
          if (live(epoch))
            setNotice(
              "La tarea está guardada. Actualiza la empresa para cargar los datos nuevos; no vuelvas a registrar la tarea.",
            );
        }
      }
    } catch (e) {
      if (live(epoch)) {
        setError(
          e instanceof Error ? e.message : "No se puede confirmar la tarea.",
        );
        try {
          const actual = await copilotTaskState(client, organizationId, action);
          if (live(epoch)) {
            setActions((current) =>
              current.map((a) => (a.id === actual.id ? actual : a)),
            );
            if (actual.state !== "pending") {
              setError("");
              setNotice(
                actual.state === "applied"
                  ? "El servidor confirma que esta tarea ya está guardada. Actualiza la empresa para ver el resultado."
                  : "El servidor confirma que esta propuesta está cancelada.",
              );
            }
          }
        } catch {
          if (live(epoch)) {
            setActions([]);
            setStatus(null);
          }
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function consent() {
    if (!client || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const epoch = generation.current;
    try {
      const { error } = await client.rpc("tc_set_ai_opt_in", {
        p_enabled: !subscription.access?.profile?.ai_opt_in,
      });
      if (error) throw Error("No se puede actualizar tu consentimiento de IA.");
      if (live(epoch)) subscription.refresh();
    } catch (e) {
      if (live(epoch))
        setError(
          e instanceof Error
            ? e.message
            : "No se puede actualizar tu consentimiento.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function dictate() {
    if (listening) {
      microphone.current?.stop();
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor || !ready || !voiceConsent || busy || unknownRequest)
      return;
    releaseVoice();
    const recognition = new Constructor(),
      epoch = generation.current,
      prefix = draft.trim();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = true;
    microphone.current = recognition;
    recognition.onresult = (event) => {
      if (live(epoch) && microphone.current === recognition) {
        const text = [prefix, recognizedText(event)].filter(Boolean).join(" ");
        setDraft(text.slice(0, 2000));
        if (text.length > 2000)
          setError(
            "El dictado supera el espacio de un mensaje. Revisa el texto y envíalo por partes.",
          );
      }
    };
    recognition.onerror = () => {
      if (live(epoch) && microphone.current === recognition) {
        setListening(false);
        setError(
          "No se ha podido utilizar el micrófono. Revisa el permiso del navegador o escribe tu mensaje.",
        );
      }
    };
    recognition.onend = () => {
      if (mounted.current && microphone.current === recognition) {
        setListening(false);
        microphone.current = null;
      }
    };
    try {
      recognition.start();
      setListening(true);
    } catch {
      releaseVoice();
      setError(
        "El dictado no está disponible ahora. Puedes escribir el mensaje.",
      );
    }
  }
  function speak(text: string) {
    if (!voiceConsent || !ready || !("speechSynthesis" in window)) return;
    releaseVoice();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    window.speechSynthesis.speak(utterance);
  }
  const coreLabels: Record<string, string> = {
    plate: "Matrícula",
    brand: "Marca",
    model: "Modelo",
    year: "Año",
    odometerKm: "Kilometraje",
    status: "Estado",
    driverId: "Conductor",
    inspectionDueOn: "Próxima ITV",
    route: "Ruta",
    name: "Nombre",
    email: "Correo",
    phone: "Teléfono",
    license: "Permiso",
    licenseExpiresOn: "Vencimiento del permiso",
    truckId: "Camión",
    concept: "Concepto",
    date: "Fecha",
    amountCents: "Importe sin IVA (€)",
    category: "Categoría",
    paymentStatus: "Cobro / pago",
    distanceKm: "Distancia (km)",
  };
  function display(action: CopilotAction, key: string, value: unknown) {
    if (value === null || value === "") return "Sin indicar";
    if (key === "amountCents" && typeof value === "number")
      return money(value, true);
    if (key === "millilitres" && typeof value === "number")
      return `${number(value / 1000)} litros`;
    if (key === "truckId")
      return (
        fleet.snapshot.trucks.find((t) => t.id === value)?.plate ??
        "Referencia de camión"
      );
    if (key === "driverId")
      return (
        fleet.snapshot.drivers.find((d) => d.id === value)?.name ??
        "Referencia de conductor"
      );
    if (key === "customerId" || key === "trailerId") {
      const record = operations.rows.find((r) => r.id === value);
      return record
        ? String(record.data.name ?? record.data.plate)
        : "Referencia de la empresa";
    }
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (typeof value === "number") return number(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      return date(value);
    const field =
      action.entity in operationFields
        ? operationFields[action.entity as keyof typeof operationFields].find(
            (f) => f.key === key,
          )
        : undefined;
    const labels =
      key === "category"
        ? categories
        : key === "status" && action.entity === "truck"
          ? truckStatuses
          : key === "status" && action.entity === "driver"
            ? driverStatuses
            : key === "paymentStatus"
              ? { paid: "Pagado / cobrado", pending: "Pendiente" }
              : field?.options;
    return labels?.[String(value) as keyof typeof labels] ?? String(value);
  }
  return (
    <section className="card company-copilot" aria-label="Asistente de empresa">
      <div className="copilot-title">
        <Bot size={28} aria-hidden="true" />
        <div>
          <Badge tone={ready ? "green" : "blue"}>
            {loading
              ? "Comprobando permisos…"
              : ready
                ? "Asistente conectado"
                : status
                  ? "Activación pendiente"
                  : "Estado sin comprobar"}
          </Badge>
          <h2>Tu asistente por voz y texto</h2>
        </div>
      </div>
      <p>
        Empresa activa: <strong>{organizationName}</strong>.
      </p>
      {company.organizations.length > 1 && (
        <div className="copilot-company-picker">
          <Field label="Empresa activa">
            <select
              className="company-select"
              value={organizationId}
              disabled={!cloud}
              onChange={(e) => company.select(e.target.value)}
            >
              {company.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {!cloud && (
        <p role="status">
          El asistente necesita conexión. El chat, el dictado y las tareas están
          pausados.
        </p>
      )}
      {cloud && !ready && !loading && (
        <div className="copilot-activation">
          <p>
            Se necesitan el módulo Asistente IA, el permiso de tu cuenta y tu
            consentimiento. El administrador gestiona la habilitación.
          </p>
          {subscription.access?.profile?.ai_allowed && (
            <Button
              variant="secondary"
              onClick={() => void consent()}
              disabled={busy}
            >
              {subscription.access.profile.ai_opt_in
                ? "Retirar mi consentimiento de IA"
                : "Permitir mi uso de IA"}
            </Button>
          )}
        </div>
      )}
      <details className="copilot-privacy">
        <summary>Permisos y privacidad del asistente</summary>
        <p className="copilot-notice">
          <ShieldCheck size={19} aria-hidden="true" />
          La IA recibe la conversación y los registros autorizados de esta
          empresa. Revisa sus propuestas antes de guardar. La cuota se comparte
          con la consulta documental.
        </p>
        <p>
          El navegador puede procesar el audio o el texto al utilizar los
          controles de voz. El dictado se convierte en texto editable antes de
          enviarlo.
        </p>
        <p>
          El asistente prepara tareas de flota y gestión. Los envíos de correo,
          pagos, emisión fiscal, permisos de usuarios y borrados se gestionan en
          sus apartados.
        </p>
        <div className="copilot-toolbar">
          <Button
            variant="secondary"
            icon={RefreshCw}
            disabled={busy || !cloud}
            onClick={() => setRevision((n) => n + 1)}
          >
            Actualizar estado del asistente
          </Button>
          {ready && subscription.access?.profile?.ai_opt_in && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void consent()}
            >
              Retirar mi consentimiento de IA
            </Button>
          )}
        </div>
      </details>
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversación con el asistente"
        className="copilot-conversation"
      >
        {!messages.length && (
          <div className="copilot-welcome">
            <h3>¿Qué hacemos hoy?</h3>
            <p>
              Escribe o dicta tu petición. Te preguntaré los datos que falten.
            </p>
            <div className="copilot-quick-actions">
              {examples.slice(0, 2).map((e, index) => (
                <button
                  type="button"
                  className="copilot-suggestion"
                  key={e}
                  disabled={!ready || busy || Boolean(unknownRequest)}
                  onClick={() => setDraft(e)}
                >
                  {index === 0 ? "Resumen del mes" : "Preparar un cliente"}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <article className={`copilot-message ${m.role}`} key={i}>
            <strong>
              {m.role === "user" ? "Tú" : "Asistente · respuesta para revisar"}
            </strong>
            <p>{m.content}</p>
            {m.role === "assistant" && (
              <Button
                variant="secondary"
                icon={Volume2}
                disabled={
                  !ready || !voiceConsent || !("speechSynthesis" in window)
                }
                onClick={() => speak(m.content)}
              >
                Escuchar respuesta {i + 1}
              </Button>
            )}
          </article>
        ))}
        {busy && <p role="status">Comprobando y preparando el resultado…</p>}
      </div>
      <label className="copilot-voice-consent">
        <input
          type="checkbox"
          checked={voiceConsent}
          onChange={(e) => {
            setVoiceConsent(e.target.checked);
            if (!e.target.checked) releaseVoice();
          }}
        />
        Permitir dictado y lectura del navegador. Su proveedor puede procesar el
        audio o el texto; se utilizan al pulsar los controles de voz.
      </label>
      {!canDictate && (
        <p className="muted">
          Este navegador no ofrece dictado compatible. Puedes escribir o
          utilizar el micrófono del teclado del dispositivo.
        </p>
      )}
      <form onSubmit={send} className="copilot-composer">
        <Field label="Tu mensaje al asistente">
          <textarea
            rows={3}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy || !cloud || Boolean(unknownRequest)}
            placeholder="Cuéntame qué necesitas hacer en tu empresa…"
            required
          />
        </Field>
        <div className="copilot-toolbar">
          <Button
            variant="secondary"
            type="button"
            icon={listening ? MicOff : Mic}
            onClick={dictate}
            disabled={
              !ready ||
              !voiceConsent ||
              !canDictate ||
              busy ||
              Boolean(unknownRequest)
            }
          >
            {listening ? "Terminar dictado" : "Dictar mensaje"}
          </Button>
          <Button
            type="submit"
            icon={Send}
            disabled={
              !ready ||
              busy ||
              !draft.trim() ||
              listening ||
              Boolean(unknownRequest)
            }
          >
            Enviar al asistente
          </Button>
        </div>
        <small>
          Revisa el texto dictado antes de enviarlo. Las consultas consumen la
          cuota IA de tu empresa.
        </small>
      </form>
      {unknownRequest && (
        <div className="copilot-notice">
          <p>
            Hay una consulta sin confirmar. Comprobar su estado no inicia otra
            llamada al modelo.
          </p>
          <Button
            variant="secondary"
            disabled={!ready || busy}
            onClick={() => void recover()}
          >
            Comprobar estado de la consulta
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setUnknownRequest(null);
              setNotice(
                "Puedes iniciar otra consulta. Si la anterior llegó al proveedor, ya puede haber consumido IA.",
              );
            }}
          >
            Cerrar seguimiento de esta consulta
          </Button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="copilot-result" role="status">
          {notice}
        </p>
      )}
      {actions.length > 0 && (
        <div className="copilot-proposals">
          <h3>Tareas para revisar</h3>
          <p>
            Las propuestas caducan a los 30 minutos. Confirmar una guarda
            únicamente los datos que ves; no habilita pagos, correo ni emisión
            fiscal.
          </p>
          {actions.map((action) => {
            const expired = Date.parse(action.expires_at) <= now;
            return (
              <article
                key={action.id}
                className="copilot-proposal"
                aria-label={`Propuesta ${copilotLabels[action.entity]}`}
              >
                <div className="copilot-title">
                  <h4>
                    {action.mode === "create" ? "Crear" : "Actualizar"}:{" "}
                    {copilotLabels[action.entity]}
                  </h4>
                  <Badge tone={action.state === "applied" ? "green" : "blue"}>
                    {action.state === "applied"
                      ? "Guardada"
                      : action.state === "cancelled"
                        ? "Cancelada"
                        : expired
                          ? "Caducada"
                          : "Pendiente de tu confirmación"}
                  </Badge>
                </div>
                <dl>
                  {changedCopilotFields(action).map(([key, value]) => {
                    const field =
                      action.entity in operationFields
                        ? operationFields[
                            action.entity as keyof typeof operationFields
                          ].find((f) => f.key === key)
                        : undefined;
                    return (
                      <div key={key}>
                        <dt>{field?.label ?? coreLabels[key] ?? key}</dt>
                        <dd>
                          {action.mode === "update" && (
                            <span className="copilot-before">
                              {display(action, key, action.previous?.[key])}{" "}
                              →{" "}
                            </span>
                          )}
                          {display(action, key, value)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {["income", "expense"].includes(action.entity) && (
                  <p>Es un apunte de gestión, no una factura fiscal emitida.</p>
                )}
                {action.state === "pending" && (
                  <div className="copilot-toolbar">
                    <Button
                      icon={Check}
                      disabled={!writable || busy || expired}
                      onClick={() => void decide(action, "execute")}
                    >
                      Confirmar y guardar {copilotLabels[action.entity]}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={X}
                      disabled={!writable || busy}
                      onClick={() => void decide(action, "cancel")}
                    >
                      Cancelar propuesta de {copilotLabels[action.entity]}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
