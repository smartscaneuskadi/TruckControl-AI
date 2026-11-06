import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Landmark, RefreshCw } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  loadCompanyFiscal,
  saveCompanyFiscal,
} from "../integrations/supabase/company-fiscal";
import { fiscalOptions, fiscalTerritories } from "../domain/company-fiscal";
import type {
  CompanyFiscalState,
  FiscalProfileInput,
} from "../domain/company-fiscal";
import { Badge, Button, Field } from "./ui";
import { FiscalPreparationNotice } from "./FiscalPreparationNotice";
function FiscalOptionsPreview() {
  return (
    <section
      className="card settings-card company-fiscal-card"
      aria-label="Opciones de facturación de la empresa"
    >
      <Landmark size={25} aria-hidden="true" />
      <Badge tone="blue">Demostración</Badge>
      <h2>Facturación de tu empresa</h2>
      <p>
        Cada empresa podrá configurar las opciones que le permita la
        administración de TruckControl.
      </p>
      <ul className="fiscal-option-list">
        {Object.entries(fiscalOptions).map(([id, option]) => (
          <li key={id}>
            <strong>{option.label}</strong>
            <p>{option.description}</p>
          </li>
        ))}
      </ul>
      <FiscalPreparationNotice />
    </section>
  );
}
export function CompanyFiscalSettings() {
  const company = useCompany(),
    subscription = useSubscription();
  if (company.mode !== "company") return <FiscalOptionsPreview />;
  const organizationId = company.organization?.id;
  if (!organizationId) return null;
  const canManage =
    subscription.access?.can_manage === true && subscription.features.income;
  if (!canManage)
    return (
      <section
        className="card settings-card company-fiscal-card"
        aria-label="Opciones de facturación de la empresa"
      >
        <Landmark size={25} aria-hidden="true" />
        <h2>Facturación de tu empresa</h2>
        <p>
          La configuración fiscal corresponde al propietario o administrador de
          la empresa con acceso a Ingresos.
        </p>
      </section>
    );
  return (
    <ConnectedCompanyFiscal
      key={`${company.user?.id}:${organizationId}`}
      organizationId={organizationId}
    />
  );
}
function ConnectedCompanyFiscal({
  organizationId,
}: {
  organizationId: string;
}) {
  const client = getSupabaseClient();
  const [state, setState] = useState<CompanyFiscalState | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [online, setOnline] = useState(navigator.onLine);
  const [regime, setRegime] = useState<FiscalProfileInput["regime"] | "">(""),
    [territory, setTerritory] = useState<FiscalProfileInput["territory"]>(null),
    [format, setFormat] =
      useState<FiscalProfileInput["document_format"]>("pdf");
  const mounted = useRef(true),
    lock = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const network = () => setOnline(navigator.onLine);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  function apply(next: CompanyFiscalState) {
    setState(next);
    setRegime(next.profile?.regime ?? "");
    setTerritory(next.profile?.territory ?? null);
    setFormat(next.profile?.document_format ?? "pdf");
  }
  useEffect(() => {
    generation.current += 1;
    const controller = new AbortController();
    let active = true;
    setState(null);
    setError("");
    setMessage("");
    setLoading(true);
    if (!online || !client) {
      setLoading(false);
      return () => controller.abort();
    }
    void loadCompanyFiscal(client, organizationId, controller.signal)
      .then((next) => {
        if (active) apply(next);
      })
      .catch(() => {
        if (active)
          setError(
            "No se puede comprobar la configuración fiscal. Revisa tu conexión y los permisos de la empresa.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, organizationId, revision, online]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !state || !regime || lock.current || !navigator.onLine)
      return;
    lock.current = true;
    const savingGeneration = generation.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await saveCompanyFiscal(client, state, {
        regime,
        territory: regime === "ticketbai" ? territory : null,
        document_format: format,
      });
      if (
        mounted.current &&
        navigator.onLine &&
        savingGeneration === generation.current
      ) {
        apply(next);
        setMessage(
          "Configuración guardada para esta empresa. La emisión real continúa pendiente de conectar y verificar.",
        );
      }
    } catch (e) {
      if (mounted.current && savingGeneration === generation.current) {
        setState(null);
        setError(
          e instanceof Error
            ? e.message
            : "No se ha podido confirmar la configuración fiscal.",
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const permitted = state?.policy.enabled === true;
  return (
    <section
      className="card settings-card company-fiscal-card"
      aria-label="Opciones de facturación de la empresa"
    >
      <Landmark size={25} aria-hidden="true" />
      <Badge tone={permitted ? "blue" : "amber"}>
        {loading
          ? "Comprobando permisos"
          : !online
            ? "Consulta sin conexión"
            : !state
              ? "Estado sin comprobar"
              : permitted
                ? "Configuración permitida"
                : "Configuración sin habilitar"}
      </Badge>
      <h2>Facturación de tu empresa</h2>
      <p>Estas opciones corresponden a las facturas que emita tu empresa.</p>
      {!online ? (
        <p>
          Necesitas conexión para consultar o cambiar esta configuración. No se
          guarda en la copia offline.
        </p>
      ) : (
        <>
          {state && (
            <>
              <p>
                <strong>{state.organization_name}</strong>
              </p>
              {!permitted && (
                <p>
                  La administración de TruckControl puede habilitar las opciones
                  para esta empresa. Tu configuración anterior se conserva.
                </p>
              )}
              {state.profile && !state.configured_option_allowed && (
                <p className="fiscal-revocation-note">
                  La opción guardada está bloqueada por la administración. Se
                  conserva el perfil; no permite emitir ni enviar facturas.
                </p>
              )}
              <form onSubmit={(e) => void save(e)}>
                <fieldset
                  disabled={busy || !permitted}
                  className="fiscal-fieldset"
                >
                  <legend>Preferencias de conexión fiscal</legend>
                  <Field label="Sistema de facturación">
                    <select
                      value={regime}
                      onChange={(e) => {
                        setRegime(e.target.value as typeof regime);
                        setTerritory(null);
                      }}
                      required
                    >
                      <option value="">Elige una opción permitida</option>
                      {(
                        [
                          "ticketbai",
                          "verifactu",
                          "no_verifactu",
                          "external",
                        ] as const
                      ).map((id) => (
                        <option
                          key={id}
                          value={id}
                          disabled={!state.policy.options[id]}
                        >
                          {fiscalOptions[id].label}
                          {!state.policy.options[id] ? " · no permitido" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {regime && <p>{fiscalOptions[regime].description}</p>}
                  {regime === "ticketbai" && (
                    <Field label="Hacienda foral TicketBAI">
                      <select
                        value={territory ?? ""}
                        onChange={(e) =>
                          setTerritory(
                            (e.target.value || null) as typeof territory,
                          )
                        }
                        required
                      >
                        <option value="">
                          Elige el territorio de tu empresa
                        </option>
                        {Object.entries(fiscalTerritories).map(
                          ([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                  )}
                  <Field label="Formato previsto">
                    <select
                      value={format}
                      onChange={(e) =>
                        setFormat(e.target.value as typeof format)
                      }
                    >
                      <option value="pdf">
                        PDF del programa de facturación
                      </option>
                      <option
                        value="facturae"
                        disabled={!state.policy.options.facturae}
                      >
                        Facturae · conexión compatible
                        {!state.policy.options.facturae
                          ? " · no permitido"
                          : ""}
                      </option>
                    </select>
                  </Field>
                  <p>
                    Comprueba con tu asesoría el sistema aplicable a tu empresa.
                    La elección del formato se prepara por separado.
                  </p>
                  <Button
                    type="submit"
                    disabled={
                      !regime ||
                      !state.policy.options[regime] ||
                      (regime === "ticketbai" && !territory) ||
                      (format === "facturae" && !state.policy.options.facturae)
                    }
                  >
                    Guardar configuración fiscal
                  </Button>
                </fieldset>
              </form>
            </>
          )}
          <Button
            variant="ghost"
            icon={RefreshCw}
            disabled={busy || loading}
            onClick={() => setRevision((v) => v + 1)}
          >
            Actualizar configuración fiscal
          </Button>
        </>
      )}
      <FiscalPreparationNotice />
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
    </section>
  );
}
