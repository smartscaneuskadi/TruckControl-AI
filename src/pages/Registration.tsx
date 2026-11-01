import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Mail,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button, Field } from "../components/ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import { exampleCatalog, registrationSchema } from "../domain/subscriptions";
import type {
  Catalog,
  Plan,
  SubscriptionAccess,
} from "../domain/subscriptions";
import { money } from "../lib/format";
import { errorMessage } from "../app/FleetProvider";
import { isCandidateRelease } from "../domain/release";
import { customAuthMail } from "../integrations/supabase/auth-mail";
import { legalVersion } from "../domain/legal";
import { LegalLinks } from "../components/LegalPage";
import { CompleteRegistration } from "../components/CompleteRegistration";

export function Registration({
  initialView = "login",
  plan = "limited",
  recovery = false,
  onRecovered,
  onBack,
}: {
  initialView?: "login" | "signup";
  plan?: Plan["id"];
  recovery?: boolean;
  onRecovered(): void;
  onBack(): void;
}) {
  const client = getSupabaseClient();
  const [view, setView] = useState<"login" | "signup" | "reset">(initialView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [catalog, setCatalog] = useState<Catalog>(exampleCatalog);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.rpc("tc_public_catalog", {}).then(({ data, error }) => {
      if (active && data && !error) setCatalog(data as unknown as Catalog);
    });
    return () => {
      active = false;
    };
  }, [client]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    const text = (key: string) =>
      key === "password"
        ? String(data.get(key) ?? "")
        : String(data.get(key) ?? "").trim();
    const redirect = location.origin + location.pathname;
    try {
      if (recovery) {
        const { error } = await client.auth.updateUser({
          password: text("password"),
        });
        if (error) throw error;
        onRecovered();
      } else if (view === "signup") {
        const registration = registrationSchema.parse({
          contact_name: text("contact_name"),
          company_name: text("company_name"),
          tax_id: text("tax_id"),
          address: text("address"),
          phone: text("phone").replace(/[ ()-]/g, ""),
          requested_plan: text("plan"),
        });
        const { error } = customAuthMail
          ? await client.functions.invoke("company-auth", {
              body: {
                action: "signup",
                email: text("email"),
                registration,
                terms_accepted: data.get("legal_consent") === "on",
                terms_version: legalVersion,
              },
            })
          : await client.auth.signUp({
              email: text("email"),
              password: text("password"),
              options: {
                emailRedirectTo: redirect,
                data: { truckcontrol_registration: registration },
              },
            });
        if (error) throw error;
        setMessage(
          "Solicitud recibida. Confirma tu correo con el enlace que recibirás si procede. Tu empresa se activará después de completar las verificaciones indicadas.",
        );
      } else if (view === "reset") {
        const { error } = customAuthMail
          ? await client.functions.invoke("company-auth", {
              body: { action: "recovery", email: text("email") },
            })
          : await client.auth.resetPasswordForEmail(text("email"), {
              redirectTo: redirect,
            });
        if (error) throw error;
        setMessage(
          "Si existe una cuenta con ese correo, recibirás un enlace para recuperar el acceso.",
        );
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: text("email"),
          password: text("password"),
        });
        if (error) throw error;
      }
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String(e.code) : "";
      setError(
        e && typeof e === "object" && "issues" in e
          ? "Revisa los datos y escribe el teléfono con prefijo internacional, por ejemplo +34."
          : code === "email_not_confirmed"
            ? "Confirma el correo antes de entrar."
            : code === "invalid_credentials"
              ? "El correo o la contraseña no son correctos."
              : "No se ha podido completar la solicitud. Comprueba tus datos y la conexión. El envío de mensajes debe estar habilitado por el administrador.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (isCandidateRelease)
    return (
      <main className="registration-page">
        <section className="card registration-card">
          <h1>Acceso comercial en preparación</h1>
          <p>
            Esta candidata permite explorar la aplicación con datos ficticios.
            Las cuentas de clientes se abrirán después de verificar correo,
            dominio y seguridad.
          </p>
          <Button onClick={onBack}>Volver a la entrada</Button>
        </section>
      </main>
    );
  return (
    <main className="registration-page">
      <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
        Volver a los planes
      </Button>
      <section className="card registration-card">
        <div className="registration-heading">
          <span className="settings-icon">
            <Building2 size={26} />
          </span>
          <div>
            <p className="eyebrow">TRUCKCONTROL AI</p>
            <h1>
              {recovery
                ? "Recupera tu acceso"
                : view === "signup"
                  ? "Tu empresa empieza aquí"
                  : view === "reset"
                    ? "Recuperar contraseña"
                    : "Bienvenido a TruckControl"}
            </h1>
          </div>
        </div>
        {view === "signup" && !recovery && (
          <p>
            {catalog.trial_days} días gratis con acceso Full. Tu prueba
            comenzará al confirmar
            {catalog.sms_ready ? " correo y teléfono" : " tu correo"}. Después
            podrás elegir el plan que prefieras.
          </p>
        )}
        <form onSubmit={submit} className="access-form">
          <div className="registration-fields">
            {view === "signup" && !recovery && (
              <>
                <Field label="Nombre y apellidos">
                  <input
                    name="contact_name"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    disabled={busy}
                  />
                </Field>
                <Field label="Nombre de la empresa">
                  <input
                    name="company_name"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="organization"
                    disabled={busy}
                  />
                </Field>
                <Field label="NIF / CIF de la empresa">
                  <input
                    name="tax_id"
                    required
                    minLength={3}
                    maxLength={30}
                    disabled={busy}
                  />
                </Field>
                <Field label="Dirección fiscal">
                  <input
                    name="address"
                    required
                    minLength={5}
                    maxLength={240}
                    autoComplete="street-address"
                    disabled={busy}
                  />
                </Field>
                <Field label="Teléfono móvil con prefijo">
                  <input
                    name="phone"
                    type="tel"
                    required
                    placeholder="+34 600 000 000"
                    autoComplete="tel"
                    disabled={busy}
                  />
                </Field>
                <Field label="Plan de interés tras la prueba">
                  <select name="plan" defaultValue={plan} disabled={busy}>
                    {catalog.plans
                      .filter((p) => p.published !== false)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ·{" "}
                          {catalog.prices_are_examples ? "ejemplo " : ""}
                          {money(p.monthly_cents, p.monthly_cents % 100 !== 0)}
                          /mes + 21 % IVA
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
            {!recovery && (
              <Field label="Correo electrónico">
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  disabled={busy}
                />
              </Field>
            )}
            {(recovery ||
              (view !== "reset" && !(view === "signup" && customAuthMail))) && (
              <Field label="Contraseña">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete={
                    view === "signup" || recovery
                      ? "new-password"
                      : "current-password"
                  }
                  disabled={busy}
                />
                <small>Al menos 12 caracteres.</small>
              </Field>
            )}
          </div>
          {view === "signup" && !recovery && customAuthMail && (
            <label className="checkbox-line">
              <input
                type="checkbox"
                name="legal_consent"
                required
                disabled={busy}
              />{" "}
              He leído la privacidad y acepto las condiciones del servicio y del
              encargo de tratamiento para mi empresa. Declaro estar autorizado
              para representarla.
            </label>
          )}
          <LegalLinks />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="access-message">
              {message}
            </p>
          )}
          <Button type="submit" disabled={busy || !client}>
            {busy
              ? "Un momento…"
              : recovery
                ? "Guardar contraseña"
                : view === "signup"
                  ? `Solicitar prueba Full de ${catalog.trial_days} días`
                  : view === "reset"
                    ? "Enviar enlace de recuperación"
                    : "Entrar"}
          </Button>
          {!client && (
            <p role="alert">
              El acceso está pendiente de conexión. Puedes seguir explorando la
              demo.
            </p>
          )}
          {!recovery && (
            <div className="access-links">
              <Button
                variant="ghost"
                onClick={() => {
                  setView(view === "signup" ? "login" : "signup");
                  setError("");
                  setMessage("");
                }}
              >
                {view === "signup"
                  ? "Ya tengo cuenta · entrar"
                  : `Crear cuenta · ${catalog.trial_days} días gratis`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setView(view === "reset" ? "login" : "reset")}
              >
                {view === "reset"
                  ? "Volver al acceso"
                  : "He olvidado la contraseña"}
              </Button>
            </div>
          )}
        </form>
        <div className="registration-security">
          <ShieldCheck size={18} />
          <span>
            Confirmamos tu correo antes de activar la empresa. La verificación
            por SMS se solicita cuando está habilitada. Cada empresa tiene sus
            propios datos y conexión de correo opcional.
          </span>
        </div>
      </section>
    </main>
  );
}

export function PhoneVerification({
  user,
  access,
  onComplete,
  onSignOut,
}: {
  user: User;
  access: SubscriptionAccess;
  onComplete(): void;
  onSignOut(): Promise<void>;
}) {
  const client = getSupabaseClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const phone =
    typeof user.user_metadata?.truckcontrol_registration?.phone === "string"
      ? String(user.user_metadata.truckcontrol_registration.phone)
      : "";
  async function send() {
    if (!client || busy || !access.sms_ready || !phone) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.updateUser({ phone });
      if (error) throw error;
      sessionStorage.setItem(`tc-sms:${user.id}`, String(Date.now()));
      setMessage(
        "Te hemos enviado un código por SMS. Escríbelo para activar tu empresa.",
      );
    } catch {
      setError(
        "No se ha podido enviar el SMS. Comprueba el teléfono y espera un minuto antes de reintentarlo.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!access.sms_ready || !phone) return;
    let previous = 0;
    try {
      previous = Number(sessionStorage.getItem(`tc-sms:${user.id}`) ?? 0);
    } catch {
      /* Optional preference. */
    }
    if (Date.now() - previous < 600000) return;
    // Mark before starting to avoid duplicate sends in React StrictMode.
    try {
      sessionStorage.setItem(`tc-sms:${user.id}`, String(Date.now()));
    } catch {
      /* Auth also enforces rate limits. */
    }
    void send();
    // The automatic request belongs to this verified identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, access.sms_ready, phone]);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.verifyOtp({
        phone,
        token: code,
        type: "phone_change",
      });
      if (error) throw error;
      const finished = await client.rpc("tc_finish_registration", {});
      if (finished.error) throw finished.error;
      onComplete();
    } catch {
      setError(
        "El código no es válido o ha caducado. Solicita otro SMS e inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (customAuthMail && !access.profile && !access.sms_ready)
    return (
      <CompleteRegistration
        user={user}
        onComplete={onComplete}
        onSignOut={onSignOut}
      />
    );
  return (
    <main className="registration-page">
      <section className="card registration-card">
        <span className="settings-icon">
          <Smartphone size={28} />
        </span>
        <h1>Verifica tu teléfono</h1>
        <p className="verification-done">
          <CheckCircle2 size={18} />
          Correo confirmado: {user.email}
        </p>
        <p>
          El último paso para crear automáticamente tu empresa es confirmar el
          teléfono {phone || "de tu solicitud"}.
        </p>
        {!phone ? (
          <p role="alert">
            Tu solicitud no incluye un teléfono válido. Contacta con el
            administrador para completar el registro.
          </p>
        ) : !access.sms_ready ? (
          <div className="setup-notice">
            <Mail size={22} />
            <p>
              Tu solicitud está guardada. El servicio de verificación por SMS
              está pendiente de activación. Tu prueba gratuita todavía no ha
              comenzado.
            </p>
          </div>
        ) : (
          <form className="access-form" onSubmit={verify}>
            <Field label="Código recibido por SMS">
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                disabled={busy}
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Verificando…" : "Confirmar y activar mi empresa"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void send()}
            >
              Reenviar SMS
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <div className="access-links">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void onSignOut().catch((e) => setError(errorMessage(e)))
            }
          >
            Cerrar sesión
          </Button>
        </div>
      </section>
    </main>
  );
}
