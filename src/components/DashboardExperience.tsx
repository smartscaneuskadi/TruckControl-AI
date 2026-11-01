import { useEffect, useState } from "react";
import {
  Award,
  Bell,
  CircleHelp,
  Flag,
  Fuel,
  Map,
  MapPin,
  Route,
  Target,
  Truck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useFleet } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import { useSubscription } from "../app/SubscriptionContext";
import { useAppearance } from "../app/AppearanceContext";
import { money, monthLabel, number, today } from "../lib/format";
import { filterEntries, parseMoney, summarize } from "../domain/finance";
import { LocalInsightProvider } from "../domain/insights";
import { Button, Field, Modal } from "./ui";

export function FleetWelcome() {
  const { snapshot } = useFleet();
  const { period } = useWorkspace();
  return (
    <section
      className="fleet-welcome"
      aria-label="Tu espacio de gestión de flotas"
    >
      <img
        className="fleet-welcome-photo"
        src="/images/fleet-alpine-hero.webp"
        alt=""
      />
      <div className="fleet-welcome-shade" />
      <div className="fleet-welcome-copy">
        <span>CONTROL TOTAL · CADA DÍA</span>
        <h2>
          Juntos, <em>más lejos.</em>
        </h2>
        <p>Tu flota. Tus decisiones. Un mismo horizonte.</p>
        <span className="welcome-period">
          {monthLabel(period)} · {snapshot.organization.name}
        </span>
      </div>
      <span className="illustration-label">Imagen ilustrativa</span>
    </section>
  );
}

export function FleetIllustration() {
  const { resolvedTheme } = useAppearance();
  return (
    <figure className="fleet-scene">
      <img
        src={
          resolvedTheme === "light"
            ? "/images/fleet-light-trucks.jpg"
            : "/images/fleet-cockpit-truck.jpg"
        }
        alt="Camión en carretera, imagen ilustrativa"
        width={1400}
        height={935}
        loading="lazy"
      />
      <figcaption>
        Imagen ilustrativa · no identifica vehículos de tu empresa
      </figcaption>
    </figure>
  );
}

export function FleetQuickStats() {
  const { snapshot } = useFleet();
  const { period } = useWorkspace();
  const operations = useOperations();
  const subscription = useSubscription();
  const trips =
    operations.error ||
    operations.loading ||
    (subscription.enabled && !subscription.features.trips)
      ? null
      : operations.rows.filter((r) => r.kind === "trips");
  const notices = new LocalInsightProvider()
    .analyze(snapshot, period, today())
    .filter((i) => i.level === "warning");
  const stats = [
    {
      label: "Vehículos",
      value: snapshot.trucks.length,
      icon: Truck,
      href: "/trucks",
    },
    {
      label: "Conductores",
      value: snapshot.drivers.length,
      icon: UsersRound,
      href: "/drivers",
    },
    {
      label: "Viajes en curso",
      value: trips
        ? trips.filter((t) => t.data.status === "in_transit").length
        : null,
      icon: Route,
      href: "/trips",
    },
    {
      label: "En taller",
      value: snapshot.trucks.filter((t) => t.status === "maintenance").length,
      icon: Wrench,
      href: "/maintenance",
    },
    { label: "Avisos", value: notices.length, icon: Bell, href: "/alerts" },
    {
      label: "Disponibles",
      value: snapshot.trucks.filter((t) => t.status === "available").length,
      icon: Flag,
      href: "/trucks",
    },
  ];
  return (
    <section
      className="quick-stats"
      aria-label="Indicadores operativos registrados"
    >
      {stats.map((s) => (
        <Link to={s.href} className="quick-stat" key={s.label}>
          <s.icon size={24} />
          <span>
            <strong>{s.value === null ? "—" : s.value}</strong>
            <small>{s.label}</small>
          </span>
        </Link>
      ))}
    </section>
  );
}

