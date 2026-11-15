import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import { mfaErrorMessage, verifyTotp } from "../integrations/supabase/mfa";
import type { MfaSessionStatus } from "../app/MfaSession";
import { sessionExitEvent } from "../app/session-events";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { TotpCodeField } from "./MfaSettings";
import { Button, Field } from "./ui";

export function MfaChallenge({
  status,
  userId,
  onRetry,
  onSignOut,
}: {
  status: MfaSessionStatus;
  userId: string;
  onRetry(): void;
  onSignOut(): Promise<void>;
}) {
  const client = getSupabaseClient();
  const factors = status.state?.factors ?? [];
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const clear = () => {
      ++generation.current;
      setCode("");
      setBusy(false);
      setError("");
    };
    window.addEventListener("offline", clear);
    window.addEventListener(sessionExitEvent, clear);
    return () => {
      mounted.current = false;
      ++generation.current;
      window.removeEventListener("offline", clear);
      window.removeEventListener(sessionExitEvent, clear);
    };
  }, [userId]);
  useEffect(() => {
    if (!factors.some((factor) => factor.id === factorId))
      setFactorId(factors[0]?.id ?? "");
  }, [factors, factorId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client || busy || !factorId) return;
    const stamp = generation.current,
      submitted = code;
    const current = () =>
      mounted.current && stamp === generation.current && navigator.onLine;
    setCode("");
    setBusy(true);
    setError("");
    try {
      await verifyTotp(client, userId, factorId, submitted, current);
      if (current()) onRetry();
    } catch (e) {
      if (current()) setError(mfaErrorMessage(e));
    } finally {
      if (current()) setBusy(false);
    }
  }
  return (
    <main className="registration-page mfa-access-page">
      <LanguageSwitcher />
      <section
        className="card registration-card"
        aria-labelledby="mfa-challenge-title"
      >
        <span className="settings-icon">
          <ShieldCheck size={26} aria-hidden="true" />
        </span>
        <h1 id="mfa-challenge-title">Confirma tu autenticador</h1>
        {status.kind === "challenge" ? (
          <>
            <p>
              Introduce el código de tu aplicación de autenticación para abrir
              tu cuenta y sus datos privados.
            </p>
            <p>
              La recuperación de contraseña no desactiva tus autenticadores. Si
              pierdes uno, utiliza el de respaldo.
            </p>
            <form onSubmit={(event) => void submit(event)}>
              {factors.length > 1 && (
                <Field label="Autenticador">
                  <select
                    value={factorId}
                    disabled={busy}
                    onChange={(event) => {
                      setFactorId(event.target.value);
                      setCode("");
                      setError("");
                    }}
                  >
                    {factors.map((factor, index) => (
                      <option key={factor.id} value={factor.id}>
                        {factor.friendly_name || `Autenticador ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <TotpCodeField
                value={code}
                onChange={setCode}
                disabled={busy || !navigator.onLine}
              />
              <Button
                type="submit"
                disabled={busy || code.length !== 6 || !navigator.onLine}
              >
                Confirmar código
              </Button>
            </form>
          </>
        ) : status.kind === "unavailable" ? (
          <p className="form-error" role="alert">
            No se puede comprobar la seguridad de la sesión. Comprueba la
            conexión y reinténtalo.
          </p>
        ) : (
          <p role="status">Comprobando la seguridad de tu sesión…</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="access-links">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setCode("");
              setError("");
              onRetry();
            }}
          >
            Reintentar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setCode("");
              void onSignOut().catch(() => {
                if (mounted.current)
                  setError(
                    "No se ha podido confirmar el cierre de sesión. Reinténtalo.",
                  );
              });
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      </section>
    </main>
  );
}
