import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, CreditCard, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import { Button } from "../components/ui";
import { SubscriptionProvider } from "./SubscriptionContext";
import { Registration, PhoneVerification } from "../pages/Registration";
import { AdminConsole } from "../pages/AdminConsole";
import { PlanCards } from "../pages/PublicPortal";
import { CompanySelection, Invitations } from "../pages/Team";
import { exampleCatalog, trialDaysLeft } from "../domain/subscriptions";
import type {
  Catalog,
  Plan,
  SubscriptionAccess,
} from "../domain/subscriptions";

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
}) {
  const client = getSupabaseClient();
  const [access, setAccess] = useState<SubscriptionAccess | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState(false);
  const ready = useRef(false);
  useEffect(() => {
    if (!client || !user) return;
    let active = true;
    void (async () => {
      const initial = await client.rpc("tc_finish_registration", {});
      if (
        initial.error ||
        !initial.data ||
        (initial.data as unknown as SubscriptionAccess).is_admin ||
        !organizationId
      )
        return initial;
      return client.rpc("tc_organization_access", { p_org: organizationId });
    })().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        setError(
          "No se pueden comprobar los permisos de tu cuenta. Reintenta la conexión.",
        );
        return;
      }
      const next = data as unknown as SubscriptionAccess;
      setAccess(next);
      setError("");
      if (next.active && !next.is_admin && !ready.current) {
        ready.current = true;
        onProvisioned();
      }
    });
    return () => {
      active = false;
    };
  }, [client, user?.id, organizationId, revision]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => setRevision((n) => n + 1), 60000);
    const refresh = () => {
      if (!document.hidden) setRevision((n) => n + 1);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id]);
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
  if (!access)
    return (
      <main className="registration-page">
        <section className="card registration-card">
          <h1>Preparando tu acceso</h1>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : (
            <p role="status">Comprobando cuenta, verificación y permisos…</p>
          )}
          <div className="access-links">
            <Button onClick={() => setRevision((n) => n + 1)}>
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
      <AdminConsole
        email={user.email ?? "Administrador"}
        onSignOut={onSignOut}
        onDemo={onDemo}
      />
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
      const { data, error } = await client.rpc("tc_request_plan", {
        p_plan_id: plan,
      });
      if (error || !data)
        throw new Error("No se ha podido guardar la solicitud de plan.");
      if (catalog.payments_enabled && !catalog.prices_are_examples) {
        const checkout = await client.functions.invoke<{ url?: string }>(
          "truckcontrol-billing",
          { body: { action: "checkout", request_id: data } },
        );
        if (checkout.error || !checkout.data?.url)
          throw new Error(
            "Tu solicitud está guardada. El procesador de pagos todavía no está disponible.",
          );
        const url = new URL(checkout.data.url);
        if (url.origin !== "https://checkout.stripe.com")
          throw new Error("No se ha recibido una página de pago válida.");
        location.assign(url.href);
      } else
        setMessage(
          `Solicitud del plan ${plan === "full" ? "Full" : "Inicial"} guardada. Los precios son orientativos y los cobros están desactivados; no se ha realizado ningún cargo.`,
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
                ? `Quedan ${trialDaysLeft(profile.trial_ends_at)} días de prueba Full.`
                : "Tus treinta días de prueba han terminado. Elige un plan para continuar usando la plataforma."
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
      <PlanCards
        catalog={catalog}
        disabled={busy || profile.status === "suspended"}
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
      <Button variant="secondary" disabled={busy} onClick={onRefresh}>
        Comprobar estado de mi cuenta
      </Button>
    </main>
  );
}
