import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { AccountControls } from "../components/AccountControls";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleDot,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings as SettingsIcon,
  SunMoon,
  ShieldCheck,
  Sparkles,
  Truck,
  MapPinned,
  UsersRound,
  Wallet,
  X,
  FileText,
  Mail,
  Building2,
  Container,
  Route as RouteIcon,
  Wrench,
  Fuel,
  CalendarClock,
} from "lucide-react";
import {
  HashRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { Editor } from "./WorkspaceContext";
import { WorkspaceContext } from "./WorkspaceContext";
import { useFleet } from "./FleetProvider";
import { EntityEditor } from "../components/Editors";
import { TruckDetail } from "../components/TruckDetail";
import { GlobalSearch } from "../components/GlobalSearch";
import { useInstall } from "../components/PwaTools";
import { Badge, Button, Modal } from "../components/ui";
import { LocalInsightProvider } from "../domain/insights";
import { Dashboard } from "../pages/Dashboard";
import { CargoTrack } from "../pages/CargoTrack";
import { Trucks } from "../pages/Trucks";
import { Drivers } from "../pages/Drivers";
import { Finance } from "../pages/Finance";
import { Profitability } from "../pages/Profitability";
import { Assistant } from "../pages/Assistant";
import { Settings } from "../pages/Settings";
import { Documents } from "../pages/Documents";
import { Invoices } from "../pages/Invoices";
import { Operations } from "../pages/Operations";
import { Tyres } from "../pages/Tyres";
import { Suppliers } from "../pages/Suppliers";
import { MailWorkspace } from "../pages/MailWorkspace";
import "../styles/mail-workspace.css";
import { PersonalMail } from "../pages/PersonalMail";
import { Team } from "../pages/Team";
import { Reports } from "../pages/Reports";
import type { OperationKind } from "../domain/operations";
import { useCompany } from "./CompanyAccess";
import { initials } from "../lib/format";
import { FeatureGate, useSubscription } from "./SubscriptionContext";
import { commercialEnabled, trialDaysLeft } from "../domain/subscriptions";
import { useAppearance } from "./AppearanceContext";
import type { Feature } from "../domain/subscriptions";
import { useOffline } from "./OfflineContext";
import { useOperations } from "./OperationsProvider";
import { operationalAlerts } from "../domain/operations";
import { useDocuments } from "./DocumentsProvider";
import { useTyres } from "./TyresProvider";
import { useCurrentDay } from "../lib/use-current-day";
import { isCandidateRelease } from "../domain/release";

const navigation = [
  {
    to: "/dashboard",
    label: "Resumen general",
    icon: LayoutDashboard,
    feature: "dashboard",
  },
  { to: "/trucks", label: "Camiones", icon: Truck, feature: "trucks" },
  { to: "/cargotrack", label: "CargoTrack", icon: MapPinned, feature: null },
  {
    to: "/drivers",
    label: "Conductores",
    icon: UsersRound,
    feature: "drivers",
  },
  { to: "/income", label: "Ingresos", icon: ArrowUpRight, feature: "income" },
  {
    to: "/expenses",
    label: "Gastos",
    icon: ArrowDownLeft,
    feature: "expenses",
  },
  {
    to: "/profitability",
    label: "Rentabilidad",
    icon: Wallet,
    feature: "profitability",
  },
  {
    to: "/documents",
    label: "Documentos",
    icon: FileText,
    feature: "documents",
  },
  { to: "/mailbox", label: "Correo", icon: Mail, feature: null },
  { to: "/trailers", label: "Remolques", icon: Container, feature: "trailers" },
  {
    to: "/customers",
    label: "Clientes",
    icon: Building2,
    feature: "customers",
  },
  { to: "/trips", label: "Viajes", icon: RouteIcon, feature: "trips" },
  {
    to: "/suppliers",
    label: "Proveedores",
    icon: Building2,
    feature: "expenses",
  },
  {
    to: "/maintenance",
    label: "Mantenimiento",
    icon: Wrench,
    feature: "maintenance",
  },
  { to: "/fuel", label: "Combustible", icon: Fuel, feature: "fuel" },
  {
    to: "/tyres",
    label: "Neumáticos",
    icon: CircleDot,
    feature: "maintenance",
  },
  {
    to: "/deadlines",
    label: "Vencimientos",
    icon: CalendarClock,
    feature: "deadlines",
  },
  { to: "/alerts", label: "Alertas", icon: Bell, feature: "alerts" },
  {
    to: "/reports",
    label: "Informes",
    icon: FileText,
    feature: "profitability",
  },
  {
    to: "/team",
    label: "Equipo de empresa",
    icon: UsersRound,
    feature: "team",
  },
];

export function App() {
  return (
    <HashRouter>
      <Workspace />
    </HashRouter>
  );
}

function Workspace() {
  const appearance = useAppearance();
  const offline = useOffline();
  const { snapshot, notify } = useFleet();
  const subscription = useSubscription();
  const access = useCompany();
  const operations = useOperations();
  const documents = useDocuments();
  const tyres = useTyres();
  const day = useCurrentDay();
  const cloud = access.mode === "company";
  const location = useLocation();
  const { install, canInstall } = useInstall();
  const [period, setPeriod] = useState(snapshot.demoMonth);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [truckId, setTruckId] = useState<string | null>(null);
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signOutPending = useRef(false);
  const truck = snapshot.trucks.find((truck) => truck.id === truckId);
  const operationsReady =
    !operations.loading &&
    !operations.error &&
    (!subscription.enabled || subscription.features.alerts);
  const operational = operationsReady
    ? operationalAlerts(
        snapshot,
        operations.rows,
        day,
        documents.documents,
        tyres.rows,
      ).filter((a) => !subscription.enabled || subscription.features[a.source])
    : [];
  const insights = [
    ...operational.map((a) => ({
      id: `operation:${a.key}`,
      level: a.urgent ? ("warning" as const) : ("info" as const),
      title: a.title,
      description:
        a.reason === "measurement"
          ? `Medición manual del ${a.dueOn}. Comprueba el neumático y los umbrales configurados.`
          : a.reason === "kilometres"
            ? `Kilometraje registrado: ${a.currentKm} km. Revisión prevista desde ${a.thresholdKm} km.`
            : `Fecha: ${a.dueOn}. ${a.dueOn < day ? "Vencido" : a.dueOn === day ? "Vence hoy" : "Próximo vencimiento"}.`,
      href: "/alerts",
    })),
    ...new LocalInsightProvider()
      .analyze(snapshot, period, day)
      .filter((i) => i.level !== "success")
      .filter(
        (i) => !operationsReady || !["inspections", "licenses"].includes(i.id),
      )
      .filter(
        (i) =>
          !subscription.enabled ||
          subscription.features[i.href.split(/[/?]/)[1] as Feature],
      ),
  ];
  const currentPage =
    navigation.find((item) => item.to === location.pathname)?.label ??
    (location.pathname.startsWith("/mailbox/") ||
    location.pathname === "/invoices"
      ? "Correo"
      : location.pathname === "/assistant"
        ? "Copiloto de flota"
        : "Configuración");
  useEffect(() => {
    setMenu(false);
    document.title = `${currentPage} · TruckControl AI`;
    window.scrollTo(0, 0);
    document.body.scrollTo(0, 0);
  }, [location.pathname, currentPage]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch(true);
      }
      if (event.key === "Escape") setMenu(false);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <WorkspaceContext.Provider
      value={{
        period,
        setPeriod,
        edit: (value) => {
          if (offline.offline) {
            notify(
              "Los cambios sin conexión están disponibles en los módulos de operaciones. Conecta para editar fichas y contabilidad.",
            );
            return;
          }
          if (
            subscription.enabled &&
            subscription.access?.can_write === false
          ) {
            notify("Tu cuenta tiene acceso de consulta.");
            return;
          }
          const feature: Feature =
            value.kind === "truck"
              ? "trucks"
              : value.kind === "driver"
                ? "drivers"
                : value.kind === "income"
                  ? "income"
                  : "expenses";
          if (subscription.enabled && !subscription.features[feature]) {
            notify("Este módulo está desactivado para tu cuenta.");
            return;
          }
          setEditor(value);
        },
        viewTruck: (truck) => setTruckId(truck.id),
      }}
    >
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Saltar al contenido
      </a>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        className={`sidebar ${menu ? "open" : ""}`}
        aria-label="Navegación principal"
      >
        <Link className="brand" to="/dashboard">
          <span className="brand-mark">
            <Truck size={24} strokeWidth={2.3} />
          </span>
          <span>
            TruckControl<span className="brand-ai">AI</span>
            <small>FLEET INTELLIGENCE</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-label">
          <span className="workspace-icon">F</span>
          <span>
            {cloud ? snapshot.organization.name : "Flota de demostración"}
            <small>Espacio de trabajo</small>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <div className="nav-section-label">GESTIÓN DE FLOTA</div>
        <nav>
          {navigation
            .filter(
              (item) =>
                !subscription.enabled ||
                item.feature === null ||
                subscription.features[item.feature as Feature],
            )
            .map((item) => (
              <NavLink
                to={item.to}
                key={item.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                {item.to === "/cargotrack" ? (
                  <span className="cargotrack-nav-icon" aria-hidden="true">
                    <Truck size={18} />
                    <MapPinned size={12} />
                  </span>
                ) : (
                  <item.icon size={18} aria-hidden="true" />
                )}
                <span>{item.label}</span>
                {item.to === "/trucks" && (
                  <span className="nav-count">{snapshot.trucks.length}</span>
                )}
              </NavLink>
            ))}
        </nav>
        <div className="nav-section-label intelligence-label">INTELIGENCIA</div>
        {(!subscription.enabled || subscription.features.assistant) && (
          <NavLink
            to="/assistant"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <Sparkles size={18} />
            <span>Copiloto de flota</span>
            <span className="new-badge">LAB</span>
          </NavLink>
        )}
        <div className="sidebar-spacer" />
        <Link to="/assistant" className="sidebar-promo">
          <span className="promo-icon">
            <Sparkles size={18} />
          </span>
          <strong>Una flota más inteligente.</strong>
          <p>Descubre las señales que esconden tus datos.</p>
          <span>
            Explorar análisis <ArrowRight size={14} />
          </span>
        </Link>
        <div className="sidebar-bottom">
          {subscription.enabled && (
            <button className="nav-link" onClick={subscription.openPlans}>
              <Wallet size={18} />
              <span>Mi plan y suscripción</span>
            </button>
          )}
          {commercialEnabled() && !cloud && (
            <button className="nav-link" onClick={access.portal}>
              <Building2 size={18} />
              <span>Planes y registro</span>
            </button>
          )}
          {!cloud && (
            <button className="nav-link" onClick={access.openAccount}>
              <Building2 size={18} />
              <span>Acceso de empresas</span>
            </button>
          )}
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <SettingsIcon size={18} />
            <span>Configuración</span>
          </NavLink>
          {cloud && access.user && !offline.offline && (
            <button
              className="nav-link"
              type="button"
              disabled={signingOut}
              aria-busy={signingOut}
              aria-label={signingOut ? "Cerrando sesión de TruckControl…" : "Cerrar sesión de TruckControl"}
              onClick={async () => {
                if (signOutPending.current) return;
                signOutPending.current = true;
                setSigningOut(true);
                try {
                  await access.signOut();
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "No se ha podido cerrar la sesión. Reinténtalo.",
                  );
                } finally {
                  signOutPending.current = false;
                  setSigningOut(false);
                }
              }}
            >
              <LogOut size={18} />
              <span>{signingOut ? "Cerrando sesión…" : "Cerrar sesión"}</span>
            </button>
          )}
          <button className="nav-link" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            <span>Guía de la demo</span>
          </button>
        </div>
        <div className="profile">
          <span className="profile-avatar">
            {cloud ? initials(snapshot.organization.name) : "DF"}
          </span>
          <div>
            <strong>{cloud ? snapshot.organization.name : "Demo Flota"}</strong>
            <span>
              {cloud ? "Cuenta de empresa" : "Operador de demostración"}
            </span>
          </div>
          <ShieldCheck size={17} />
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span>Mi espacio</span>
            <ChevronRight size={13} />
            <strong>{currentPage}</strong>
          </div>
          <div className="topbar-right">
            <LanguageSwitcher />
            <button
              className="theme-launcher"
              aria-label="Cambiar apariencia"
              onClick={appearance.open}
            >
              <SunMoon size={18} />
            </button>
            <button
              className="global-search-button"
              aria-label="Buscar en tu flota"
              onClick={() => setSearch(true)}
            >
              <Search size={16} />
              <span>Buscar en tu flota…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="demo-pill">
              <span />
              {subscription.enabled &&
              subscription.access?.profile?.status === "trial"
                ? `${subscription.access.plan === "limited" ? "Básico" : "Full"} · Prueba: ${trialDaysLeft(subscription.access.profile.trial_ends_at)} días`
                : cloud
                  ? "Modo empresa"
                  : isCandidateRelease
                    ? "Candidata · datos ficticios"
                    : "Modo demo"}
            </span>
            {canInstall && (
              <button
                className="icon-button"
                aria-label="Instalar aplicación"
                onClick={install}
              >
                <Download size={18} />
              </button>
            )}
            <button
              className="icon-button notification-button"
              aria-label={`Ver ${insights.length} avisos`}
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {insights.length > 0 && <i />}
            </button>
            <AccountControls />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          <CargoTrack
            key={`${access.mode}:${access.user?.id ?? "demo"}:${access.organization?.id ?? snapshot.organization.id}:${offline.offline}`}
            active={location.pathname === "/cargotrack"}
            available={!offline.offline}
          />
          <MailWorkspace
            key={`mail:${access.mode}:${access.user?.id ?? "demo"}:${access.organization?.id ?? snapshot.organization.id}:${offline.offline}`}
            active={location.pathname === "/mailbox"}
            available={!offline.offline}
          />
          <Routes>
            <Route
              path="/suppliers"
              element={
                <FeatureGate feature="expenses">
                  <Suppliers
                    key={`${cloud}:${access.user?.id ?? "demo"}:${snapshot.organization.id}`}
                  />
                </FeatureGate>
              }
            />
            <Route
              path="/tyres"
              element={
                <FeatureGate feature="maintenance">
                  <Tyres key={`${cloud}:${snapshot.organization.id}`} />
                </FeatureGate>
              }
            />
            <Route
              path="/reports"
              element={
                <FeatureGate feature="profitability">
                  <Reports />
                </FeatureGate>
              }
            />
            <Route
              path="/team"
              element={
                <FeatureGate feature="team">
                  <Team />
                </FeatureGate>
              }
            />
            {(
              [
                "trailers",
                "customers",
                "trips",
                "maintenance",
                "fuel",
                "deadlines",
                "alerts",
              ] as OperationKind[]
            ).map((kind) => (
              <Route
                key={kind}
                path={`/${kind}`}
                element={
                  <FeatureGate feature={kind}>
                    <Operations key={kind} kind={kind} />
                  </FeatureGate>
                }
              />
            ))}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <FeatureGate feature="dashboard">
                  <Dashboard />
                </FeatureGate>
              }
            />
            <Route
              path="/trucks"
              element={
                <FeatureGate feature="trucks">
                  <Trucks key={location.search} />
                </FeatureGate>
              }
            />
            <Route
              path="/drivers"
              element={
                <FeatureGate feature="drivers">
                  <Drivers key={location.search} />
                </FeatureGate>
              }
            />
            <Route
              path="/income"
              element={
                <FeatureGate feature="income">
                  <Finance kind="income" key={`income${location.search}`} />
                </FeatureGate>
              }
            />
            <Route
              path="/expenses"
              element={
                <FeatureGate feature="expenses">
                  <Finance kind="expense" key={`expense${location.search}`} />
                </FeatureGate>
              }
            />
            <Route
              path="/profitability"
              element={
                <FeatureGate feature="profitability">
                  <Profitability key={location.search} />
                </FeatureGate>
              }
            />
            <Route
              path="/assistant"
              element={
                <FeatureGate feature="assistant">
                  <Assistant />
                </FeatureGate>
              }
            />
            <Route path="/cargotrack" element={null} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/mailbox" element={null} />
            <Route path="/mailbox/gmail" element={<PersonalMail />} />
            <Route
              path="/documents"
              element={
                <FeatureGate feature="documents">
                  <Documents />
                </FeatureGate>
              }
            />
            <Route
              path="/invoices"
              element={
                <FeatureGate feature="gmail">
                  <Invoices />
                </FeatureGate>
              }
            />
            <Route
              path="*"
              element={
                <div className="empty-state">
                  <h1>Página no encontrada</h1>
                  <Link to="/dashboard" className="button primary">
                    Volver al resumen
                  </Link>
                </div>
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>
              TruckControl AI <span className="footer-divider">/</span> Hecho
              para seguir avanzando.
            </span>
            <span>
              <ShieldCheck size={13} />
              {offline.offline
                ? "Copia cifrada · cambios pendientes de sincronización"
                : cloud
                  ? "Acceso por empresa · guardado en la nube"
                  : "Datos ficticios · guardado local"}
            </span>
          </footer>
        </main>
      </div>
      {editor && (
        <EntityEditor
          key={`${editor.kind}-${editor.value?.id ?? "new"}`}
          editor={editor}
          onClose={() => setEditor(null)}
        />
      )}
      {truck && !editor && (
        <TruckDetail truck={truck} onClose={() => setTruckId(null)} />
      )}
      {search && <GlobalSearch onClose={() => setSearch(false)} />}
      {notifications && (
        <Modal
          title="Avisos de tu flota"
          subtitle={
            cloud
              ? "Calculados con los datos de tu empresa"
              : "Calculados con los datos de demostración"
          }
          onClose={() => setNotifications(false)}
        >
          <div className="notification-list">
            {documents.error && (
              <p role="status">
                No se han podido comprobar los vencimientos documentales. Revisa
                el archivo de Documentos.
              </p>
            )}
            {(tyres.error || tyres.onlineRequired) && (
              <p role="status">
                No se han podido comprobar los neumáticos. Conecta y actualiza
                su registro para revisar todos sus avisos.
              </p>
            )}
            {insights.slice(0, 20).map((insight) => (
              <Link
                key={insight.id}
                to={insight.href}
                onClick={() => setNotifications(false)}
              >
                <Badge tone={insight.level === "warning" ? "amber" : "blue"}>
                  {insight.level === "warning" ? "Atención" : "Seguimiento"}
                </Badge>
                <h3>{insight.title}</h3>
                <p>{insight.description}</p>
                <ArrowRight size={17} />
              </Link>
            ))}
            {!insights.length && <p>No hay avisos pendientes.</p>}
            {insights.length > 20 && (
              <Link to="/alerts" onClick={() => setNotifications(false)}>
                Ver el centro de alertas
              </Link>
            )}
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="Prueba TruckControl AI"
          subtitle="50 camiones · datos ficticios de demostración"
          onClose={() => setHelp(false)}
        >
          <ol className="help-steps">
            <li>
              <strong>Explora el resumen.</strong> Cambia el periodo o
              selecciona un mes en el gráfico.
            </li>
            <li>
              <strong>Abre una ficha de camión.</strong> Consulta su conductor,
              ITV y resultado económico.
            </li>
            <li>
              <strong>Registra un ingreso y un gasto.</strong> Usa datos
              ficticios y el mismo camión y periodo.
            </li>
            <li>
              <strong>Consulta Rentabilidad.</strong> Comprueba cómo cambian el
              beneficio y el margen.
            </li>
            <li>
              <strong>Recarga la página.</strong> Los cambios permanecen en este
              navegador.
            </li>
          </ol>
          <p className="muted">
            Desde Configuración puedes instalar la app, exportar una copia JSON
            o restablecer la demo. La sincronización entre dispositivos y los
            modelos IA se añadirán en fases posteriores.
          </p>
          <div className="modal-actions">
            <Button className="push-right" onClick={() => setHelp(false)}>
              Empezar a explorar
            </Button>
          </div>
        </Modal>
      )}
    </WorkspaceContext.Provider>
  );
}
