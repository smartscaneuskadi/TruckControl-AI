import { ArrowDownLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useFleet } from "../app/FleetProvider";
import { FeatureGate, useSubscription } from "../app/SubscriptionContext";
import { useWorkspace } from "../app/WorkspaceContext";
import { PageHeading, PeriodPicker } from "../components/ui";
import { filterEntries, summarize } from "../domain/finance";
import { money, monthLabel } from "../lib/format";
import { t } from "../i18n/runtime";
import "../styles/billing.css";

const sections = [
  { to: "/income", label: "Ingresos", feature: "income", icon: ArrowUpRight },
  {
    to: "/expenses",
    label: "Gastos",
    feature: "expenses",
    icon: ArrowDownLeft,
  },
] as const;

export function BillingNavigation() {
  const subscription = useSubscription();
  return (
    <nav className="billing-tabs" aria-label="Apartados de facturación">
      <Link
        to="/billing"
        className="billing-overview-link"
        aria-label="Ver resumen de facturación"
      >
        Facturación
      </Link>
      {sections
        .filter(
          (section) =>
            !subscription.enabled || subscription.features[section.feature],
        )
        .map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            aria-label={
              section.feature === "income"
                ? "Ver ingresos de facturación"
                : "Ver gastos de facturación"
            }
            className={({ isActive }) =>
              `billing-tab ${isActive ? "active" : ""}`
            }
          >
            <section.icon size={17} aria-hidden="true" />
            {t(section.label)}
          </NavLink>
        ))}
    </nav>
  );
}

export function Billing() {
  const { snapshot } = useFleet();
  const { period, setPeriod } = useWorkspace();
  const subscription = useSubscription();
  const summary = summarize(filterEntries(snapshot.entries, period));
  return (
    <FeatureGate feature={subscription.features.income ? "income" : "expenses"}>
      <PageHeading
        eyebrow="CONTROL ECONÓMICO"
        title="Facturación"
        description="Consulta tus ingresos y gastos, y organiza las facturas, tickets y albaranes de cada movimiento."
      />
      <div className="overview-toolbar">
        <div className="section-label">
          Ingresos y gastos
          <span className="toolbar-note">
            {monthLabel(period)} · importes sin IVA
          </span>
        </div>
        <PeriodPicker snapshot={snapshot} value={period} onChange={setPeriod} />
      </div>
      <nav className="billing-sections" aria-label="Apartados de facturación">
        {sections
          .filter(
            (section) =>
              !subscription.enabled || subscription.features[section.feature],
          )
          .map((section) => {
            const income = section.feature === "income";
            return (
              <Link
                key={section.to}
                to={section.to}
                className="card billing-section"
                aria-label={
                  section.feature === "income"
                    ? "Ver ingresos de facturación"
                    : "Ver gastos de facturación"
                }
              >
                <span className="billing-section-icon">
                  <section.icon size={23} aria-hidden="true" />
                </span>
                <h2>{t(section.label)}</h2>
                <strong className="billing-section-total">
                  {money(
                    income ? summary.incomeCents : summary.expenseCents,
                    true,
                  )}
                </strong>
                <p>
                  {money(
                    income
                      ? summary.pendingIncomeCents
                      : summary.pendingExpenseCents,
                    true,
                  )}{" "}
                  {income ? "pendientes de cobro" : "pendientes de pago"}
                </p>
                <span className="billing-section-action">
                  {income ? "Consultar ingresos" : "Consultar gastos"}
                  <ArrowRight size={17} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
      </nav>
      <p className="billing-note">
        La clasificación y los adjuntos acompañan al registro económico. Los
        importes conservan su base sin IVA.
      </p>
    </FeatureGate>
  );
}
