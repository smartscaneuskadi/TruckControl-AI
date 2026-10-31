import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FileSearch, Send } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { useOffline } from "../app/OfflineContext";
import { getSupabaseClient } from "../integrations/supabase/client";
import type { CompanyDocument } from "../integrations/supabase/database.types";
import { Button, Field } from "./ui";

export function DocumentAssistant() {
  const company = useCompany(),
    subscription = useSubscription(),
    offline = useOffline(),
    client = getSupabaseClient();
  const [documents, setDocuments] = useState<CompanyDocument[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [question, setQuestion] = useState("");
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [answer, setAnswer] = useState<{
    answer: string;
    uncertain: boolean;
    sources: { reference: string; id: string; name: string }[];
  } | null>(null);
  const cloud = company.mode === "company" && !offline.offline;
  useEffect(() => {
    if (!cloud || !client || !company.organization) return;
    let active = true;
    void client.functions
      .invoke<{ configured: boolean; allowed: boolean }>("company-assistant", {
        body: { action: "status", organization_id: company.organization.id },
      })
      .then(({ data, error }) => {
        if (active)
          setReady(!error && Boolean(data?.configured && data.allowed));
      });
    if (subscription.features.documents)
      void client
        .rpc("list_company_documents", {
          p_organization_id: company.organization.id,
        })
        .then(({ data, error }) => {
          if (active && !error) setDocuments(data ?? []);
        });
    return () => {
      active = false;
    };
  }, [
    cloud,
    client,
    company.organization?.id,
    subscription.access?.profile?.ai_opt_in,
    subscription.features.document_ai,
    subscription.features.documents,
  ]);
  async function toggleConsent() {
    if (!client || busy) return;
    setBusy(true);
    setError("");
    const { error } = await client.rpc("tc_set_ai_opt_in", {
      p_enabled: !subscription.access?.profile?.ai_opt_in,
    });
    if (error) setError("No se ha podido actualizar tu preferencia de IA.");
    else subscription.refresh();
    setBusy(false);
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!ready || !client || !company.organization || busy || !selected.length)
      return;
    setBusy(true);
    setError("");
    setAnswer(null);
    const { data, error } = await client.functions.invoke<{
      answer: string;
      uncertain: boolean;
      sources: { reference: string; id: string; name: string }[];
    }>("company-assistant", {
      body: {
        action: "ask",
        organization_id: company.organization.id,
        document_ids: selected,
        question: question.trim(),
      },
    });
    if (error || !data?.answer)
      setError(
        "No se ha podido consultar. Comprueba tus permisos, el tamaño de los documentos y la disponibilidad del servicio. No se ha modificado ningún registro.",
      );
    else setAnswer(data);
    setBusy(false);
  }
  return (
    <section className="card integration-card document-assistant">
      <h2>
        <FileSearch size={23} /> Consulta tus documentos
      </h2>
      <p>
        Pregunta sobre hasta tres PDF o imágenes de tu empresa. Se enviarán
        únicamente los documentos seleccionados al proveedor de IA autorizado.
        Las respuestas requieren revisión.
      </p>
      {!cloud ? (
        <p>
          {offline.offline
            ? "La consulta con IA requiere conexión y permisos verificados."
            : "La consulta documental está disponible en el espacio privado de cada empresa cuando su administrador la habilita."}
        </p>
      ) : (
        <>
          {!subscription.access?.profile?.ai_allowed ? (
            <p>
              El administrador de la plataforma puede habilitar la IA para tu
              usuario.
            </p>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void toggleConsent()}
            >
              {subscription.access.profile.ai_opt_in
                ? "Desactivar mi uso de IA"
                : "Permitir mi uso de IA"}
            </Button>
          )}
          {!ready && (
            <p className="muted">
              La consulta IA todavía no está activada para esta cuenta. Puedes
              seguir utilizando el análisis local de la flota.
            </p>
          )}
          {ready && (
            <form className="access-form" onSubmit={ask}>
              <fieldset disabled={busy}>
                <legend>
                  Documentos que autorizas consultar (máximo 3 · 10 MB en total)
                </legend>
                {!documents.length ? (
                  <p>Sube primero un documento al archivo de tu empresa.</p>
                ) : (
                  documents.map((doc) => (
                    <label className="checkbox-line" key={doc.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(doc.id)}
                        disabled={
                          !selected.includes(doc.id) && selected.length >= 3
                        }
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, doc.id]
                              : ids.filter((id) => id !== doc.id),
                          )
                        }
                      />
                      {doc.name}
                    </label>
                  ))
                )}
              </fieldset>
              <Field label="Tu pregunta">
                <input
                  maxLength={2000}
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="¿Qué fechas de vencimiento aparecen?"
                />
              </Field>
              <Button
                icon={Send}
                type="submit"
                disabled={busy || !selected.length}
              >
                {busy ? "Consultando documentos…" : "Consultar con IA"}
              </Button>
            </form>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {answer && (
        <article className="document-answer" aria-live="polite">
          <h3>Respuesta del asistente</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</p>
          {answer.uncertain && (
            <p>
              El asistente indica que la documentación no ofrece una respuesta
              concluyente.
            </p>
          )}
          <ul>
            {answer.sources.map((source) => (
              <li key={source.id}>
                [{source.reference}] {source.name}
              </li>
            ))}
          </ul>
          <small>
            Comprueba la respuesta con los documentos originales antes de tomar
            decisiones.
          </small>
        </article>
      )}
    </section>
  );
}
