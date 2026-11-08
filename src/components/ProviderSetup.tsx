import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  googleClientSchema,
  googleSecretSchema,
  parseGoogleClientFile,
  providerStatusSchema,
  checkGoogleConfiguration,
} from "../integrations/supabase/provider-setup";
import type { ProviderStatus } from "../integrations/supabase/provider-setup";
import { Badge, Button, Field } from "./ui";
import { t } from "../i18n/runtime";

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
  const mounted = useRef(true);
  const [googleChecked, setGoogleChecked] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
    setClientId((previous) => previous || next.google.client_id || "");
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
            const next = providerStatusSchema.parse(data);
            setStatus(next);
            setClientId((previous) => previous || next.google.client_id || "");
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
    setGoogleChecked(false);
    let saved = false;
    try {
      const id = googleClientSchema.safeParse(clientId),
        value = googleSecretSchema.safeParse(secret);
      if (!id.success || !value.success)
        throw Error(
          "Usa el ID del proyecto TruckControl y el secreto completo, sin asteriscos.",
        );
      await checkGoogleConfiguration(client, {
        client_id: id.data,
        client_secret: value.data,
      });
      if (!mounted.current) return;
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
      saved = true;
      if (!mounted.current) return;
      setStatus(providerStatusSchema.parse(data));
      setSecret("");
      setClientId(id.data);
      setConfirmed(false);
      setReplace(false);
      if (fileInput.current) fileInput.current.value = "";
      await checkGoogleConfiguration(client);
      if (!mounted.current) return;
      setGoogleChecked(true);
      setMessage(
        "Credenciales guardadas en el almacén cifrado y aceptadas por Google. Cada empresa debe autorizar su propio buzón; esta comprobación no conecta ni lee correos.",
      );
    } catch (e) {
      if (mounted.current)
        setError(
          t(
            saved
              ? "La configuración se ha guardado, pero su comprobación ha fallado. {0}"
              : "No se ha guardado la configuración. {0}",
            [
              e instanceof Error
                ? e.message
                : t("No se ha podido comprobar Google."),
            ],
          ),
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function checkStoredConfiguration() {
    if (!client || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setGoogleChecked(false);
    try {
      await checkGoogleConfiguration(client);
      if (mounted.current) {
        setGoogleChecked(true);
        setMessage(
          "Google acepta las credenciales del servidor. La autorización de cada buzón y la revisión pública de permisos se comprueban por separado.",
        );
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "No se ha podido comprobar Google.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
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
              name: "Credenciales de Gmail empresarial",
              ready: status.google.configured,
              badgeLabel: status.google.configured
                ? "Configuración guardada"
                : "Configuración pendiente",
              detail: status.google.configured
                ? `Vínculos de empresa registrados: ${status.google.connections}. Cada empresa autoriza su propio buzón.`
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
                {row.badgeLabel ??
                  (row.ready ? "Habilitado" : "Pendiente o desactivado")}
              </Badge>
              <p>{row.detail}</p>
            </div>
          ))}
        </div>
      )}
      {status && (
        <section
          className="settings-card gmail-link-readiness"
          aria-label="Vinculación de buzones de empresa"
        >
          <h3>Vinculación de buzones de empresa</h3>
          <p role="status" aria-live="polite">
            {status.google.connections === 0
              ? "Ningún buzón de empresa vinculado."
              : `${status.google.connections} ${status.google.connections === 1 ? "vínculo de empresa registrado" : "vínculos de empresa registrados"}. Comprueba el estado individual en Correo y facturas.`}
          </p>
          <p>
            El administrador de cada empresa autoriza su buzón desde Correo y
            facturas. Este panel muestra la configuración global; la revisión de
            permisos se gestiona en Google.
          </p>
          <details>
            <summary>Preparar la prueba de facturas</summary>
            <ol>
              <li>
                Entrar con una cuenta administradora de empresa con Gmail
                habilitado y seleccionar la empresa de prueba.
              </li>
              <li>
                En Correo y facturas, conectar Gmail de esta empresa y comprobar
                que Google devuelve a la misma empresa.
              </li>
              <li>
                Usar una factura ficticia recibida: últimos 30 días por defecto
                o fechas dentro de los últimos 12 meses. La lectura IA requiere
                habilitación y consentimiento de esa cuenta.
              </li>
              <li>
                Revisar el documento y los importes antes de registrar el gasto;
                repetir la importación para comprobar que no se duplica.
              </li>
            </ol>
          </details>
          <p>
            <a
              href="/examples/factura-demostracion.pdf"
              download="TruckControl-factura-ficticia.pdf"
            >
              Descargar factura ficticia
            </a>
          </p>
          <p>
            <a
              href="https://console.cloud.google.com/auth/verification?project=468881730124"
              target="_blank"
              rel="noopener noreferrer"
            >
              Consultar revisión de permisos en Google
            </a>
          </p>
        </section>
      )}
      <h3>
        <Plug size={18} /> Configurar Google para Gmail
      </h3>
      <p>
        Cliente web «TruckControl AI Gmail», proyecto TruckControlAI. Retorno:{" "}
        <code>https://truckcontrolai.com/gmail-callback</code>. La configuración
        no vincula ningún buzón ni publica la aplicación en Google.
      </p>
      <p role="status" aria-live="polite">
        {googleChecked
          ? "Credenciales comprobadas con Google."
          : "La configuración guardada todavía no se ha comprobado con Google en esta sesión."}
      </p>
      <Button
        variant="secondary"
        icon={RefreshCw}
        disabled={busy || !status?.google.vault_available}
        onClick={() => void checkStoredConfiguration()}
      >
        Comprobar credenciales con Google
      </Button>
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
