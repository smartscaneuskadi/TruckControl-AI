import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { Badge, Button, Modal } from "./ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  loadFiscalAdminPage,
  saveFiscalPolicy,
} from "../integrations/supabase/company-fiscal";
import {
  fiscalOptions,
  fiscalPolicyInputSchema,
  fiscalTerritories,
} from "../domain/company-fiscal";
import type {
  CompanyFiscalPage,
  CompanyFiscalState,
  FiscalPolicyInput,
} from "../domain/company-fiscal";
import { FiscalPreparationNotice } from "./FiscalPreparationNotice";

export function FiscalAdminSettings({ onSaved }: { onSaved(): void }) {
  const client = getSupabaseClient();
  const [page, setPage] = useState<CompanyFiscalPage | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<(string | null)[]>([]),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [editing, setEditing] = useState<CompanyFiscalState | null>(null),
    [draft, setDraft] = useState<FiscalPolicyInput | null>(null);
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPage(null);
    setLoading(true);
    setError("");
    if (!client) {
      setLoading(false);
      return () => controller.abort();
    }
    void loadFiscalAdminPage(client, cursor, controller.signal)
      .then((next) => {
        if (active) setPage(next);
      })
      .catch(() => {
        if (active)
          setError(
            "No se puede comprobar el listado fiscal. Solo la administración global verificada tiene acceso.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, cursor, revision]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !editing || !draft || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await saveFiscalPolicy(client, editing, draft);
      if (mounted.current) {
        setPage((current) =>
          current
            ? {
                ...current,
                items: current.items.map((row) =>
                  row.organization_id === next.organization_id ? next : row,
                ),
              }
            : null,
        );
        setEditing(null);
        setDraft(null);
        setMessage(
          "Permisos fiscales guardados para esta empresa. La emisión real sigue pendiente de una conexión verificada.",
        );
        onSaved();
      }
    } catch (e) {
      if (mounted.current) {
        setPage(null);
        setEditing(null);
        setDraft(null);
        setError(
          e instanceof Error
            ? e.message
            : "No se ha podido confirmar el cambio fiscal.",
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const valid = draft && fiscalPolicyInputSchema.safeParse(draft).success;
  return (
    <section
      className="card admin-section fiscal-admin"
      aria-label="Administración de facturación de empresas"
    >
      <div className="admin-section-heading">
        <div>
          <h2>Facturación de empresas</h2>
          <p>
            Habilita la preparación y las opciones de cada empresa. Su
            administrador elige entre las que permitas.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={busy || loading || Boolean(editing)}
          onClick={() => {
            setCursor(null);
            setHistory([]);
            setRevision((v) => v + 1);
          }}
        >
          Actualizar empresas fiscales
        </Button>
      </div>
      <FiscalPreparationNotice />
      {loading && <p role="status">Cargando permisos fiscales…</p>}
      {page && (
        <>
          <p className="fiscal-page-count">
            {page.items.length} empresas en esta página.
          </p>
          <div className="fiscal-company-grid">
            {page.items.map((row) => (
              <article className="fiscal-company-row" key={row.organization_id}>
                <div className="fiscal-company-title">
                  <Building2 size={21} aria-hidden="true" />
                  <h3>{row.organization_name}</h3>
                </div>
                <Badge tone={row.policy.enabled ? "blue" : "neutral"}>
                  {row.policy.enabled
                    ? "Configuración permitida"
                    : "Sin habilitar"}
                </Badge>
                <p>
                  {row.profile
                    ? `${fiscalOptions[row.profile.regime].label}${row.profile.territory ? ` · ${fiscalTerritories[row.profile.territory]}` : ""} · ${row.profile.document_format === "facturae" ? "Facturae" : "PDF"}`
                    : "La empresa todavía no ha elegido su configuración."}
                </p>
                {row.profile && !row.configured_option_allowed && (
                  <p className="fiscal-revocation-note">
                    El perfil guardado se conserva, con la opción bloqueada.
                  </p>
                )}
                <Button
                  variant="secondary"
                  icon={Settings2}
                  disabled={busy}
                  onClick={() => {
                    setEditing(row);
                    setDraft({
                      enabled: row.policy.enabled,
                      options: { ...row.policy.options },
                    });
                    setError("");
                    setMessage("");
                  }}
                >
                  Permisos fiscales de {row.organization_name}
                </Button>
              </article>
            ))}
          </div>
          <div className="fiscal-pagination">
            <Button
              variant="ghost"
              icon={ChevronLeft}
              disabled={busy || !history.length}
              onClick={() => {
                setCursor(history.at(-1) ?? null);
                setHistory((h) => h.slice(0, -1));
              }}
            >
              Página anterior de empresas
            </Button>
            <Button
              variant="secondary"
              icon={ChevronRight}
              disabled={busy || !page.next_cursor}
              onClick={() => {
                setHistory((h) => [...h, cursor]);
                setCursor(page.next_cursor);
              }}
            >
              Más empresas
            </Button>
          </div>
        </>
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
      {editing && draft && (
        <Modal
          title="Permisos fiscales de la empresa"
          onClose={() => {
            if (!busy) {
              setEditing(null);
              setDraft(null);
            }
          }}
        >
          <p>
            <strong>{editing.organization_name}</strong>
          </p>
          <form onSubmit={(e) => void save(e)}>
            <fieldset className="fiscal-fieldset" disabled={busy}>
              <legend>Control reservado a la administración global</legend>
              <label className="check-row fiscal-master-switch">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft({ ...draft, enabled: e.target.checked })
                  }
                />
                Habilitar configuración fiscal para esta empresa
              </label>
              {Object.entries(fiscalOptions).map(([id, option]) => (
                <label className="check-row fiscal-option-control" key={id}>
                  <input
                    type="checkbox"
                    checked={draft.options[id as keyof typeof draft.options]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        options: { ...draft.options, [id]: e.target.checked },
                      })
                    }
                  />
                  <span>
                    <strong>Permitir {option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
              {!valid && (
                <p>
                  Permite al menos un sistema de facturación antes de habilitar
                  la configuración. Facturae es un formato adicional.
                </p>
              )}
              <FiscalPreparationNotice />
              <p>
                Deshabilitar conserva el perfil y su auditoría. Cada cambio se
                comprueba en el servidor y queda registrado.
              </p>
              <div className="modal-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(null);
                    setDraft(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!valid}>
                  Guardar permisos fiscales
                </Button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </section>
  );
}
