import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  googleClientSchema,
  googleSecretSchema,
  parseGoogleClientFile,
  providerStatusSchema,
} from "../integrations/supabase/provider-setup";
import type { ProviderStatus } from "../integrations/supabase/provider-setup";
import { Badge, Button, Field } from "./ui";

export function ProviderSetup() {
  const client = getSupabaseClient(),
    [status, setStatus] = useState<ProviderStatus | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [clientId, setClientId] = useState(""),
    [secret, setSecret] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [replace, setReplace] = useState(false),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    fileInput = useRef<HTMLInputElement>(null);
  async function refresh() {
    if (!client) return;
    const { data, error } = await client.rpc("tc_provider_control", {
      p_action: "status",
      p_data: {},
    });
    if (error || !data)
      throw Error(
        "No se puede comprobar el estado. Verifica tu cuenta administradora y la conexión.",
      );
    const next = providerStatusSchema.parse(data);
    setStatus(next);
    return next;
  }
  useEffect(() => {
    let active = true;
    if (client)
      void client
        .rpc("tc_provider_control", { p_action: "status", p_data: {} })
        .then(({ data, error }) => {
          if (!active) return;
          try {
            if (error || !data) throw Error();
            setStatus(providerStatusSchema.parse(data));
          } catch {
            setError(
              "No se puede comprobar el estado. Solo la administración global tiene acceso.",
            );
          }
        });
    return () => {
      active = false;
    };
  }, [client]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !client || !confirmed) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const id = googleClientSchema.safeParse(clientId),
        value = googleSecretSchema.safeParse(secret);
      if (!id.success || !value.success)
        throw Error(
          "Usa el ID del proyecto TruckControl y el secreto completo, sin asteriscos.",
        );
      const { data, error } = await client.rpc("tc_provider_control", {
        p_action: "set_google",
        p_data: {
          client_id: id.data,
          client_secret: value.data,
          replace_existing: replace,
        },
      });
      if (error || !data)
        throw Error(
          "No se ha guardado. Comprueba la autorización, la confirmación de sustitución y que no haya buzones vinculados ni autorizaciones en curso.",
        );
      setStatus(providerStatusSchema.parse(data));
      setSecret("");
      setClientId("");
      setConfirmed(false);
      setReplace(false);
      if (fileInput.current) fileInput.current.value = "";
      setMessage(
        "Credenciales guardadas en el almacén cifrado. Cada empresa debe autorizar su Gmail para comprobar la conexión.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se ha podido guardar la configuración.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="card admin-section provider-setup"
      aria-label="Configuración de servicios"
    >
      <div className="admin-section-heading">
        <div>
          <h2>Servicios y conexiones</h2>
          <p>
            Estado de la plataforma y configuración reservada al administrador
            global.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={busy}
          onClick={() =>
            void refresh()
              .then(() => setError(""))
              .catch(() => setError("No se ha podido actualizar el estado."))
          }
        >
          Comprobar servicios
        </Button>
      </div>
      {status && (
        <div className="settings-grid">
          {[
            {
              name: "Correo de acceso",
              ready: status.auth_mail.enabled && status.auth_mail.legal_ready,
              detail: "Confirmación de cuentas y recuperación de contraseñas.",
            },
            {
              name: "Recepción de facturas",
              ready: status.receiving.enabled,
              detail: status.receiving.domain
                ? `Reenvío por empresa en ${status.receiving.domain}.`
                : "Receptor pendiente de configurar.",
            },
            {
              name: "Asistente IA",
              ready: status.ai.enabled,
              detail: `Presupuesto de plataforma: ${(status.ai.monthly_budget_cents / 100).toLocaleString("es-ES")} USD/mes antes de impuestos. Su uso requiere permiso y consentimiento.`,
            },
            {
              name: "Gmail directo",
              ready: status.google.configured,
              detail: status.google.configured
                ? "Credenciales guardadas; la autorización de cada buzón se realiza desde su empresa."
                : "Falta una pareja válida de credenciales Google.",
            },
            {
              name: "Cobros automáticos",
              ready: status.payments_enabled,
              detail: status.payments_enabled
                ? "Revisar también la configuración del procesador."
                : "Desactivados. No se cobra por guardar esta configuración.",
            },
            {
              name: "Verificación SMS",
              ready: status.sms_enabled,
              detail: status.sms_enabled
                ? "Requiere el proveedor de SMS correspondiente."
                : "Desactivada; el correo de confirmación sigue disponible.",
            },
          ].map((row) => (
            <div className="settings-card" key={row.name}>
              <h3>{row.name}</h3>
              <Badge tone={row.ready ? "green" : "amber"}>
                {row.ready ? "Habilitado" : "Pendiente o desactivado"}
              </Badge>
              <p>{row.detail}</p>
            </div>
          ))}
        </div>
      )}
      <h3>
        <Plug size={18} /> Configurar Google para Gmail
      </h3>
      <p>
        Cliente web «TruckControl AI Gmail», proyecto TruckControlAI. Retorno:{" "}
        <code>https://truckcontrolai.com/gmail-callback</code>. La configuración
        no vincula ningún buzón ni publica la aplicación en Google.
      </p>
      <p>
        <a
          href="https://console.cloud.google.com/auth/clients?project=468881730124"
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir el cliente en Google
        </a>
        . Su secreto solo se utiliza para guardarlo en el backend; nunca se
        devuelve desde este panel.
      </p>
      <form className="provider-secret-form" onSubmit={(e) => void save(e)}>
        <Field label="Importar JSON del cliente web Google">
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            disabled={busy || Boolean(status?.google.connections)}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              setSecret("");
              setClientId("");
              setConfirmed(false);
              setReplace(false);
              if (file.size > 16384) {
                setError("El JSON supera 16 KB.");
                return;
              }
              void file
                .text()
                .then((text) => {
                  const parsed = parseGoogleClientFile(text);
                  setClientId(parsed.client_id);
                  setSecret(parsed.client_secret);
                })
                .catch(() =>
                  setError(
                    "El JSON no corresponde a TruckControl o no contiene un secreto completo.",
                  ),
                );
            }}
          />
        </Field>
        <Field label="ID del cliente web de TruckControl">
          <input
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setConfirmed(false);
              setReplace(false);
            }}
            autoComplete="off"
            maxLength={255}
            disabled={busy || Boolean(status?.google.connections)}
            required
          />
        </Field>
        <Field label="Secreto nuevo de Google">
          <input
            type="password"
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              setConfirmed(false);
              setReplace(false);
            }}
            autoComplete="off"
            maxLength={256}
            disabled={busy || Boolean(status?.google.connections)}
            required
          />
        </Field>
        <Field label="Confirmo que guardaré la configuración de TruckControl">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            required
            disabled={busy}
          />
        </Field>
        {status?.google.configured && (
          <Field label="Confirmo sustituir la configuración existente">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              required
              disabled={busy}
            />
          </Field>
        )}
        {Boolean(status?.google.connections) && (
          <p>
            Hay buzones vinculados. La sustitución requiere un procedimiento de
            mantenimiento.
          </p>
        )}
        <Button
          type="submit"
          icon={ShieldCheck}
          disabled={
            busy ||
            !status?.google.vault_available ||
            Boolean(status?.google.connections)
          }
        >
          Guardar Google de forma segura
        </Button>
      </form>
      <p>
        Si Google oculta un secreto antiguo, utiliza su procedimiento oficial
        para obtener uno nuevo. No pegues secretos en el chat. Las versiones
        anteriores se conservan cifradas al sustituirlas. La aprobación pública
        de Google y la autorización de los buzones son pasos independientes.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
