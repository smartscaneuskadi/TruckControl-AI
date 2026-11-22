import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, CreditCard, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import { Button } from "../components/ui";
import { SubscriptionProvider } from "./SubscriptionContext";
import { Registration, PhoneVerification } from "../pages/Registration";
import { PlanCards } from "../pages/PublicPortal";
import { SubscriptionBillingDetails } from "../components/SubscriptionBillingDetails";
import { CompanySelection, Invitations } from "../pages/Team";
import {
  RecurringSubscription,
  useRecurringSubscription,
} from "../components/RecurringSubscription";
import { exampleCatalog, trialDaysLeft } from "../domain/subscriptions";
import type {
  Catalog,
  Plan,
  SubscriptionAccess,
} from "../domain/subscriptions";
import { assertCompanyFullPlan, fullExpiryDeadline, watchFullExpiry } from "../domain/company-full";
import { endPrivateSessions } from "./session-events";
const AdminConsole = lazy(() => import("../pages/AdminConsole").then((module) => ({ default: module.AdminConsole })));
const CompanyFullAccount = lazy(() => import("../components/CompanyFullAccount").then((module) => ({ default: module.CompanyFullAccount })));

export function CommercialSession({
  children,
  user,
  organizationId,
  initialView,
  plan,
  recovery,
  onRecovered,
  onProvisioned,
  onBack,
  onDemo,
  onSignOut,
  companiesReady = true,
  companyError = "",
  onRetryCompanies,
}: {
  children: ReactNode;
  user: User | null;
  organizationId?: string;
  initialView: "login" | "signup";
  plan: Plan["id"];
  recovery: boolean;
  onRecovered(): void;
  onProvisioned(): void;
  onBack(): void;
  onDemo(): void;
  onSignOut(): Promise<void>;
  companiesReady?: boolean;
  companyError?: string;
  onRetryCompanies?(): void;
}) {
  const client = getSupabaseClient();
  const [access, setAccess] = useState<SubscriptionAccess | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState(false);
  const [expired, setExpired] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const currentAccess = useRef<SubscriptionAccess | null>(null);
  currentAccess.current = access;
  const ready = useRef(false);
  useEffect(() => {
    if (!client || !user || recovery) return;
    let active = true;
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const unavailable = () => {
      if (!active) return;
      setError("No se pueden comprobar los permisos de tu cuenta. Reintenta la conexión.");
      if (currentAccess.current?.is_admin) { setAccess(null); setDeadline(null); endPrivateSessions(); }
      if (currentAccess.current?.manual_full?.configured) { setVerificationFailed(true); endPrivateSessions(); }
    };
    void (async () => {
      const initial = await client.rpc("tc_finish_registration", {}).abortSignal(controller.signal);
      if (!active) return null;
      if (
        initial.error ||
        !initial.data ||
        (initial.data as unknown as SubscriptionAccess).is_admin
      )
        return initial;
      // Global administration depends on the verified bootstrap role. Company
      // access must wait for membership discovery and the selected company.
      if (!companiesReady || currentAccess.current?.is_admin) {
        if (currentAccess.current) endPrivateSessions();
        setAccess(null); setDeadline(null); setExpired(false); setVerificationFailed(false);
        ready.current = false;
        if (!companiesReady) return null;
      }
      if (!organizationId) return initial;
      return client.rpc("tc_organization_access", { p_org: organizationId }).abortSignal(controller.signal);
    })().then((result) => {
      if (!active || !result) return;
      const { data, error } = result;
      if (error || !data) {
        unavailable();
        return;
      }
      const next = data as unknown as SubscriptionAccess;
      try {
        if (!next.is_admin) {
          const state = assertCompanyFullPlan(next, organizationId);
          if (currentAccess.current?.manual_full?.configured && state === undefined) throw Error();
        }
      }
      catch {
        setError("No se puede comprobar el acceso de esta empresa. Comprueba la conexión y reinténtalo.");
        setVerificationFailed(true); endPrivateSessions(); return;
      }
      const previous = currentAccess.current;
      if (!next.is_admin && previous?.active && !next.active) endPrivateSessions();
      setAccess(next);
      setVerificationFailed(false);
      const expires = next.is_admin ? null : fullExpiryDeadline(next.manual_full, next.observed_at, started);
      setDeadline(expires); setExpired(expires !== null && expires <= performance.now());
      setError("");
      if (next.active && !next.is_admin && !ready.current) {
        ready.current = true;
        onProvisioned();
      }
    }).catch(unavailable).finally(() => clearTimeout(timeout));
    return () => {
      active = false; clearTimeout(timeout); controller.abort();
    };
  }, [client, user?.id, organizationId, revision, companiesReady, recovery]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => { if (!document.hidden && navigator.onLine) setRevision((n) => n + 1); }, access?.manual_full?.configured ? 15000 : 60000);
    const refresh = () => {
      if (!document.hidden) {
        if (deadline !== null && performance.now() >= deadline) { setExpired(true); endPrivateSessions(); }
        setRevision((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [user?.id, access?.manual_full?.configured, deadline]);
  useEffect(() => {
    if (deadline === null) return;
    return watchFullExpiry(deadline, () => {
      setExpired(true); endPrivateSessions(); setRevision((n) => n + 1);
    });
  }, [deadline]);
  if (!user || recovery)
    return (
      <Registration
        initialView={initialView}
        plan={plan}
        recovery={recovery}
        onRecovered={onRecovered}
        onBack={onBack}
      />
    );
  if (!access || (verificationFailed && !access.manual_full?.configured))
    return (
      <main className="registration-page">
        <section className="card registration-card">
          <h1>Preparando tu acceso</h1>
          {error || companyError ? (
            <p role="alert" className="form-error">
              {error || companyError}
            </p>
          ) : (
            <p role="status">Comprobando cuenta, verificación y permisos…</p>
          )}
          <div className="access-links">
            <Button onClick={() => { setRevision((n) => n + 1); onRetryCompanies?.(); }}>
              Reintentar
            </Button>
            <Button variant="secondary" onClick={onBack}>
              Volver a la entrada
            </Button>
            <Button variant="ghost" onClick={() => void onSignOut()}>
              Cerrar sesión
            </Button>
          </div>
        </section>
      </main>
    );
  if (access.is_admin)
    return (
      <Suspense fallback={<p role="status">Comprobando cuenta, verificación y permisos…</p>}><AdminConsole
        userId={user.id}
        email={user.email ?? "Administrador"}
        onSignOut={onSignOut}
        onDemo={onDemo}
      />
      </Suspense>
    );
  if (!user.email_confirmed_at)
    return (
      <main className="registration-page">
        <section className="card registration-card">
          <h1>Confirma tu correo</h1>
          <p>
            Abre el enlace del correo de confirmación antes de activar la
            empresa.
          </p>
          <Button variant="secondary" onClick={() => void onSignOut()}>
            Volver al acceso
          </Button>
        </section>
      </main>
    );
  const manualAccount = (
    <Suspense
      fallback={
        <p role="status">Comprobando cuenta, verificación y permisos…</p>
      }
    >
      <CompanyFullAccount
        access={access}
        expired={expired}
        error={verificationFailed ? error : ""}
        onRefresh={() => setRevision((n) => n + 1)}
        onBack={
          access.active && !expired && !verificationFailed
            ? () => setBilling(false)
            : undefined
        }
        onSignOut={onSignOut}
      />
    </Suspense>
  );
  if (
    access.manual_full?.configured &&
    (!access.active || expired || verificationFailed)
  )
    return manualAccount;
  if (!access.profile || access.requires_phone_verification)
    return (
      <PhoneVerification
        user={user}
        access={access}
        onComplete={() => {
          setRevision((n) => n + 1);
          onProvisioned();
        }}
        onSignOut={onSignOut}
      />
    );
  if (access.manual_full?.configured && billing) return manualAccount;
  if (!access.active || billing)
    return (
      <Billing
        access={access}
        onClose={access.active ? () => setBilling(false) : undefined}
        onSignOut={onSignOut}
        onRefresh={() => setRevision((n) => n + 1)}
      />
    );
  return (
    <SubscriptionProvider
      value={{
        enabled: true,
        features: access.features,
        access,
        refresh: () => setRevision((n) => n + 1),
        openPlans: () => setBilling(true),
      }}
    >
      {children}
    </SubscriptionProvider>
  );
}

export function Billing({
  access,
  onClose,
  onSignOut,
  onRefresh,
}: {
  access: SubscriptionAccess;
  onClose?: () => void;
  onSignOut(): Promise<void>;
  onRefresh(): void;
}) {
  const client = getSupabaseClient();
  const [catalog, setCatalog] = useState<Catalog>(exampleCatalog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [acceptedTermsVersion, setAcceptedTermsVersion] = useState<
    string | null
  >(null);
  const recurring = useRecurringSubscription(access.profile?.user_id ?? "");
  const termsAccepted = Boolean(
    recurring.status?.terms_version &&
    acceptedTermsVersion === recurring.status.terms_version,
  );
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
  async function choose(plan: Plan["id"]) {
    if (!client || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (
        catalog.payments_enabled &&
        !catalog.prices_are_examples &&
        (!recurring.status?.configured ||
          !recurring.status.invoice_delivery_ready ||
          !recurring.status.terms_version ||
          !termsAccepted)
      )
        throw new Error(
          "Para contratar, debe estar disponible la pasarela y debes aceptar las condiciones de renovación mensual.",
        );
      const { data, error } = await client.rpc("tc_request_plan", {
        p_plan_id: plan,
      });
      if (error || !data)
        throw new Error("No se ha podido guardar la solicitud de plan.");
      if (catalog.payments_enabled && !catalog.prices_are_examples) {
        const checkout = await client.functions.invoke<{ url?: string }>(
          "truckcontrol-subscriptions",
          {
            body: {
              action: "checkout",
              request_id: data,
              terms_accepted: termsAccepted,
              terms_version: acceptedTermsVersion,
            },
          },
        );
        if (checkout.error || !checkout.data?.url)
          throw new Error(
            "Tu solicitud está guardada. El procesador de pagos todavía no está disponible.",
          );
        const url = new URL(checkout.data.url);
        if (
          url.origin !== "https://checkout.stripe.com" ||
          url.username ||
          url.password
        )
          throw new Error("No se ha recibido una página de pago válida.");
        location.assign(url.href);
      } else
        setMessage(
          `Solicitud del plan ${plan === "full" ? "Full" : "Básico"} guardada. Los cobros están desactivados; no se ha realizado ningún cargo.`,
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se ha podido completar la solicitud.",
      );
    } finally {
      setBusy(false);
    }
  }
  const profile = access.profile!;
  return (
    <main className="billing-page">
      <CompanySelection />
      <Invitations />
      <div className="billing-nav">
        {onClose && (
          <Button variant="ghost" icon={ArrowLeft} onClick={onClose}>
            Volver a mi empresa
          </Button>
        )}
        <Button variant="ghost" onClick={() => void onSignOut()}>
          Cerrar sesión
        </Button>
      </div>
      <div className="portal-section-heading">
        <p className="eyebrow">TU CUENTA Y TU PLAN</p>
        <h1>
          {profile.status === "suspended"
            ? "Tu cuenta está suspendida"
            : !access.active
              ? "Elige cómo quieres continuar"
              : "Tu empresa sigue avanzando"}
        </h1>
        <p>
          {profile.company_name} · {profile.email}
        </p>
        <p>
          {profile.status === "suspended"
            ? "Contacta con el administrador para revisar el acceso. Tus datos se conservan."
            : profile.status === "trial"
              ? access.active
                ? `Quedan ${trialDaysLeft(profile.trial_ends_at)} días de prueba ${access.plan === "limited" ? "del plan Básico" : "Full"}.`
                : "Tu prueba gratuita ha terminado. Elige un plan para continuar usando la plataforma."
              : `Acceso contratado hasta ${profile.paid_until ? new Date(profile.paid_until).toLocaleDateString("es-ES") : "confirmar el pago"}.`}
        </p>
      </div>
      {catalog.prices_are_examples && (
        <div className="setup-notice">
          <CreditCard size={23} />
          <p>
            Los planes muestran precios de ejemplo. Puedes solicitar el que
            prefieras; los cobros reales están desactivados.
          </p>
        </div>
      )}
      <RecurringSubscription
        status={recurring.status}
        canResume={
          catalog.payments_enabled &&
          !catalog.prices_are_examples &&
          recurring.status?.invoice_delivery_ready === true
        }
        onRefresh={recurring.refresh}
      />
      <SubscriptionBillingDetails
        customer={profile}
        automaticInvoicesReady={
          recurring.status?.invoice_delivery_ready === true
        }
      />
      {catalog.payments_enabled && !catalog.prices_are_examples && (
        <div className="card settings-card">
          {recurring.status?.configured &&
          recurring.status.invoice_delivery_ready &&
          recurring.status.terms_url ? (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) =>
                  setAcceptedTermsVersion(
                    e.target.checked
                      ? (recurring.status?.terms_version ?? null)
                      : null,
                  )
                }
              />
              <span>
                Acepto la{" "}
                <a
                  href={recurring.status.terms_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  renovación mensual y sus condiciones
                </a>
                . Podré cancelar futuras renovaciones. El precio y la primera
                fecha de cobro se confirman antes de pagar.
              </span>
            </label>
          ) : (
            <p>
              La contratación mensual todavía no está disponible. No se
              realizará ningún cargo.
            </p>
          )}
        </div>
      )}
      <PlanCards
        catalog={catalog}
        existingCustomer
        disabled={
          busy ||
          profile.status === "suspended" ||
          (catalog.payments_enabled &&
            !catalog.prices_are_examples &&
            (recurring.loading ||
              !recurring.status?.configured ||
              !recurring.status.invoice_delivery_ready ||
              !termsAccepted ||
              Boolean(
                recurring.status.subscription &&
                !["canceled", "incomplete_expired"].includes(
                  recurring.status.subscription.state,
                ),
              )))
        }
        onChoose={(plan) => void choose(plan)}
      />
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
      <div className="billing-security">
        <ShieldCheck size={18} />
        <span>
          La activación requiere un pago confirmado o la autorización de tu
          administrador. Volver de una página de pago no activa la cuenta por sí
          solo.
        </span>
      </div>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          recurring.refresh();
          onRefresh();
        }}
      >
        Comprobar estado de mi cuenta
      </Button>
    </main>
  );
}