export function MonthlyGoal() {
  const { snapshot } = useFleet();
  const { period } = useWorkspace();
  const appearance = useAppearance();
  const key = `truckcontrol-goal-v1:${appearance.account ?? "demo"}:${snapshot.organization.id}:${period}`;
  const [goal, setGoal] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(key));
      setGoal(Number.isSafeInteger(n) && n > 0 && n <= 10000000000 ? n : null);
    } catch {
      setGoal(null);
    }
  }, [key]);
  const actual = summarize(filterEntries(snapshot.entries, period)).profitCents;
  const progress = goal ? Math.max(0, Math.min(100, (actual / goal) * 100)) : 0;
  return (
    <section
      className="card monthly-goal"
      aria-labelledby="monthly-goal-heading"
    >
      <div className="card-heading">
        <div className="inline-actions">
          <Target size={22} />
          <h2 id="monthly-goal-heading">Mi objetivo del mes</h2>
        </div>
        <Button
          variant="ghost"
          onClick={() => setEditing(true)}
          disabled={period === "all"}
        >
          {goal ? "Editar objetivo" : "Definir objetivo"}
        </Button>
      </div>
      <p>Beneficio operativo registrado · {monthLabel(period)}</p>
      <strong className="goal-actual">
        {money(actual)}{" "}
        <small>
          {goal ? `de ${money(goal)} de objetivo` : "sin objetivo definido"}
        </small>
      </strong>
      <div
        className="goal-track"
        role="progressbar"
        aria-label="Progreso de mi objetivo mensual"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={
          goal
            ? `${Math.round(progress)} %, beneficio ${money(actual)} de ${money(goal)}`
            : "Define tu objetivo para ver el progreso"
        }
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <p>
        {period === "all"
          ? "Selecciona un mes para definir un objetivo mensual."
          : goal
            ? progress >= 100
              ? "Objetivo alcanzado con los resultados registrados."
              : `${Math.round(progress)} % de tu objetivo personal.`
            : "Elige una meta para seguir tu progreso. No modifica la contabilidad."}
      </p>
      <div className="business-achievements">
        <span className={actual > 0 ? "earned" : ""}>
          <Award size={17} />
          {actual > 0
            ? "Margen operativo positivo"
            : "Seguimiento de rentabilidad"}
        </span>
        <span className={goal && progress >= 100 ? "earned" : ""}>
          <Flag size={17} />
          {goal && progress >= 100
            ? "Meta del mes alcanzada"
            : "Tu próxima meta"}
        </span>
      </div>
      <small>
        Objetivo personal guardado en este dispositivo para esta cuenta, empresa
        y mes.
      </small>
      {editing && (
        <Modal
          title="Mi objetivo de beneficio mensual"
          onClose={() => setEditing(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const cents = parseMoney(
                  String(new FormData(e.currentTarget).get("goal")),
                );
                if (cents <= 0 || cents > 10000000000) throw new Error();
                localStorage.setItem(key, String(cents));
                setGoal(cents);
                setEditing(false);
                setError("");
              } catch {
                setError(
                  "Indica un importe válido mayor que cero. Comprueba que el navegador permite guardar preferencias.",
                );
              }
            }}
          >
            <Field label="Objetivo de beneficio (€)">
              <input
                name="goal"
                inputMode="decimal"
                required
                defaultValue={goal ? (goal / 100).toFixed(2) : ""}
              />
            </Field>
            <p>
              Se compara con ingresos menos gastos del mes seleccionado. Es una
              referencia personal; no crea movimientos.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button type="submit">Guardar objetivo</Button>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function FleetRouteMap() {
  const operations = useOperations();
  const subscription = useSubscription();
  const [load, setLoad] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const trips =
    !operations.loading &&
    !operations.error &&
    (!subscription.enabled || subscription.features.trips)
      ? operations.rows
          .filter((r) => r.kind === "trips" && r.data.status !== "cancelled")
          .slice(0, 3)
      : [];
  return (
    <section
      className="card route-map-card"
      aria-labelledby="route-map-heading"
    >
      <div className="card-heading">
        <div className="inline-actions">
          <Map size={22} />
          <h2 id="route-map-heading">Mapa y rutas</h2>
        </div>
        <span className="gps-state">
          <MapPin size={14} />
          Sin fuente GPS conectada
        </span>
      </div>
      <div className="route-map-surface">
        {load && online ? (
          <iframe
            title="Mapa interactivo de referencia de España"
            src="https://www.openstreetmap.org/export/embed.html?bbox=-9.6%2C35.7%2C4.5%2C44.3&layer=mapnik"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="map-empty">
            <Map size={38} />
            <h3>
              {online ? "Tu operación, sobre el mapa" : "Mapa sin conexión"}
            </h3>
            <p>
              {online
                ? "Explora la cartografía. No hay posiciones de vehículos recibidas."
                : "Los viajes registrados siguen disponibles; la cartografía necesita conexión."}
            </p>
            <Button
              variant="secondary"
              onClick={() => setLoad(true)}
              disabled={!online}
            >
              Cargar mapa interactivo
            </Button>
            <small>
              Cartografía de OpenStreetMap. No se envían vehículos ni
              direcciones de clientes.
            </small>
          </div>
        )}
      </div>
      <div className="registered-routes">
        {trips.length ? (
          trips.map((trip) => (
            <Link to="/trips" key={trip.id}>
              <Route size={16} />
              <span>
                {String(trip.data.origin)} <span aria-hidden="true">→</span>{" "}
                {String(trip.data.destination)}
              </span>
              <small>
                {number(Number(trip.data.distanceKm))} km registrados
              </small>
            </Link>
          ))
        ) : (
          <p>Consulta los viajes autorizados en Rutas y viajes.</p>
        )}
      </div>
      <p className="map-disclaimer">
        <CircleHelp size={14} />
        Mapa de referencia; no representa seguimiento GPS en tiempo real.
      </p>
    </section>
  );
}

export function FuelSnapshot() {
  const operations = useOperations();
  const { period } = useWorkspace();
  const subscription = useSubscription();
  const allowed = !subscription.enabled || subscription.features.fuel;
  const fills =
    allowed && !operations.loading && !operations.error
      ? operations.rows.filter(
          (r) =>
            r.kind === "fuel" &&
            (period === "all" || String(r.data.date).startsWith(period)),
        )
      : [];
  const litres = fills.reduce(
    (sum, r) => sum + Number(r.data.millilitres) / 1000,
    0,
  );
  return (
    <section className="card fuel-snapshot">
      <div className="card-heading">
        <div className="inline-actions">
          <Fuel size={22} />
          <h2>Combustible registrado</h2>
        </div>
        <Link className="link-button" to="/fuel">
          Ver repostajes
        </Link>
      </div>
      <strong>
        {allowed && !operations.loading && !operations.error
          ? `${number(litres)} l`
          : "Sin datos disponibles"}
      </strong>
      <p>
        {fills.length} repostajes · {monthLabel(period)}
      </p>
      <div
        className="fuel-readout"
        role="img"
        aria-label="Litros por repostaje registrado"
      >
        {fills.slice(-12).map((fill) => (
          <span
            key={fill.id}
            title={`${String(fill.data.date)} · ${number(Number(fill.data.millilitres) / 1000)} l`}
            style={{
              height: `${Math.max(4, (Number(fill.data.millilitres) / Math.max(...fills.map((f) => Number(f.data.millilitres)))) * 100)}%`,
            }}
          />
        ))}
      </div>
      <small>
        Litros registrados en el período. El nivel actual del depósito requiere
        un sensor conectado.
      </small>
    </section>
  );
}
