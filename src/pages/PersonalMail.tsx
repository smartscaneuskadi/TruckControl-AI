import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Archive,
  ArrowLeft,
  Download,
  Inbox,
  Mail,
  MailOpen,
  RefreshCw,
  Reply,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Unplug,
} from "lucide-react";
import { usePersonalMail } from "../app/PersonalMailProvider";
import { Button, Field, Modal, PageHeading } from "../components/ui";
import { createDemoMailbox } from "../integrations/personal-mail/demo";
import { fromBase64 } from "../../supabase/functions/_shared/invoice";
import {
  MailError,
  mailFolders,
  validateMailDraft,
} from "../integrations/personal-mail/gmail";
import type {
  MailDraft,
  MailFolder,
  MailMessage,
  MailSummary,
  Mailbox,
} from "../integrations/personal-mail/gmail";

const emptyDraft = (): MailDraft => ({ to: "", cc: "", subject: "", text: "" });
function date(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("es-ES")
    : "Fecha no disponible";
}
function errorMessage(error: unknown) {
  if (error instanceof MailError) {
    return {
      expired: "La sesión del buzón ha caducado. Vuelve a entrar con Google.",
      denied:
        "Google no ha autorizado esta operación. Comprueba los permisos del buzón.",
      consent_required:
        "Actualiza TruckControl y acepta la información de privacidad de IMAP/SMTP antes de volver a conectar este buzón.",
      invalid:
        "Comprueba destinatarios, asunto y mensaje. Usa direcciones de correo separadas por comas, hasta 20 destinatarios.",
      too_large:
        "El contenido supera el límite de lectura o descarga de este apartado.",
      unavailable:
        "No se ha podido completar la operación. Comprueba la conexión y actualiza.",
      sent_copy_failed:
        "El servidor de envío ha aceptado el mensaje, pero no se ha podido guardar una copia en Enviados. No lo envíes otra vez por este fallo.",
      send_uncertain:
        "No se ha podido confirmar el envío. Puede haberse enviado: revisa Enviados antes de crear otro mensaje. No lo reenviaremos automáticamente.",
    }[error.code];
  }
  return "No se ha podido completar la operación. Comprueba tu conexión y vuelve a intentarlo.";
}
export function PersonalMail() {
  const account = usePersonalMail();
  return <PersonalMailView key={account.scopeKey} />;
}
export interface ConnectedMailbox {
  mailbox: Mailbox;
  email: string;
  online: boolean;
  disconnect(): void;
  expire(): void;
}
export function ConnectedMailView({
  connection,
}: {
  connection: ConnectedMailbox;
}) {
  return <PersonalMailView connection={connection} />;
}
function PersonalMailView({ connection }: { connection?: ConnectedMailbox }) {
  const personal = usePersonalMail();
  const account = connection
    ? {
        ...personal,
        ...connection,
        cloud: true,
        error: "",
        scopeKey: connection.email,
      }
    : personal;
  const [demo] = useState(createDemoMailbox),
    [demoOpen, setDemoOpen] = useState(false);
  const mailbox = account.cloud ? account.mailbox : demoOpen ? demo : null,
    email = account.cloud ? account.email : "demo@example.invalid";
  const [folder, setFolder] = useState<MailFolder>("inbox"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const [rows, setRows] = useState<MailSummary[]>([]),
    [next, setNext] = useState<string | null>(null),
    [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selected, setSelected] = useState<MailMessage | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<MailDraft | null>(null),
    [confirmSend, setConfirmSend] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [trash, setTrash] = useState(false),
    [disconnect, setDisconnect] = useState(false);
  const lock = useRef(false),
    loadGeneration = useRef(0),
    mounted = useRef(true),
    readController = useRef<AbortController | null>(null);
  const online = !account.cloud || account.online;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readController.current?.abort();
      loadGeneration.current++;
    };
  }, []);
  useEffect(() => {
    if (account.cloud && !connection) void account.configure();
  }, [account.scopeKey]);
  useEffect(() => {
    setRows([]);
    setSelected(null);
    setNext(null);
    setDraft(null);
    setConfirmSend(false);
    setUncertain(false);
    readController.current?.abort();
    loadGeneration.current++;
  }, [mailbox]);
  useEffect(() => {
    if (!mailbox || !online) {
      setRows([]);
      setSelected(null);
      setNext(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError("");
    setSelected(null);
    setRows([]);
    setNext(null);
    void mailbox
      .list(folder, query, cursors.at(-1), controller.signal)
      .then((result) => {
        if (!active || generation !== loadGeneration.current) return;
        setRows(result.messages);
        setNext(result.next);
      })
      .catch((e) => {
        if (
          !active ||
          controller.signal.aborted ||
          generation !== loadGeneration.current
        )
          return;
        setRows([]);
        setNext(null);
        setError(errorMessage(e));
        if (e instanceof MailError && ["expired", "denied"].includes(e.code))
          account.expire();
      })
      .finally(() => {
        if (active && generation === loadGeneration.current) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mailbox, online, folder, query, cursors, revision]);
  async function operation(fn: () => Promise<void>) {
    if (lock.current || !mailbox || !online) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) {
        setError(errorMessage(e));
        if (e instanceof MailError && ["expired", "denied"].includes(e.code))
          account.expire();
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function open(id: string) {
    if (!mailbox || lock.current) return;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setSelected(null);
    await operation(async () => {
      const value = await mailbox.read(id, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setSelected(value);
    });
  }
  async function change(
    action: Parameters<NonNullable<typeof mailbox>["change"]>[1],
  ) {
    if (!mailbox || !selected) return;
    const id = selected.id;
    await operation(async () => {
      await mailbox.change(id, action);
      if (!mounted.current) return;
      setSelected(null);
      setTrash(false);
      setRevision((n) => n + 1);
      setNotice("Cambio confirmado en el buzón.");
    });
  }
  function find(event: FormEvent) {
    event.preventDefault();
    setQuery(search);
    setCursors([undefined]);
    setSelected(null);
  }
  function compose(value: MailDraft = emptyDraft()) {
    if (
      draft &&
      !window.confirm("Hay un borrador abierto. ¿Quieres reemplazarlo?")
    )
      return;
    setDraft(value);
    setConfirmSend(false);
    setUncertain(false);
    setError("");
  }
  function prepareSend(event: FormEvent) {
    event.preventDefault();
    if (!draft || uncertain) return;
    try {
      validateMailDraft(draft);
      setConfirmSend(true);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function send() {
    if (!mailbox || !draft || uncertain) return;
    const current = draft,
      id = crypto.randomUUID();
    await operation(async () => {
      try {
        await mailbox.send(email, current, id);
        if (mounted.current) {
          setDraft(null);
          setConfirmSend(false);
          setNotice(
            account.cloud
              ? "Google ha confirmado el envío."
              : "Mensaje ficticio guardado en Enviados. No se ha enviado ningún correo.",
          );
          setRevision((n) => n + 1);
        }
      } catch (e) {
        if (
          e instanceof MailError &&
          ["send_uncertain", "sent_copy_failed"].includes(e.code) &&
          mounted.current
        ) {
          setUncertain(true);
          setConfirmSend(false);
        }
        throw e;
      }
    });
  }
  const formError = error || account.error;
  return (
    <div className="personal-mail-page">
      {!connection && (
        <Link className="button secondary" to="/mailbox">
          Volver a Correo
        </Link>
      )}
      <PageHeading
        eyebrow="COMUNICACIONES"
        title={connection ? "Buzón conectado" : "Mi correo"}
        description="Tu buzón personal. Tú eliges la cuenta y autorizas el acceso ante tu proveedor."
      >
        {mailbox && (
          <Button
            icon={Send}
            disabled={busy || !online}
            onClick={() => compose()}
          >
            Redactar
          </Button>
        )}
      </PageHeading>
      <section
        className="card personal-mail-account"
        aria-label="Conexión de mi correo"
      >
        <div>
          <ShieldCheck aria-hidden="true" />
          <div>
            <h2>{mailbox ? email : "Accede a tu propio correo"}</h2>
            <p>
              {account.cloud
                ? "Cada usuario conecta su propia cuenta, sin pedir aprobación a TruckControl. El correo personal está disponible también en Básico."
                : "Buzón ficticio para probar lectura, búsqueda, respuesta y envío. No se conecta a proveedores ni utiliza IA."}
            </p>
          </div>
        </div>
        {mailbox ? (
          <div className="inline-actions">
            <Button
              variant="secondary"
              icon={RefreshCw}
              disabled={busy || loading || !online}
              onClick={() => setRevision((n) => n + 1)}
            >
              Actualizar buzón
            </Button>
            <Button
              variant="ghost"
              icon={Unplug}
              disabled={busy}
              onClick={() => setDisconnect(true)}
            >
              Salir del correo
            </Button>
          </div>
        ) : account.cloud ? (
          <div className="personal-mail-connect">
            {account.configured === true ? (
              <>
                <p>
                  Gmail / Google Workspace. Autoriza lectura, redacción y
                  gestión de mensajes. No se solicita permiso para borrar
                  definitivamente. La IA permanece separada.
                </p>
                <Button
                  disabled={account.connecting || !online}
                  onClick={() =>
                    account.ready ? account.connect() : void account.prepare()
                  }
                >
                  {account.connecting
                    ? "Preparando Google…"
                    : account.ready
                      ? "Entrar con Google"
                      : "Preparar conexión con Google"}
                </Button>
              </>
            ) : (
              <>
                <p>
                  {account.configured === false
                    ? "La conexión de Google aún no está configurada para esta aplicación. No hay una solicitud pendiente de aprobación de tu cuenta."
                    : "Comprueba la disponibilidad de la conexión para entrar con tu cuenta."}
                </p>
                <Button
                  variant="secondary"
                  disabled={!online}
                  onClick={() => void account.configure()}
                >
                  Comprobar Google
                </Button>
              </>
            )}
          </div>
        ) : (
          <Button icon={Inbox} onClick={() => setDemoOpen(true)}>
            Abrir buzón ficticio
          </Button>
        )}
        {account.cloud && !connection && (
          <p className="personal-mail-privacy">
            La sesión caduca y se cierra al salir de TruckControl o cambiar de
            empresa. Tus mensajes y el permiso de correo no se guardan en la
            copia offline. Puedes retirar el permiso en{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              tu cuenta de Google
            </a>
            . Retirarlo puede afectar otras conexiones con TruckControl.
          </p>
        )}
        {account.cloud && !connection && (
          <p className="personal-mail-privacy">
            Outlook, Yahoo y otros servidores todavía no tienen conexión directa
            en este apartado. El reenvío de facturas existente sigue disponible
            por separado.
          </p>
        )}
      </section>
      {!online && (
        <p className="form-error" role="status">
          El correo personal necesita Internet. Vuelve a conectarte para
          consultar o enviar mensajes.
        </p>
      )}
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {notice && (
        <p className="mail-success" role="status">
          {notice}
        </p>
      )}
      {mailbox && (
        <section
          className="card personal-mail-workspace"
          aria-label="Buzón personal"
        >
          <div className="personal-mail-toolbar">
            <Field label="Carpeta">
              <select
                value={folder}
                disabled={busy}
                onChange={(e) => {
                  setFolder(e.target.value as MailFolder);
                  setCursors([undefined]);
                  setSelected(null);
                }}
              >
                {Object.entries(mailFolders).map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <form onSubmit={find}>
              <Field label="Buscar en mi correo">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={300}
                  disabled={busy}
                />
              </Field>
              <Button
                type="submit"
                variant="secondary"
                disabled={busy || !online}
              >
                Buscar
              </Button>
            </form>
          </div>
          <div
            className={`personal-mail-grid ${selected ? "has-message" : ""}`}
          >
            <div className="personal-mail-list" aria-label="Mensajes">
              <h2>
                {mailFolders[folder]}{" "}
                <span className="muted">· página {cursors.length}</span>
              </h2>
              {loading ? (
                <p role="status">Cargando mensajes…</p>
              ) : !rows.length ? (
                <p>No hay mensajes en esta página con los filtros actuales.</p>
              ) : (
                rows.map((row) => (
                  <button
                    className={`personal-mail-row ${row.labels.includes("UNREAD") ? "unread" : ""} ${row.id === selected?.id ? "selected" : ""}`}
                    key={row.id}
                    disabled={busy || !online}
                    onClick={() => void open(row.id)}
                  >
                    <span>
                      {row.labels.includes("STARRED") && (
                        <Star size={14} aria-label="Destacado" />
                      )}
                      {row.from || "Remitente no disponible"}
                    </span>
                    <strong>{row.subject}</strong>
                    <span>{row.snippet}</span>
                    <time>{date(row.date)}</time>
                  </button>
                ))
              )}
              <div className="inline-actions personal-mail-pagination">
                <Button
                  variant="ghost"
                  disabled={busy || loading || cursors.length === 1}
                  onClick={() => {
                    setCursors((values) => values.slice(0, -1));
                    setSelected(null);
                  }}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || loading || !next}
                  onClick={() => {
                    if (next) {
                      setCursors((values) => [...values, next]);
                      setSelected(null);
                    }
                  }}
                >
                  Siguiente
                </Button>
              </div>
            </div>
            <div
              className="personal-mail-reader"
              aria-label="Contenido del mensaje"
            >
              {selected ? (
                <>
                  <Button
                    variant="ghost"
                    icon={ArrowLeft}
                    disabled={busy}
                    onClick={() => setSelected(null)}
                  >
                    Volver a la lista
                  </Button>
                  <h2>{selected.subject}</h2>
                  <dl>
                    <dt>De</dt>
                    <dd>{selected.from}</dd>
                    <dt>Para</dt>
                    <dd>{selected.to}</dd>
                    <dt>Fecha</dt>
                    <dd>{date(selected.date)}</dd>
                  </dl>
                  <div className="inline-actions">
                    <Button
                      icon={Reply}
                      disabled={busy || !online}
                      onClick={() => {
                        const address =
                          selected.from.match(/<([^<>]+)>/)?.[1] ??
                          selected.from;
                        compose({
                          to: address,
                          cc: "",
                          subject: /^re:/i.test(selected.subject)
                            ? selected.subject
                            : `Re: ${selected.subject}`,
                          text: "",
                          threadId: selected.threadId,
                          ...(/^<[^\s<>]{1,250}>$/.test(selected.messageId)
                            ? { inReplyTo: selected.messageId }
                            : {}),
                        });
                      }}
                    >
                      Responder
                    </Button>
                    <Button
                      variant="ghost"
                      icon={
                        selected.labels.includes("UNREAD") ? MailOpen : Mail
                      }
                      disabled={busy || !online}
                      onClick={() =>
                        void change(
                          selected.labels.includes("UNREAD")
                            ? "read"
                            : "unread",
                        )
                      }
                    >
                      {selected.labels.includes("UNREAD")
                        ? "Marcar leído"
                        : "Marcar no leído"}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={Star}
                      disabled={busy || !online}
                      onClick={() =>
                        void change(
                          selected.labels.includes("STARRED")
                            ? "unstar"
                            : "star",
                        )
                      }
                    >
                      {selected.labels.includes("STARRED")
                        ? "Quitar destacado"
                        : "Destacar"}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={Archive}
                      disabled={busy || !online}
                      onClick={() => void change("archive")}
                    >
                      Archivar
                    </Button>
                    {selected.labels.includes("TRASH") ? (
                      <Button
                        variant="secondary"
                        disabled={busy || !online}
                        onClick={() => void change("restore")}
                      >
                        Sacar de papelera
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        icon={Trash2}
                        disabled={busy || !online}
                        onClick={() => setTrash(true)}
                      >
                        Papelera
                      </Button>
                    )}
                  </div>
                  {selected.htmlConverted && (
                    <p className="muted">
                      Contenido convertido a texto. Las imágenes externas y el
                      contenido activo no se cargan.
                    </p>
                  )}
                  <pre className="personal-mail-text">
                    {selected.text ||
                      "Este mensaje no tiene un cuerpo de texto disponible."}
                  </pre>
                  {!!selected.attachments.length && (
                    <div className="personal-mail-attachments">
                      <h3>Adjuntos</h3>
                      {selected.attachments.map((item) => (
                        <Button
                          key={item.id}
                          variant="secondary"
                          icon={Download}
                          disabled={
                            busy || !online || item.bytes > 10 * 1024 * 1024
                          }
                          onClick={() =>
                            void operation(async () => {
                              const bytes = item.inlineData
                                ? fromBase64(item.inlineData)
                                : await mailbox.attachment(
                                    selected.id,
                                    item.id,
                                  );
                              if (bytes.length > 10 * 1024 * 1024)
                                throw new MailError("too_large");
                              if (!mounted.current) return;
                              const blob = new Blob([bytes as BlobPart], {
                                  type: "application/octet-stream",
                                }),
                                url = URL.createObjectURL(blob),
                                anchor = document.createElement("a");
                              anchor.href = url;
                              anchor.download = item.name;
                              anchor.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            })
                          }
                        >
                          {item.name}
                          {item.bytes > 10 * 1024 * 1024
                            ? " · supera 10 MB"
                            : ""}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <MailOpen aria-hidden="true" />
                  <p>
                    Selecciona un mensaje para leerlo. Abrirlo no lo marca como
                    leído automáticamente.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {draft && (
        <Modal
          title={confirmSend ? "Confirmar envío" : "Redactar correo"}
          onClose={() => {
            if (busy) return;
            if (
              window.confirm("¿Cerrar el borrador? No se guardará en el buzón.")
            ) {
              setDraft(null);
              setConfirmSend(false);
            }
          }}
        >
          {confirmSend ? (
            <div className="personal-mail-confirm">
              <p>
                {account.cloud ? "Se enviará desde" : "Simulación desde"}{" "}
                <strong>{email}</strong>.
              </p>
              <p>Para: {draft.to}</p>
              {draft.cc && <p>CC: {draft.cc}</p>}
              <p>Asunto: {draft.subject}</p>
              <p>
                {account.cloud
                  ? "Comprueba el destinatario antes de enviar. No se usará IA ni se registrará ningún gasto."
                  : "El mensaje solo aparecerá en el buzón ficticio; no se envía por Internet."}
              </p>
              <div className="inline-actions">
                <Button
                  disabled={busy || !online}
                  icon={Send}
                  onClick={() => void send()}
                >
                  {busy
                    ? "Enviando…"
                    : account.cloud
                      ? "Enviar ahora"
                      : "Simular envío"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirmSend(false)}
                >
                  Volver al borrador
                </Button>
              </div>
            </div>
          ) : (
            <form className="form-grid" onSubmit={prepareSend}>
              <Field label="Para" full>
                <input
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  disabled={busy || uncertain}
                  required
                  maxLength={2000}
                  placeholder="persona@empresa.com"
                />
              </Field>
              <Field label="CC" full>
                <input
                  value={draft.cc}
                  onChange={(e) => setDraft({ ...draft, cc: e.target.value })}
                  disabled={busy || uncertain}
                  maxLength={2000}
                />
              </Field>
              <Field label="Asunto" full>
                <input
                  value={draft.subject}
                  onChange={(e) =>
                    setDraft({ ...draft, subject: e.target.value })
                  }
                  disabled={busy || uncertain}
                  maxLength={200}
                  required
                />
              </Field>
              <Field label="Mensaje" full>
                <textarea
                  rows={10}
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  disabled={busy || uncertain}
                  required
                  maxLength={400000}
                />
              </Field>
              <p className="full muted">
                El borrador se mantiene en esta pantalla. Todavía no se adjuntan
                archivos ni se guarda en Borradores del proveedor.
              </p>
              {uncertain && (
                <p className="full form-error" role="status">
                  Envío incierto. Revisa Enviados antes de crear otro mensaje;
                  este envío queda bloqueado para evitar repetirlo.
                </p>
              )}
              <div className="full inline-actions">
                <Button
                  type="submit"
                  icon={Send}
                  disabled={busy || uncertain || !online}
                >
                  Revisar envío
                </Button>
              </div>
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {trash && selected && (
        <Modal
          title="Mover a papelera"
          onClose={() => {
            if (!busy) setTrash(false);
          }}
        >
          <p>
            Se moverá «{selected.subject}» a la papelera de {email}. No se
            borrará definitivamente.
          </p>
          <div className="inline-actions">
            <Button
              variant="danger"
              disabled={busy || !online}
              onClick={() => void change("trash")}
            >
              Confirmar papelera
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setTrash(false)}
            >
              Cancelar
            </Button>
          </div>
        </Modal>
      )}
      {disconnect && (
        <Modal
          title="Salir de mi correo"
          onClose={() => {
            if (!busy) setDisconnect(false);
          }}
        >
          <p>
            La sesión de correo y los mensajes cargados se retirarán de esta
            app. No se borrará ningún mensaje de tu buzón.
          </p>
          {draft && <p>El borrador abierto se perderá.</p>}
          <div className="inline-actions">
            <Button
              disabled={busy}
              onClick={() => {
                account.disconnect();
                setDemoOpen(false);
                setRows([]);
                setSelected(null);
                setDraft(null);
                setDisconnect(false);
              }}
            >
              Confirmar salida del correo
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDisconnect(false)}
            >
              Cancelar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
