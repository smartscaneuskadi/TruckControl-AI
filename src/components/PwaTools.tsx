import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Download, WifiOff } from "lucide-react";
import { Button, Modal } from "./ui";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const InstallContext = createContext<{
  install(): void;
  installed: boolean;
  canInstall: boolean;
}>({ install() {}, installed: false, canInstall: false });
export const useInstall = () => useContext(InstallContext);

export function PwaTools({ children }: { children: ReactNode }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [instructions, setInstructions] = useState(false);
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );
  const [online, setOnline] = useState(navigator.onLine);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    const onOnline = () => setOnline(true),
      onOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  function install() {
    if (!installEvent) {
      setInstructions(true);
      return;
    }
    installEvent
      .prompt()
      .then(() => installEvent.userChoice)
      .then((result) => {
        if (result.outcome === "accepted") setInstallEvent(null);
      })
      .catch(() => setInstructions(true));
  }
  return (
    <InstallContext.Provider
      value={{ install, installed, canInstall: !!installEvent }}
    >
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={15} />
          Sin conexión · trabajando con los datos locales de demostración
        </div>
      )}
      {children}
      {needRefresh && (
        <div className="update-banner" role="status">
          <span>
            Hay una nueva versión. Guarda los formularios antes de actualizar.
          </span>
          <Button variant="secondary" onClick={() => setNeedRefresh(false)}>
            Más tarde
          </Button>
          <Button
            onClick={() => {
              void updateServiceWorker(true);
            }}
          >
            Actualizar
          </Button>
        </div>
      )}
      {instructions && (
        <Modal
          title="Instalar TruckControl AI"
          subtitle="Una aplicación web para Windows y Android"
          onClose={() => setInstructions(false)}
        >
          <div className="install-instructions">
            <Download size={30} />
            <h3>Windows · Microsoft Edge o Google Chrome</h3>
            <p>
              Abre el menú del navegador y selecciona «Instalar esta aplicación»
              o el icono de instalación de la barra de direcciones.
            </p>
            <h3>Android · Google Chrome</h3>
            <p>
              Abre el menú ⋮ y selecciona «Añadir a pantalla de inicio» →
              «Instalar».
            </p>
            <p>
              Visita la aplicación con conexión una vez para descargarla.
              Después podrás usar la demo sin conexión. Los datos se guardan en
              este navegador y no se sincronizan entre dispositivos.
            </p>
            <p className="muted">
              No se distribuyen instaladores .exe o .apk en esta fase.
            </p>
          </div>
          <div className="modal-actions">
            <Button
              className="push-right"
              onClick={() => setInstructions(false)}
            >
              Entendido
            </Button>
          </div>
        </Modal>
      )}
    </InstallContext.Provider>
  );
}
