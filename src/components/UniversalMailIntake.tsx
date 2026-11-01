import { useEffect, useRef, useState } from "react";
import {
  Copy,
  FileInput,
  Forward,
  MailCheck,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { ParsedMail } from "../../supabase/functions/_shared/mail.ts";
import { getSupabaseClient } from "../integrations/supabase/client";
import { Badge, Button, Field, Modal } from "./ui";

interface IntakeStatus {
  upload_ready: boolean;
  forwarding_ready: boolean;
  ai_enabled: boolean;
  inbox: { recipient: string; enabled: boolean } | null;
}
export function UniversalMailIntake({
  organizationId,
  cloud,
  canWrite,
  canManage,
  onDemoImport,
  onImported,
}: {
  organizationId: string;
  cloud: boolean;
  canWrite: boolean;
  canManage: boolean;
  onDemoImport(parsed: ParsedMail): void;
  onImported(): void;
}) {
  const client = getSupabaseClient();
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedMail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [disableInbox, setDisableInbox] = useState(false);
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const selection = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!cloud || !client) return;
    let active = true;
    void client.functions
      .invoke<IntakeStatus>("company-mail", {
        body: { action: "status", organization_id: organizationId },
      })
      .then(({ data, error }) => {
        if (active) setStatus(error ? null : data);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, [cloud, client, organizationId, revision]);
  async function choose(next: File | null, fictitious = false) {
    const current = ++selection.current;
    setError("");
    setMessage("");
    setPreview(null);
    setFile(null);
    if (!next && !fictitious) return;
    setBusy(true);
    try {
      if (next && (next.size < 1 || next.size > 10 * 1024 * 1024))
        throw Error("El archivo debe tener entre 1 byte y 10 MB.");
      const parser = await import("../../supabase/functions/_shared/mail.ts");
      const bytes = next
        ? new Uint8Array(await next.arrayBuffer())
        : parser.fictitiousEmail();
      const parsed = await parser.parseMailFile(
        bytes,
        next?.name ?? "Correo-ficticio.eml",
      );
      if (alive.current && current === selection.current) {
        setPreview(parsed);
        setFile(next);
      }
    } catch (e) {
      if (alive.current && current === selection.current)
        setError(
          e instanceof Error ? e.message : "No se ha podido leer el archivo.",
        );
    } finally {
      if (alive.current && current === selection.current) setBusy(false);
    }
  }
  async function importSelected() {
    if (!preview || busy || (cloud && !canWrite)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (cloud) {
        if (!client || !file)
          throw Error("Selecciona un archivo de esta empresa.");
        if (!navigator.onLine)
          throw Error(
            "Conéctate a internet para guardar los documentos de tu empresa.",
          );
        const body = new FormData();
        body.set("organization_id", organizationId);
        body.set("file", file);
        const { data, error } = await client.functions.invoke<{
          imported: number;
          skipped: number;
          failures: number;
        }>("company-mail", { body });
        if (error || !data)
          throw Error(
            "No se han podido guardar todos los documentos. Comprueba tu acceso y vuelve a intentarlo; los ya guardados no se duplican.",
          );
        if (!alive.current) return;
        setMessage(
          `${data.imported} documentos importados; ${data.skipped} omitidos o ya guardados. Revisa las facturas antes de registrar gastos.`,
        );
        if (data.failures)
          setError(
            `${data.failures} documentos necesitan un nuevo intento. Las importaciones correctas se conservan.`,
          );
        onImported();
      } else {
        onDemoImport(preview);
        setMessage(
          "Adjuntos ficticios añadidos a la bandeja de prueba. Revisa los datos antes de registrar gastos. Los gastos ya confirmados no se duplican.",
        );
      }
      if (alive.current) {
        setPreview(null);
        setFile(null);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se ha podido importar el archivo.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function inboxAction(action: "enable_inbox" | "disable_inbox") {
    if (!client || !cloud || !canManage || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.functions.invoke("company-mail", {
        body: { action, organization_id: organizationId },
      });
      if (error)
        throw Error(
          "No se ha podido cambiar la recepción de correo de esta empresa.",
        );
      if (alive.current) {
        setRevision((r) => r + 1);
        setDisableInbox(false);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se ha podido completar la operación.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      className="card universal-mail"
      aria-labelledby="universal-mail-heading"
    >
      <div className="gmail-guide-title">
        <MailCheck size={25} aria-hidden="true" />
        <div>
          <h2 id="universal-mail-heading">
            Correo y facturas de cualquier proveedor
          </h2>
          <p>
            Outlook, Microsoft 365, Gmail, Yahoo o correo con dominio propio.
            Elige cómo traer tus documentos.
          </p>
        </div>
      </div>
      <div className="mail-options">
        <article>
          <FileInput size={25} aria-hidden="true" />
          <h3>Importar correo o factura</h3>
          <p>
            Abre un correo guardado como EML o una factura PDF o imagen.
            Comprueba los adjuntos antes de importarlos.
          </p>
          {cloud ? (
            <Field label="Archivo de correo o factura">
              <input
                type="file"
                accept=".eml,.pdf,.jpg,.jpeg,.png,.webp"
                disabled={busy || !canWrite}
                onChange={(e) => {
                  void choose(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </Field>
          ) : (
            <>
              <Badge tone="blue">Demostración · solo datos ficticios</Badge>
              <p>
                Prueba la importación con un correo de ejemplo, sin acceder a tu
                buzón.
              </p>
              <small>
                Los adjuntos de prueba se vacían al salir de esta pantalla; los
                gastos confirmados se conservan.
              </small>
              <Button
                icon={FileInput}
                variant="secondary"
                disabled={busy}
                onClick={() => void choose(null, true)}
              >
                Probar correo ficticio
              </Button>
            </>
          )}
          <small>
            Hasta 10 MB y cinco adjuntos PDF, JPG, PNG o WebP. El cuerpo del
            correo y sus enlaces no se guardan.
          </small>
        </article>
        <article>
          <Forward size={25} aria-hidden="true" />
          <h3>Reenvío automático de facturas</h3>
          <p>
            Tu empresa tendrá una dirección exclusiva para recibir las facturas
            que reenvíes desde tu correo habitual.
          </p>
          <Badge
            tone={
              status?.forwarding_ready && status.inbox?.enabled
                ? "green"
                : "amber"
            }
          >
            {status?.forwarding_ready && status.inbox?.enabled
              ? "Recepción activada"
              : "Pendiente de activación del receptor"}
          </Badge>
          {cloud && status?.forwarding_ready && status.inbox?.enabled ? (
            <>
              <p className="mail-recipient">{status.inbox.recipient}</p>
              <div className="inline-actions">
                <Button
                  icon={Copy}
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(status.inbox!.recipient)
                      .then(() => {
                        if (alive.current) setMessage("Dirección copiada.");
                      })
                      .catch(() => {
                        if (alive.current)
                          setError(
                            "No se ha podido copiar. Puedes seleccionar la dirección.",
                          );
                      });
                  }}
                >
                  Copiar dirección
                </Button>
                {canManage && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setDisableInbox(true)}
                  >
                    Desactivar recepción
                  </Button>
                )}
              </div>
            </>
          ) : cloud && status?.forwarding_ready && canManage ? (
            <Button
              disabled={busy}
              onClick={() => void inboxAction("enable_inbox")}
            >
              Activar recepción de esta empresa
            </Button>
          ) : (
            <p>
              La recepción automática estará disponible cuando se active el
              buzón de facturas de tu empresa. Mientras tanto puedes importar
              archivos.
            </p>
          )}
          <small>
            El reenvío trae únicamente los mensajes que elijas. No da acceso al
            resto de tu buzón.
          </small>
        </article>
      </div>
      {preview && (
        <div className="mail-preview" aria-live="polite">
          <h3>Adjuntos listos para revisar</h3>
          <p>{preview.subject || "Correo importado"}</p>
          <ul>
            {preview.attachments.map((a) => (
              <li key={a.contentHash}>
                <strong>{a.name}</strong>
                <span>{Math.max(1, Math.ceil(a.bytes.length / 1024))} KB</span>
              </li>
            ))}
          </ul>
          {preview.skipped > 0 && (
            <p>
              {preview.skipped} elementos omitidos, como imágenes insertadas,
              formatos no admitidos o duplicados.
            </p>
          )}
          <div className="inline-actions">
            <Button
              icon={Upload}
              disabled={busy || (cloud && !file)}
              onClick={() => void importSelected()}
            >
              {cloud ? "Importar documentos" : "Importar adjuntos de prueba"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setFile(null);
              }}
            >
              Cancelar importación
            </Button>
          </div>
        </div>
      )}
      {busy && <p role="status">Procesando documentos…</p>}
      {message && (
        <p role="status" className="mail-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="gmail-privacy-note">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          Los documentos quedan pendientes de revisión. Importar o reenviar no
          registra gastos automáticamente ni activa la IA.
        </p>
      </div>
      {disableInbox && (
        <Modal
          title="Desactivar recepción de facturas"
          onClose={() => {
            if (!busy) setDisableInbox(false);
          }}
        >
          <p>
            La dirección dejará de recibir nuevas facturas. Los documentos y
            gastos ya guardados se conservan.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDisableInbox(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void inboxAction("disable_inbox")}
            >
              Desactivar recepción
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
