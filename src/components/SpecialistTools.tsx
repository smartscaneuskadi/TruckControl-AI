import { useEffect, useRef, useState } from "react";
import {
  specialistProfiles,
  specialistIdSchema,
  type SpecialistId,
  type SpecialistStatus,
  type SpecialistJobs,
} from "../domain/ai-specialists";
import {
  specialistDocuments,
  specialistJobs,
} from "../integrations/supabase/ai-specialists";
import { getSupabaseClient } from "../integrations/supabase/client";
import { Button, Field } from "./ui";

export function SpecialistTools({
  organizationId,
  profile,
  capabilities,
  disabled,
  documentIds,
  onProfile,
  onDocuments,
  onExample,
}: {
  organizationId: string;
  profile: SpecialistId;
  capabilities: SpecialistStatus;
  disabled: boolean;
  documentIds: string[];
  onProfile: (p: SpecialistId) => void;
  onDocuments: (ids: string[]) => void;
  onExample: (text: string) => void;
}) {
  const client = getSupabaseClient();
  const [documents, setDocuments] = useState<
      { id: string; name: string; size_bytes: number }[]
    >([]),
    [partial, setPartial] = useState(false),
    [jobs, setJobs] = useState<SpecialistJobs | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = capabilities.profiles.find((p) => p.id === profile),
    info = specialistProfiles.find((p) => p.id === profile)!;
  const generation = useRef(0),
    mutation = useRef<AbortController | null>(null);
  useEffect(() => {
    const epoch = ++generation.current;
    mutation.current?.abort();
    const controller = new AbortController();
    let current = true;
    setDocuments([]);
    setPartial(false);
    setJobs(null);
    setError("");
    setBusy(false);
    if (
      !client ||
      !selected?.allowed ||
      !selected.connection_verified ||
      disabled
    )
      return () => {
        generation.current++;
        controller.abort();
      };
    void specialistJobs(
      client,
      organizationId,
      profile,
      "jobs_status",
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (current) setJobs(v);
      })
      .catch(() => {
        if (current)
          setError("No se pueden comprobar los avisos de este perfil.");
      });
    if (profile === "documents")
      void specialistDocuments(client, organizationId, controller.signal)
        .then((v) => {
          if (current) {
            setDocuments(v.documents);
            setPartial(v.partial);
          }
        })
        .catch(() => {
          if (current)
            setError("No se pueden consultar los documentos autorizados.");
        });
    return () => {
      current = false;
      if (generation.current === epoch) generation.current++;
      mutation.current?.abort();
      controller.abort();
    };
  }, [
    client,
    organizationId,
    profile,
    selected?.allowed,
    selected?.connection_verified,
    disabled,
  ]);
  async function update(
    action: "jobs_save" | "jobs_run" | "jobs_status",
    enabled = jobs?.preference.enabled ?? false,
    cadence = jobs?.preference.cadence ?? "daily",
  ) {
    if (!client || disabled || busy || !jobs) return;
    setBusy(true);
    setError("");
    const epoch = generation.current,
      controller = new AbortController();
    mutation.current = controller;
    try {
      const result = await specialistJobs(
        client,
        organizationId,
        profile,
        action,
        action === "jobs_save"
          ? { enabled, cadence, expected_version: jobs.preference.version }
          : undefined,
        controller.signal,
      );
      if (epoch === generation.current) setJobs(result);
    } catch {
      if (epoch === generation.current)
        setError(
          "No se ha confirmado la preferencia. Actualiza los avisos antes de repetir.",
        );
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  return (
    <div className="specialist-tools">
      <Field label="Perfil del asistente">
        <select
          value={profile}
          disabled={disabled || busy}
          onChange={(e) => {
            const p = specialistIdSchema.safeParse(e.target.value);
            if (p.success) onProfile(p.data);
          }}
        >
          {specialistProfiles.map((p) => {
            const c = capabilities.profiles.find((c) => c.id === p.id);
            return (
              <option
                key={p.id}
                value={p.id}
                disabled={!c?.allowed || !c.connection_verified}
              >
                {p.label}
                {!c?.allowed
                  ? " · sin permiso"
                  : !c.connection_verified
                    ? " · pendiente de prueba real"
                    : ""}
              </option>
            );
          })}
        </select>
      </Field>
      <p>{info.description}</p>
      <p className="muted">
        {selected?.connection_verified
          ? "Conexión verificada mediante prueba real."
          : "Conexión pendiente de prueba real."}{" "}
        Cambiar de perfil limpia la conversación local y conserva las propuestas
        ya preparadas.
      </p>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => onExample(info.example)}
      >
        Usar ejemplo de {info.label.toLowerCase()}
      </Button>
      {profile === "documents" && (
        <fieldset disabled={disabled || busy}>
          <legend>
            Archivos que autorizas enviar a IA · máximo 3 y 2 MB en total
          </legend>
          {!documents.length && (
            <p>
              No hay documentos disponibles en esta selección. Puedes subirlos
              desde Documentos.
            </p>
          )}
          {documents.map((d) => (
            <label key={d.id} className="checkbox-line">
              <input
                type="checkbox"
                checked={documentIds.includes(d.id)}
                disabled={
                  !documentIds.includes(d.id) &&
                  (documentIds.length >= 3 ||
                    d.size_bytes +
                      documents
                        .filter((x) => documentIds.includes(x.id))
                        .reduce((n, x) => n + x.size_bytes, 0) >
                      2 * 1024 * 1024)
                }
                onChange={(e) =>
                  onDocuments(
                    e.target.checked
                      ? [...documentIds, d.id]
                      : documentIds.filter((id) => id !== d.id),
                  )
                }
              />
              {d.name}
            </label>
          ))}
          {partial && (
            <p>
              Se muestran los 50 archivos más recientes. La lista es parcial.
            </p>
          )}
        </fieldset>
      )}
      <details className="specialist-jobs">
        <summary>Avisos periódicos opcionales</summary>
        <p>
          Revisa tus registros con reglas del servidor. No llama al modelo IA,
          envía correos ni modifica fichas. Su lectura está limitada a tus
          permisos y consentimiento vigentes.
        </p>
        {jobs && (
          <>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={jobs.preference.enabled}
                disabled={disabled || busy}
                onChange={(e) => void update("jobs_save", e.target.checked)}
              />
              Activar avisos de {info.label.toLowerCase()}
            </label>
            <Field label="Frecuencia de los avisos">
              <select
                value={jobs.preference.cadence}
                disabled={disabled || busy}
                onChange={(e) =>
                  void update(
                    "jobs_save",
                    jobs.preference.enabled,
                    e.target.value === "weekly" ? "weekly" : "daily",
                  )
                }
              >
                <option value="daily">Cada día</option>
                <option value="weekly">Cada semana</option>
              </select>
            </Field>
            <div className="copilot-toolbar">
              <Button
                variant="secondary"
                disabled={disabled || busy || !jobs.preference.enabled}
                onClick={() => void update("jobs_run")}
              >
                Revisar avisos ahora
              </Button>
              <Button
                variant="secondary"
                disabled={disabled || busy}
                onClick={() => void update("jobs_status")}
              >
                Actualizar avisos
              </Button>
            </div>
            <ul>
              {jobs.jobs.slice(0, 3).map((j) => (
                <li key={j.id}>
                  Revisión del {j.scheduled_for}:{" "}
                  {j.state === "complete"
                    ? "completada con reglas, sin consumo IA"
                    : j.state === "pending"
                      ? "pendiente"
                      : j.state === "cancelled"
                        ? "cancelada"
                        : "no completada; revisa la conexión"}
                  .
                </li>
              ))}
            </ul>
            {!jobs.jobs.length && <p>Aún no hay revisiones de este perfil.</p>}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </details>
    </div>
  );
}
