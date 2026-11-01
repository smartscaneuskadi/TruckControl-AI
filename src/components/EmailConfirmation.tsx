import { useState } from "react";
import { getSupabaseClient } from "../integrations/supabase/client";
import type { EmailAction } from "../integrations/supabase/auth-mail";
import { Button } from "./ui";
export function EmailConfirmation({
  action,
  onComplete,
  onCancel,
}: {
  action: EmailAction;
  onComplete(): void;
  onCancel(): void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const client = getSupabaseClient();
      if (!client) throw Error();
      const { data, error } = await client.auth.verifyOtp(action);
      if (error || !data.session) throw Error();
      onComplete();
    } catch {
      setError(
        "El enlace ha caducado o ya se ha utilizado. Vuelve al acceso y solicita recuperar la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="registration-page">
      <section className="card registration-card">
        <p className="eyebrow">TRUCKCONTROL AI</p>
        <h1>
          {action.type === "recovery"
            ? "Recuperar tu cuenta"
            : "Confirmar tu correo"}
        </h1>
        <p>
          Continúa para verificar el enlace personal y elegir tu contraseña. Se
          abrirá la cuenta a la que se ha enviado este correo.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={() => void confirm()}>
          {busy ? "Comprobando…" : "Confirmar y continuar"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Volver al acceso
        </Button>
      </section>
    </main>
  );
}
