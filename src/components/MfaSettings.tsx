import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  beginTotp,
  mfaEnrollmentEnabled,
  mfaErrorMessage,
  readNativeMfa,
  removeTotp,
  requireMfaProtection,
  safeTotpQr,
  verifyTotp,
} from "../integrations/supabase/mfa";
import type {
  NativeMfaState,
  PendingTotp,
  TotpFactor,
} from "../integrations/supabase/mfa";
import { sessionExitEvent } from "../app/session-events";
import { Badge, Button, Field, Modal } from "./ui";
import "../styles/mfa.css";

export function TotpCodeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange(value: string): void;
  disabled: boolean;
}) {
  return (
    <Field label="Código de 6 dígitos">
      <input
        className="mfa-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
        }
      />
    </Field>
  );
}

/** Company settings and superadministrator settings share this native Auth UI. */
export function MfaSettings({ userId }: { userId: string }) {
  const client = getSupabaseClient();
  const [state, setState] = useState<NativeMfaState | null>(null);
  const [serverReady, setServerReady] = useState(false);
  const [pending, setPending] = useState<PendingTotp | null>(null);
  const [removing, setRemoving] = useState<TotpFactor | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const clear = () => {
      ++generation.current;
      setPending(null);
      setRemoving(null);
      setCode("");
      setError("");
      setMessage("");
      setBusy(false);
    };
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId))
        clear();
    });
    window.addEventListener("offline", clear);
    window.addEventListener(sessionExitEvent, clear);
    return () => {
      mounted.current = false;
      ++generation.current;
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("offline", clear);
      window.removeEventListener(sessionExitEvent, clear);
    };
  }, [client, userId]);
  useEffect(() => {
    if (!client) return;
    const stamp = generation.current;
    let active = true;
    void readNativeMfa(client, userId)
      .then((next) => {
        if (active && mounted.current && generation.current === stamp) {
          setState(next);
          setError("");
        }
      })
      .catch((e) => {
        if (active && generation.current === stamp)
          setError(mfaErrorMessage(e));
      });
    if (mfaEnrollmentEnabled)
      void requireMfaProtection(client)
        .then(() => {
          if (active && generation.current === stamp) setServerReady(true);
        })
        .catch(() => {
          if (active && generation.current === stamp) setServerReady(false);
        });
    return () => {
      active = false;
    };
  }, [client, userId, revision]);
  const guard = (stamp: number) => () =>
    mounted.current && generation.current === stamp && navigator.onLine;
  const close = () => {
    ++generation.current;
    setPending(null);
    setRemoving(null);
    setCode("");
    setBusy(false);
    setError("");
  };
  async function enroll() {
    if (!client || busy) return;
    const stamp = ++generation.current,
      isCurrent = guard(stamp);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await beginTotp(client, userId, isCurrent);
      if (isCurrent()) {
        setPending(result);
        setCode("");
      }
    } catch (e) {
      if (isCurrent()) {
        setError(mfaErrorMessage(e));
        setRevision((n) => n + 1);
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!client || !pending || busy) return;
    const stamp = generation.current,
      isCurrent = guard(stamp),
      submitted = code;
    setCode("");
    setBusy(true);
    setError("");
    try {
      const next = await verifyTotp(
        client,
        userId,
        pending.id,
        submitted,
        isCurrent,
        true,
      );
      if (!isCurrent()) return;
      setState(next);
      setPending(null);
      setMessage(
        "Autenticador verificado. Ya puedes usar sus códigos para esta cuenta.",
      );
    } catch (e) {
      if (isCurrent()) setError(mfaErrorMessage(e));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  async function remove() {
    if (!client || !removing || busy) return;
    const stamp = generation.current,
      isCurrent = guard(stamp);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await removeTotp(client, userId, removing.id, isCurrent);
    } catch (e) {
      if (isCurrent()) setError(mfaErrorMessage(e));
    } finally {
      if (isCurrent()) {
        setBusy(false);
        setRemoving(null);
        setRevision((n) => n + 1);
      }
    }
  }
  const qr = pending ? safeTotpQr(pending.qrCode) : null;
  return (
    <section
      className="card settings-card mfa-settings"
      aria-labelledby="mfa-settings-title"
    >
      <span className="settings-icon">
        <ShieldCheck size={25} aria-hidden="true" />
      </span>
      <h2 id="mfa-settings-title">Seguridad de la cuenta</h2>
      <p>
        Añade una aplicación de autenticación a tu contraseña. Un segundo
        autenticador puede servirte de respaldo si pierdes el primero.
      </p>
      <p>
        Esta configuración pertenece a tu cuenta y se comparte entre tus
        empresas.
      </p>
      {state ? (
        <>
          <Badge tone={state.factors.length ? "green" : "neutral"}>
            {state.factors.length
              ? "Autenticadores verificados"
              : "Sin autenticadores verificados"}
          </Badge>
          {state.factors.length > 0 && (
            <ul className="mfa-factor-list">
              {state.factors.map((factor, index) => (
                <li key={factor.id}>
                  <span>
                    {factor.friendly_name || `Autenticador ${index + 1}`}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={busy || !navigator.onLine}
                    onClick={() => {
                      setError("");
                      setMessage("");
                      setRemoving(factor);
                    }}
                  >
                    Quitar autenticador
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p role="status">Comprobando autenticadores…</p>
      )}
      {!mfaEnrollmentEnabled ? (
        <p>
          La activación de nuevos autenticadores todavía no está disponible.
        </p>
      ) : !serverReady ? (
        <p>
          La protección del servidor todavía no está disponible. No se ha
          activado ningún autenticador nuevo.
        </p>
      ) : (
        <p>
          La protección del servidor se volverá a comprobar antes de activar el
          autenticador.
        </p>
      )}
      <div className="access-links">
        {mfaEnrollmentEnabled && (
          <Button
            disabled={busy || !state || !serverReady || !navigator.onLine}
            onClick={() => void enroll()}
          >
            {state?.factors.length
              ? "Añadir autenticador de respaldo"
              : "Añadir autenticador"}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy || !navigator.onLine}
          onClick={() => {
            close();
            setRevision((n) => n + 1);
          }}
        >
          Comprobar autenticadores
        </Button>
      </div>
      {error && !pending && !removing && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="access-message" role="status">
          {message}
        </p>
      )}
      {pending && (
        <Modal
          title="Configura tu autenticador"
          onClose={close}
          allowAppearance={false}
        >
          <p>
            Escanea este código con tu aplicación de autenticación o introduce
            la clave manualmente. Guarda la clave en un lugar privado.
          </p>
          {qr && (
            <img
              className="mfa-qr"
              src={qr}
              alt="Código QR para tu aplicación de autenticación"
            />
          )}
          <Field label="Clave de configuración">
            <code className="mfa-secret" translate="no">
              {pending.secret}
            </code>
          </Field>
          <p>
            Verificar un autenticador cerrará las otras sesiones de esta cuenta.
            Cerrar esta ventana borra la clave de la pantalla; solo un código
            confirmado activa el autenticador.
          </p>
          <form onSubmit={(event) => void verify(event)}>
            <TotpCodeField value={code} onChange={setCode} disabled={busy} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button variant="secondary" onClick={close}>
                Cancelar configuración
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6}>
                Verificar autenticador
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="¿Quitar este autenticador?"
          onClose={close}
          allowAppearance={false}
        >
          <p>
            Necesitas una sesión confirmada con un código de autenticación. Si
            queda otro autenticador, tendrás que confirmar uno de sus códigos
            para continuar.
          </p>
          {state?.factors.length === 1 && (
            <p>
              Al quitar el último autenticador, la cuenta volverá al acceso con
              contraseña. Añade antes un respaldo si quieres conservar el
              segundo paso.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Sí, quitar autenticador
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
