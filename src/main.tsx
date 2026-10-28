import { Component, StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { FleetProvider } from "./app/FleetProvider";
import { PwaTools } from "./components/PwaTools";
import "./styles.css";
import "./styles/professional-theme.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TruckControl UI error", error.message, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="boot-screen">
          <h1>No se ha podido mostrar la aplicación.</h1>
          <p>
            Tus datos locales se conservan. Recarga la página para intentarlo de
            nuevo.
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Recargar aplicación
          </button>
        </main>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <PwaTools>
        <FleetProvider>
          <App />
        </FleetProvider>
      </PwaTools>
    </ErrorBoundary>
  </StrictMode>,
);
