import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Gauge,
  Mail,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Badge, Button } from "../components/ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import { exampleCatalog, subscriptionPrice } from "../domain/subscriptions";
import type { Catalog, Plan } from "../domain/subscriptions";
import { money } from "../lib/format";
import { isCandidateRelease } from "../domain/release";

export function PlanCards({
  catalog,
  onChoose,
  disabled = false,
  existingCustomer = false,
}: {
  catalog: Catalog;
  onChoose(plan: Plan["id"]): void;
  disabled?: boolean;
  existingCustomer?: boolean;
}) {
  return (
    <div className="plan-grid">
      {catalog.plans
        .filter((p) => p.published !== false)
        .map((plan) => (
          <article
            className={`card plan-card ${plan.id === "full" ? "featured" : ""}`}
            key={plan.id}
          >
            <div className="plan-card-heading">
              <h3>{plan.name}</h3>
              <Badge tone={plan.id === "full" ? "green" : "blue"}>
                {plan.id === "full" ? "Toda la plataforma" : "Gestión esencial"}
              </Badge>
            </div>
            <p className="plan-price">
              {money(plan.monthly_cents, plan.monthly_cents % 100 !== 0)}
              <span>/mes</span>
            </p>
            <p className="plan-tax">+ 21 % IVA</p>
            <p className="plan-total">
              Total:{" "}
              {money(subscriptionPrice(plan.monthly_cents).totalCents, true)}
              /mes · IVA incluido
            </p>
            <p>
              {plan.id === "full"
                ? "Documentos, Gmail y herramientas avanzadas para tu operación."
                : "Control de la flota, tu equipo y el resultado de cada camión."}
            </p>
            <ul className="plan-features">
              <li>
                <Check size={17} />
                {plan.max_trucks === null
                  ? "Sin límite comercial de camiones"
                  : `Hasta ${plan.max_trucks} camiones`}
              </li>
              <li>
                <Check size={17} />
                Camiones y conductores
              </li>
              <li>
                <Check size={17} />
                Ingresos, gastos y rentabilidad
              </li>
              {plan.modules.documents && (
                <li>
                  <Check size={17} />
                  Archivo privado de documentos
                </li>
              )}
              {plan.modules.gmail && (
                <li>
                  <Check size={17} />
                  Gmail propio de tu empresa
                </li>
              )}
              {plan.modules.invoice_ai && (
                <li>
                  <Check size={17} />
                  Lectura IA opcional, bajo autorización
                </li>
              )}
            </ul>
            <Button
              variant={plan.id === "full" ? "primary" : "secondary"}
              icon={ArrowRight}
              disabled={
                disabled || (!existingCustomer && !catalog.registration_open)
              }
              onClick={() => onChoose(plan.id)}
            >
              Elegir {plan.name}
            </Button>
            <small>
              La prueba inicial incluye Full durante {catalog.trial_days} días.
              Sin tarjeta ni cobro automático al registrarte.
            </small>
          </article>
        ))}
    </div>
  );
}
export function PublicPortal({
  onAccess,
  onDemo,
}: {
  onAccess(view: "login" | "signup", plan?: Plan["id"]): void;
  onDemo(): void;
}) {
  const [catalog, setCatalog] = useState<Catalog>(
    isCandidateRelease
      ? { ...exampleCatalog, registration_open: false, payments_enabled: false }
      : exampleCatalog,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setFailed(true);
      return;
    }
    let active = true;
    void client.rpc("tc_public_catalog", {}).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      const next = data as unknown as Catalog;
      setCatalog(
        isCandidateRelease
          ? { ...next, registration_open: false, payments_enabled: false }
          : next,
      );
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="public-portal">
      <header className="portal-header">
        <a
          className="portal-brand"
          href="#"
          onClick={(e) => e.preventDefault()}
        >
          <span className="brand-mark">
            <Truck size={26} />
          </span>
          <span>
            TruckControl <b>AI</b>
          </span>
        </a>
        <nav aria-label="Acceso a TruckControl">
          <a
            href="#planes"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("planes")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Planes
          </a>
          <Button variant="secondary" onClick={() => onAccess("login")}>
            Entrar
          </Button>
        </nav>
      </header>
      {isCandidateRelease && (
        <section
          className="candidate-notice"
          aria-label="Estado de la versión candidata"
        >
          <Badge tone="amber">VERSIÓN CANDIDATA</Badge>
          <h2>Prueba los módulos con datos ficticios</h2>
          <p>
            La apertura comercial está pendiente de verificar el correo y
            completar los controles de producción. Explora la demo desde este
            móvil u ordenador.
          </p>
          <Button variant="secondary" onClick={onDemo}>
            Abrir demostración
          </Button>
        </section>
      )}
      <section className="portal-hero">
        <div>
          <Badge tone="green">INTELIGENCIA PARA TU FLOTA</Badge>
          <h1>
            Cada kilómetro cuenta.
            <br />
            <span>Cada decisión, también.</span>
          </h1>
          <p>
            Tu empresa, tus camiones y tus números en un único lugar. Gestiona
            la operación y conoce qué aporta cada vehículo a tu negocio.
          </p>
          <div className="portal-actions">
            <Button
              icon={ArrowRight}
              onClick={() => onAccess("signup", "limited")}
              disabled={!catalog.registration_open}
            >
              Probar Full gratis {catalog.trial_days} días
            </Button>
            <Button variant="ghost" onClick={onDemo}>
              Explorar la demo
            </Button>
          </div>
          <div className="portal-proof">
            <ShieldCheck size={17} />
            Datos separados por empresa · Windows y Android
          </div>
        </div>
        <div
          className="fleet-hero-card"
          aria-label="Ejemplo ilustrativo del control de flota"
        >
          <div>
            <span className="eyebrow">FLEET COMMAND</span>
            <Badge tone="green">Vista ilustrativa</Badge>
          </div>
          <div className="hero-gauge">
            <Gauge size={118} strokeWidth={1} />
            <strong>
              50<span>CAMIONES</span>
            </strong>
          </div>
          <p>UNA VISIÓN COMPLETA DE TU OPERACIÓN</p>
          <div
            className="hero-odometer"
            aria-label="Cuentakilómetros ilustrativo"
          >
            {["0", "8", "4", "2", "6", "0"].map((n, i) => (
              <span key={i}>{n}</span>
            ))}
            <small>km</small>
          </div>
          <div className="hero-route">
            <i />
            <span>Tu flota</span>
            <span className="route-line" />
            <span>Tu siguiente objetivo</span>
            <ChevronRight size={18} />
          </div>
        </div>
      </section>
      <section
        className="portal-benefits"
        aria-label="Herramientas para tu empresa"
      >
        {[
          {
            icon: Truck,
            title: "Operación bajo control",
            text: "Fichas de camiones y conductores, asignaciones y vencimientos.",
          },
          {
            icon: Gauge,
            title: "Números que orientan",
            text: "Ingresos, gastos y rentabilidad por camión y periodo.",
          },
          {
            icon: Mail,
            title: "Facturas en su sitio",
            text: "Conecta Gmail desde tu empresa y revisa las facturas antes de registrarlas.",
          },
        ].map((item) => (
          <article className="card" key={item.title}>
            <item.icon size={25} />
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
      <section id="planes" className="portal-plans">
        <div className="portal-section-heading">
          <p className="eyebrow">ELIGE CÓMO QUIERES AVANZAR</p>
          <h2>Empieza con todo. Elige tu plan después.</h2>
          <p>
            Solicita tu cuenta, confirma tu correo
            {catalog.sms_ready ? " y tu teléfono" : ""} y disfruta de{" "}
            {catalog.trial_days} días de acceso Full. Tu prueba comienza cuando
            terminas la verificación.
          </p>
          {catalog.prices_are_examples && (
            <Badge tone="amber">
              Precios de ejemplo · editables antes de activar cobros
            </Badge>
          )}
          {failed && (
            <p className="portal-notice">
              {isCandidateRelease
                ? "Oferta configurada para el lanzamiento. El registro y los cobros siguen cerrados en esta candidata."
                : "El acceso depende de la configuración disponible de la plataforma."}
            </p>
          )}
        </div>
        <PlanCards
          catalog={catalog}
          onChoose={(plan) => onAccess("signup", plan)}
        />
        <p className="pricing-note">
          La lectura IA es opcional y necesita habilitación del administrador y
          consentimiento del usuario. Los servicios de SMS, pagos y Google se
          activan al completar su configuración. No se generan cargos al
          solicitar la prueba.
        </p>
      </section>
      <section className="portal-start card">
        <div>
          <h2>Tu siguiente etapa empieza aquí.</h2>
          <p>
            Un espacio propio para cada empresa. Un mismo control para toda tu
            flota.
          </p>
        </div>
        <Button
          icon={ArrowRight}
          onClick={() => onAccess("signup", "limited")}
          disabled={!catalog.registration_open}
        >
          Solicitar acceso · {catalog.trial_days} días gratis
        </Button>
      </section>
      <footer className="portal-footer">
        <span>TruckControl AI · Fleet Intelligence</span>
        <button onClick={() => onAccess("login")}>
          Acceso de clientes y administrador
        </button>
      </footer>
    </main>
  );
}
