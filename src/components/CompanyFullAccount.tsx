import type { SubscriptionAccess } from "../domain/subscriptions";
import { fullStatusLabel } from "../domain/company-full";
import { useCompany } from "../app/CompanyAccess";
import { CompanySelection, Invitations } from "../pages/Team";
import { currentLocale } from "../i18n/runtime";
import { Badge, Button } from "./ui";
export function CompanyFullAccount({
  access,
  expired,
  error,
  onRefresh,
  onBack,
  onSignOut,
}: {
  access: SubscriptionAccess;
  expired: boolean;
  error: string;
  onRefresh(): void;
  onBack?: () => void;
  onSignOut(): Promise<void>;
}) {
  const company = useCompany(),
    state = access.manual_full!;
  const status = expired ? "Vencido" : fullStatusLabel(state);
  const active =
    access.active && !expired && state.status === "active" && !error;
  return (
    <main className="billing-page company-full-account">
      <CompanySelection />
      <Invitations />
      <section className="card registration-card">
        <p className="eyebrow">TU EMPRESA</p>
        <h1>Pack Full de tu empresa</h1>
        <p>{company.organization?.name ?? access.profile?.company_name}</p>
        <p>{company.user?.email}</p>
        <Badge
          tone={
            active
              ? "green"
              : expired || state.status === "expired"
                ? "amber"
                : "neutral"
          }
        >
          {status}
        </Badge>
        {access.observed_at && (
          <p>
            Estado comprobado:{" "}
            {new Intl.DateTimeFormat(currentLocale(), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            }).format(new Date(access.observed_at))}{" "}
            UTC
          </p>
        )}
        {state.expires_at && (
          <p>
            Vencimiento:{" "}
            {new Intl.DateTimeFormat(currentLocale(), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            }).format(new Date(state.expires_at))}{" "}
            UTC
          </p>
        )}
        {!state.expires_at && state.enabled && <p>Sin vencimiento</p>}
        <p>
          {active
            ? "Tu empresa tiene activados los módulos Full mediante una licencia manual."
            : "El acceso comercial está bloqueado. La empresa y sus datos se conservan; el administrador de TruckControl puede reactivar el acceso."}
        </p>
        <p>
          Las conexiones, autorizaciones y límites de los servicios se
          mantienen.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="access-links">
          {onBack && access.active && !expired && !error && (
            <Button onClick={onBack}>Volver a mi empresa</Button>
          )}
          <Button variant="secondary" onClick={onRefresh}>
            Comprobar acceso
          </Button>
          <Button
            variant="ghost"
            onClick={() => void onSignOut().catch(() => {})}
          >
            Cerrar sesión
          </Button>
        </div>
      </section>
    </main>
  );
}
