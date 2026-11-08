import { useRef, useState } from "react";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useCompany } from "../app/CompanyAccess";
import { useOffline } from "../app/OfflineContext";
import { Button, Modal } from "./ui";
import "../styles/account-controls.css";

/** Account access remains reachable without scrolling the fleet navigation. */
export function AccountControls() {
  const access = useCompany();
  const offline = useOffline();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function closeSession() {
    if (pending.current) return;
    if (offline.offline) {
      setOpen(false);
      offline.lock();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await access.signOut();
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se ha podido cerrar la sesión. Comprueba la conexión y reinténtalo.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="account-launcher"
        aria-label="Cuenta y acceso"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <UserRound size={18} aria-hidden="true" />
        <span>Cuenta</span>
      </button>
      {open && (
        <Modal
          title="Cuenta y acceso"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="account-controls">
            <ShieldCheck size={28} aria-hidden="true" />
            {access.user ? (
              <p className="account-email">{access.user.email}</p>
            ) : (
              <p>Acceso de empresas</p>
            )}
            {access.organization && <p>{access.organization.name}</p>}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="account-actions">
              {access.mode === "company" && (
                <Link
                  to="/settings"
                  className="button secondary"
                  onClick={() => setOpen(false)}
                >
                  Configuración
                </Link>
              )}
              {!offline.offline && access.mode !== "company" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    access.openAccount();
                  }}
                >
                  Acceso de empresas
                </Button>
              )}
              {(access.user || offline.offline) && (
                <Button
                  icon={LogOut}
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void closeSession()}
                >
                  {busy
                    ? "Cerrando sesión…"
                    : offline.offline
                      ? "Bloquear copia"
                      : "Cerrar sesión"}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
