import { useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../integrations/supabase/client";
import { registrationSchema } from "../domain/subscriptions";
import { legalVersion } from "../domain/legal";
import { Button, Field } from "./ui";
import { LegalLinks } from "./LegalPage";
export function CompleteRegistration({
  user,
  onComplete,
  onSignOut,
}: {
  user: User;
  onComplete(): void;
  onSignOut(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const previous = user.user_metadata?.truckcontrol_registration ?? {};
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const registration = registrationSchema.parse(
        Object.fromEntries(
          [
            "contact_name",
            "company_name",
            "tax_id",
            "address",
            "phone",
            "requested_plan",
          ].map((k) => [k, String(form.get(k) ?? "").trim()]),
        ),
      );
      const { data, error } = await client.functions.invoke("company-auth", {
        body: {
          action: "complete_profile",
          registration,
          terms_accepted: form.get("legal_consent") === "on",
          terms_version: legalVersion,
        },
      });
      if (error || data?.completed !== true) throw Error();
      await client.auth.refreshSession();
      onComplete();
    } catch {
      setError(
        "No se ha podido completar la activación. Revisa los datos y comprueba que el registro esté disponible.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="registration-page">
      <section className="card registration-card">
        <h1>Completa tu empresa</h1>
        <p>
          Correo confirmado: {user.email}. Completa los datos y acepta las
          condiciones para activar la prueba.
        </p>
        <form className="access-form" onSubmit={submit}>
          {(
            [
              ["contact_name", "Nombre y apellidos"],
              ["company_name", "Nombre de la empresa"],
              ["tax_id", "NIF / CIF de la empresa"],
              ["address", "Dirección fiscal"],
              ["phone", "Teléfono móvil con prefijo"],
            ] as const
          ).map(([name, label]) => (
            <Field key={name} label={label}>
              <input
                name={name}
                required
                maxLength={
                  name === "address" ? 240 : name === "phone" ? 16 : 100
                }
                defaultValue={
                  typeof previous[name] === "string" ? previous[name] : ""
                }
                disabled={busy}
              />
            </Field>
          ))}
          <input
            type="hidden"
            name="requested_plan"
            value={previous.requested_plan === "full" ? "full" : "limited"}
          />
          <label className="checkbox-line">
            <input
              name="legal_consent"
              type="checkbox"
              required
              disabled={busy}
            />{" "}
            He leído la privacidad y acepto las condiciones y el encargo de
            tratamiento. Estoy autorizado para representar a la empresa.
          </label>
          <LegalLinks />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Comprobando…" : "Activar mi empresa"}
          </Button>
        </form>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void onSignOut()}
        >
          Cerrar sesión
        </Button>
      </section>
    </main>
  );
}
