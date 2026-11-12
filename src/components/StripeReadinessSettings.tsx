import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  checkStripeReadiness,
  type StripeReadiness,
} from "../integrations/supabase/stripe-readiness";
import { Badge, Button } from "./ui";
import { t } from "../i18n/runtime";

export function StripeReadinessSettings() {
  const client = getSupabaseClient();
  const [report, setReport] = useState<StripeReadiness | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const clear = () => {
      generation.current++;
      lock.current = false;
      setReport(null);
      setError("");
      setBusy(false);
    };
    clear();
    let token: string | null | undefined;
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      const next = session?.access_token ?? null;
      if (event === "SIGNED_OUT" || (token !== undefined && token !== next))
        clear();
      token = next;
    });
    window.addEventListener("offline", clear);
    return () => {
      generation.current++;
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("offline", clear);
    };
  }, [client]);
  async function check() {
    if (!client || lock.current) return;
    const current = ++generation.current;
    lock.current = true;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const result = await checkStripeReadiness(client);
      if (generation.current === current) setReport(result);
    } catch (error) {
      if (generation.current === current)
        setError(
          error instanceof Error
            ? error.message
            : "No se ha podido comprobar Stripe. Inténtalo de nuevo.",
        );
    } finally {
      if (generation.current === current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const webhookReady =
    report?.webhook_id_matches &&
    report.webhook_url_matches &&
    report.webhook_events_match &&
    report.webhook_api_version_matches;
  return (
    <section
      className="settings-card stripe-readiness-settings"
      aria-label="Conexión de Stripe"
    >
      <div className="admin-section-heading">
        <div>
          <h3>Conexión de Stripe</h3>
          <p>
            Verifica la cuenta y el receptor de pagos desde tu administración.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={busy || !client}
          onClick={() => void check()}
        >
          {busy ? t("Comprobando Stripe…") : t("Comprobar Stripe")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      {report && (
        <div role="status" aria-live="polite">
          <div className="settings-grid">
            {[
              {
                label: "Clave de Stripe guardada",
                checked: true,
                ready: report.stripe_key_configured,
              },
              {
                label: "Cuenta ELEVADANCOR verificada",
                checked: report.account_checked,
                ready: report.expected_account,
              },
              {
                label: "Cuenta habilitada para cargos",
                checked: report.account_checked,
                ready: report.charges_enabled && report.expected_account,
              },
              {
                label: "Receptor de pagos correcto",
                checked: report.webhook_checked,
                ready: webhookReady,
              },
              {
                label: "Secreto de firma guardado",
                checked: true,
                ready: report.fiscal_signing_secret_format_valid,
              },
            ].map((row) => (
              <div className="settings-card" key={row.label}>
                <h4>{t(row.label)}</h4>
                <Badge tone={row.ready ? "green" : "amber"}>
                  {t(
                    !row.checked
                      ? "Sin comprobar"
                      : row.ready
                        ? "Correcto"
                        : "Pendiente",
                  )}
                </Badge>
              </div>
            ))}
          </div>
          <p>
            {t("Modo de Stripe:")}{" "}
            {t(
              report.key_mode === "live"
                ? "Producción"
                : report.key_mode === "test"
                  ? "Pruebas"
                  : "Sin comprobar",
            )}
          </p>
          <p>
            {t("Estado del receptor:")}{" "}
            {t(
              report.webhook_disabled === true
                ? "Desactivado"
                : report.webhook_disabled === false
                  ? "Activado"
                  : "Sin comprobar",
            )}
          </p>
          {report.account_status === 401 && (
            <p className="form-error">
              {t("Stripe no acepta la clave guardada.")}
            </p>
          )}
          {report.account_status === 403 && (
            <p className="form-error">
              {t("La clave de Stripe no permite consultar esta cuenta.")}
            </p>
          )}
          <p>
            {t(
              "La firma y la entrega del webhook siguen pendientes de prueba.",
            )}
          </p>
          <p>
            {t("Esta comprobación no modifica los cobros ni las licencias.")}
          </p>
        </div>
      )}
    </section>
  );
}
