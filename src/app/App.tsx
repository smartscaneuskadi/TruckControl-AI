import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  LayoutDashboard,
  Menu,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Truck,
  UsersRound,
  Wallet,
  X,
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
import { today } from "../lib/format";
import { Dashboard } from "../pages/Dashboard";
import { Trucks } from "../pages/Trucks";
import { Drivers } from "../pages/Drivers";
import { Finance } from "../pages/Finance";
import { Profitability } from "../pages/Profitability";
import { Assistant } from "../pages/Assistant";
import { Settings } from "../pages/Settings";

const navigation = [
  { to: "/dashboard", label: "Resumen general", icon: LayoutDashboard },
  { to: "/trucks", label: "Camiones", icon: Truck },
  { to: "/drivers", label: "Conductores", icon: UsersRound },
  { to: "/income", label: "Ingresos", icon: ArrowUpRight },
  { to: "/expenses", label: "Gastos", icon: ArrowDownLeft },
  { to: "/profitability", label: "Rentabilidad", icon: Wallet },
];

export function App() {
  return (
    <HashRouter>
      <Workspace />
    </HashRouter>
  );
}

function Workspace() {
  const { snapshot } = useFleet();
  const location = useLocation();
  const { install, canInstall } = useInstall();
  const [period, setPeriod] = useState(snapshot.demoMonth);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [truckId, setTruckId] = useState<string | null>(null);
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const truck = snapshot.trucks.find((truck) => truck.id === truckId);
  const insights = new LocalInsightProvider()
    .analyze(snapshot, period, today())
    .filter((insight) => insight.level !== "success");
  const currentPage =
    navigation.find((item) => item.to === location.pathname)?.label ??
    (location.pathname === "/assistant"
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
        edit: setEditor,
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
            Flota de demostración<small>Espacio de trabajo</small>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <div className="nav-section-label">GESTIÓN DE FLOTA</div>
        <nav>
          {navigation.map((item) => (
            <NavLink
              to={item.to}
              key={item.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.to === "/trucks" && (
                <span className="nav-count">{snapshot.trucks.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nav-section-label intelligence-label">INTELIGENCIA</div>
        <NavLink
          to="/assistant"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Sparkles size={18} />
          <span>Copiloto de flota</span>
          <span className="new-badge">LAB</span>
        </NavLink>
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
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <SettingsIcon size={18} />
            <span>Configuración</span>
          </NavLink>
          <button className="nav-link" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            <span>Guía de la demo</span>
          </button>
        </div>
        <div className="profile">
          <span className="profile-avatar">DF</span>
          <div>
            <strong>Demo Flota</strong>
            <span>Operador de demostración</span>
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
              Modo demo
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
            <span className="topbar-avatar">DF</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/trucks" element={<Trucks key={location.search} />} />
            <Route
              path="/drivers"
              element={<Drivers key={location.search} />}
            />
            <Route
              path="/income"
              element={
                <Finance kind="income" key={`income${location.search}`} />
              }
            />
            <Route
              path="/expenses"
              element={
                <Finance kind="expense" key={`expense${location.search}`} />
              }
            />
            <Route
              path="/profitability"
              element={<Profitability key={location.search} />}
            />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/settings" element={<Settings />} />
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
              Datos ficticios · guardado local
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
          subtitle="Calculados con los datos de demostración"
          onClose={() => setNotifications(false)}
        >
          <div className="notification-list">
            {insights.map((insight) => (
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
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="Prueba TruckControl AI"
          subtitle="Fase 1 · 50 camiones de demostración"
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
