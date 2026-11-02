import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  Blocks,
  CreditCard,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Truck,
  UsersRound,
} from "lucide-react";
import { Badge, Button, Empty, Field, Modal } from "../components/ui";
import { getSupabaseClient } from "../integrations/supabase/client";
import type { Json } from "../integrations/supabase/database.types";
import {
  accountLabel,
  featureLabels,
  exampleCatalog,
  subscriptionPrice,
} from "../domain/subscriptions";
import type {
  AdminSnapshot,
  Customer,
  Feature,
  Plan,
} from "../domain/subscriptions";
import { money } from "../lib/format";
import { parseMoney } from "../domain/finance";
import { useAppearance } from "../app/AppearanceContext";
import { ProviderSetup } from "../components/ProviderSetup";

export function AdminConsole({
  email,
  onSignOut,
  onDemo,
}: {
  email: string;
  onSignOut(): Promise<void>;
  onDemo(): void;
}) {
  const appearance = useAppearance();
  const client = getSupabaseClient();
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [tab, setTab] = useState("customers");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void client
      .rpc("tc_admin_control", { p_action: "snapshot", p_data: {} })
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data)
          setError(
            "No se puede abrir el panel. Comprueba que esta cuenta tiene permisos de administrador.",
          );
        else {
          setSnapshot(data as unknown as AdminSnapshot);
          setError("");
        }
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  async function mutate(action: string, data: Json) {
    if (!client || busy) throw new Error("Espera a que termine la operación.");
    setBusy(true);
    setError("");
    setMessage("");
    const previous = snapshot;
    const changes = data as Record<string, unknown>;
    if (action === "module")
      setSnapshot((old) =>
        old
          ? {
              ...old,
              modules: old.modules.map((m) =>
                m.id === changes.id
                  ? { ...m, enabled: Boolean(changes.enabled) }
                  : m,
              ),
            }
          : old,
      );
    if (action === "settings")
      setSnapshot((old) =>
        old ? { ...old, settings: { ...old.settings, ...changes } } : old,
      );
    try {
      const { error } = await client.rpc("tc_admin_control", {
        p_action: action,
        p_data: data,
      });
      if (error)
        throw new Error(
          "No se ha guardado el cambio. Revisa los datos y tus permisos.",
        );
      setRevision((n) => n + 1);
      setMessage("Cambio guardado. Se aplica en los permisos del servidor.");
    } catch (e) {
      if (action === "module" || action === "settings") setSnapshot(previous);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    { id: "customers", label: "Clientes", icon: UsersRound },
    { id: "modules", label: "Módulos", icon: Blocks },
    { id: "plans", label: "Planes y cobros", icon: CreditCard },
    { id: "activity", label: "Actividad", icon: Activity },
    { id: "providers", label: "Servicios", icon: ShieldCheck },
  ];
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="portal-brand">
          <span className="brand-mark">
            <Truck size={25} />
          </span>
          <span>
            TruckControl <b>AI</b>
            <small>ADMINISTRACIÓN</small>
          </span>
        </div>
        <div className="admin-account">
          <Button variant="secondary" onClick={appearance.open}>
            Apariencia
          </Button>
          <ShieldCheck size={18} />
          <span>{email}</span>
          <Button
            variant="ghost"
            icon={LogOut}
            onClick={() =>
              void onSignOut().catch(() =>
                setError("No se ha podido cerrar la sesión."),
              )
            }
          >
            Salir
          </Button>
        </div>
      </header>
      <div className="admin-intro">
        <div>
          <p className="eyebrow">CONTROL DE LA PLATAFORMA</p>
          <h1>Tu centro de administración</h1>
          <p>
            Gestiona clientes, pruebas, planes y módulos desde una sola cuenta.
          </p>
        </div>
        <div className="inline-actions">
          <Button variant="secondary" onClick={onDemo}>
            Ver demo de flota
          </Button>
          <Button
            variant="secondary"
            icon={RefreshCw}
            disabled={busy}
            onClick={() => setRevision((n) => n + 1)}
          >
            Actualizar
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="access-message">
          {message}
        </p>
      )}
      {!snapshot ? (
        <p role="status">Cargando administración…</p>
      ) : (
        <>
          <div className="admin-stats">
            {[
              { label: "Clientes", value: snapshot.customers.length },
              {
                label: "En prueba",
                value: snapshot.customers.filter((c) =>
                  accountLabel(c).startsWith("Prueba ·"),
                ).length,
              },
              {
                label: "Cuentas suspendidas",
                value: snapshot.customers.filter(
                  (c) => c.status === "suspended",
                ).length,
              },
              {
                label: "IA permitida",
                value: snapshot.customers.filter((c) => c.ai_allowed).length,
              },
            ].map((item) => (
              <div className="card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <nav className="admin-tabs" aria-label="Secciones de administración">
            {tabs.map((t) => (
              <Button
                key={t.id}
                variant={tab === t.id ? "primary" : "secondary"}
                icon={t.icon}
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
              >
                {t.label}
              </Button>
            ))}
          </nav>
          {tab === "providers" && <ProviderSetup />}
          {tab === "customers" && (
            <section className="card admin-section">
              <div className="admin-section-heading">
                <h2>Clientes y periodos de prueba</h2>
                <Badge tone="green">
                  {exampleCatalog.trial_days} días Full tras la verificación
                </Badge>
              </div>
              {snapshot.customers.length ? (
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Contacto</th>
                        <th>Estado</th>
                        <th>IA</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.customers.map((c) => (
                        <tr key={c.user_id}>
                          <td>
                            <strong>{c.company_name}</strong>
                            <small>{c.tax_id}</small>
                          </td>
                          <td>
                            {c.contact_name}
                            <small>
                              {c.email} · {c.phone}
                            </small>
                          </td>
                          <td>
                            <Badge
                              tone={c.status === "suspended" ? "red" : "blue"}
                            >
                              {accountLabel(c)}
                            </Badge>
                            <small>
                              Prueba hasta{" "}
                              {new Date(c.trial_ends_at).toLocaleDateString(
                                "es-ES",
                              )}
                            </small>
                          </td>
                          <td>{c.ai_allowed ? "Permitida" : "Desactivada"}</td>
                          <td>
                            <Button
                              variant="secondary"
                              icon={Settings2}
                              onClick={() => setCustomer(c)}
                            >
                              Gestionar {c.company_name}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Todavía no hay clientes activados">
                  Las solicitudes se convertirán en empresas al confirmar el
                  correo y el teléfono.
                </Empty>
              )}
            </section>
          )}
          {tab === "customers" &&
            (snapshot.pending_registrations?.length ?? 0) > 0 && (
              <section className="card admin-section">
                <h2>Solicitudes pendientes de verificación</h2>
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Correo</th>
                        <th>Verificación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.pending_registrations.map((r) => (
                        <tr key={r.id}>
                          <td>{r.company_name || "Empresa pendiente"}</td>
                          <td>{r.email}</td>
                          <td>
                            {r.email_confirmed
                              ? "Correo confirmado"
                              : "Correo pendiente"}{" "}
                            ·{" "}
                            {r.phone_confirmed
                              ? "Teléfono confirmado"
                              : "SMS pendiente"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          {tab === "modules" && (
            <section className="card admin-section">
              <h2>Módulos de la plataforma</h2>
              <p>
                Desactivar un módulo lo bloquea para los clientes. Los datos
                guardados se conservan.
              </p>
              <div className="module-grid">
                {snapshot.modules.map((m) => (
                  <label className="module-toggle" key={m.id}>
                    <span>
                      <strong>{m.label}</strong>
                      <small>
                        {m.id === "invoice_ai"
                          ? "Además requiere permiso por usuario, consentimiento y proveedor configurado."
                          : "Disponible según el plan y los permisos de cada cliente."}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      disabled={busy}
                      onChange={(e) =>
                        void mutate("module", {
                          id: m.id,
                          enabled: e.target.checked,
                        }).catch((e) => setError(e.message))
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          )}
          {tab === "plans" && (
            <>
              <section className="card admin-section">
                <h2>Precios y planes</h2>
                <p>
                  Los cambios se muestran en la entrada de la app. Los precios
                  actuales están marcados como{" "}
                  {snapshot.settings.prices_are_examples
                    ? "ejemplos"
                    : "definitivos"}
                  .
                </p>
                <div className="admin-plan-grid">
                  {snapshot.plans.map((p) => (
                    <article key={p.id}>
                      <Badge tone={p.id === "full" ? "green" : "blue"}>
                        {p.name}
                      </Badge>
                      <h3>
                        {money(p.monthly_cents, p.monthly_cents % 100 !== 0)} /
                        mes
                      </h3>
                      <p>
                        + 21 % IVA · Total:{" "}
                        {money(
                          subscriptionPrice(p.monthly_cents).totalCents,
                          true,
                        )}
                        /mes
                      </p>
                      <p>
                        {p.max_trucks === null
                          ? "Sin límite comercial de camiones"
                          : `Hasta ${p.max_trucks} camiones`}
                      </p>
                      <Button variant="secondary" onClick={() => setPlan(p)}>
                        Editar plan {p.name}
                      </Button>
                    </article>
                  ))}
                </div>
                <div className="module-grid">
                  <label className="module-toggle">
                    <span>
                      <strong>Precios de ejemplo</strong>
                      <small>
                        Con esta opción activa no se pueden generar cobros.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={snapshot.settings.prices_are_examples}
                      disabled={busy}
                      onChange={(e) =>
                        void mutate("settings", {
                          prices_are_examples: e.target.checked,
                          ...(e.target.checked
                            ? { payments_enabled: false }
                            : {}),
                        }).catch((e) => setError(e.message))
                      }
                    />
                  </label>
                  <label className="module-toggle">
                    <span>
                      <strong>Cobros de suscripción</strong>
                      <small>
                        Requiere precios definitivos y procesador conectado.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={snapshot.settings.payments_enabled}
                      disabled={busy || snapshot.settings.prices_are_examples}
                      onChange={(e) =>
                        void mutate("settings", {
                          payments_enabled: e.target.checked,
                        }).catch((e) => setError(e.message))
                      }
                    />
                  </label>
                  <label className="module-toggle">
                    <span>
                      <strong>Aceptar nuevos registros</strong>
                      <small>
                        Las cuentas existentes conservarán su estado.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={snapshot.settings.registration_open}
                      disabled={busy}
                      onChange={(e) =>
                        void mutate("settings", {
                          registration_open: e.target.checked,
                        }).catch((e) => setError(e.message))
                      }
                    />
                  </label>
                </div>
                <div className="setup-notice">
                  <ShieldCheck size={21} />
                  <p>
                    Confirmación de correo obligatoria. SMS:{" "}
                    {snapshot.settings.sms_ready
                      ? "habilitado"
                      : "pendiente de conectar un proveedor"}
                    . Los cobros y la IA permanecen desactivados hasta
                    configurar y autorizar sus servicios.
                  </p>
                </div>
              </section>
              <section className="card admin-section">
                <h2>Solicitudes de plan</h2>
                {snapshot.payment_requests.length ? (
                  <div className="admin-table-scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Empresa</th>
                          <th>Plan</th>
                          <th>Total acordado</th>
                          <th>Estado</th>
                          <th>Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.payment_requests.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {snapshot.customers.find(
                                (c) => c.user_id === r.user_id,
                              )?.company_name ?? "Cliente"}
                            </td>
                            <td>{r.plan_id}</td>
                            <td>
                              {money(r.quoted_cents, true)}
                              {r.net_cents != null && r.vat_cents != null && (
                                <small>
                                  Base {money(r.net_cents, true)} + IVA{" "}
                                  {money(r.vat_cents, true)}
                                </small>
                              )}
                            </td>
                            <td>
                              {r.status === "paid"
                                ? "Confirmado"
                                : r.status === "checkout"
                                  ? "En proceso"
                                  : "Solicitado"}
                            </td>
                            <td>
                              {r.status !== "paid" && (
                                <ManualPayment
                                  requestId={r.id}
                                  disabled={
                                    busy ||
                                    snapshot.settings.prices_are_examples
                                  }
                                  onSave={(receipt) =>
                                    mutate("manual_payment", {
                                      request_id: r.id,
                                      receipt,
                                    })
                                  }
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>
                    Las solicitudes aparecerán cuando un cliente elija su plan.
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "activity" && (
            <section className="card admin-section">
              <h2>Actividad administrativa</h2>
              {snapshot.audit.length ? (
                <ul className="admin-activity">
                  {snapshot.audit.map((a) => (
                    <li key={a.id}>
                      <strong>
                        {(
                          {
                            module: "Cambio de módulo",
                            customer: "Permisos de cliente",
                            plan: "Edición de plan",
                            settings: "Configuración",
                            manual_payment: "Pago confirmado",
                            provider_google_set:
                              "Configuración de Gmail actualizada",
                          } as Record<string, string>
                        )[a.action] ?? a.action}
                      </strong>
                      <span>{a.target_id || "Plataforma"}</span>
                      <time>
                        {new Date(a.created_at).toLocaleString("es-ES")}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Los cambios de módulos, clientes, precios y cobros quedarán
                  registrados aquí.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {customer && (
        <CustomerControls
          customer={customer}
          onClose={() => setCustomer(null)}
          onSave={(data) =>
            mutate("customer", data).then(() => setCustomer(null))
          }
        />
      )}
      {plan && (
        <PlanControls
          plan={plan}
          onClose={() => setPlan(null)}
          onSave={(data) => mutate("plan", data).then(() => setPlan(null))}
        />
      )}
    </main>
  );
}
function CustomerControls({
  customer,
  onClose,
  onSave,
}: {
  customer: Customer;
  onClose(): void;
  onSave(data: Json): Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const overrides: Record<string, boolean> = {};
    for (const key of Object.keys(featureLabels)) {
      const v = data.get(key);
      if (v === "enabled" || v === "disabled") overrides[key] = v === "enabled";
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        user_id: customer.user_id,
        suspended: data.get("suspended") === "on",
        ai_allowed: data.get("ai_allowed") === "on",
        module_overrides: overrides,
      });
    } catch {
      setError("No se han guardado los permisos. Reinténtalo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Gestionar ${customer.company_name}`}
      subtitle="Cambiar permisos no reinicia el período de prueba."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <label className="check-row">
          <input
            type="checkbox"
            name="suspended"
            defaultChecked={customer.status === "suspended"}
            disabled={busy}
          />
          Suspender acceso de esta cuenta
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            name="ai_allowed"
            defaultChecked={customer.ai_allowed}
            disabled={busy}
          />
          Permitir lectura IA a este usuario
        </label>
        <p>
          El cliente también debe optar por usar IA. La habilitación global y el
          proveedor son requisitos adicionales.
        </p>
        <div className="integration-fields">
          {Object.entries(featureLabels)
            .filter(([key]) => key !== "invoice_ai")
            .map(([key, label]) => (
              <Field key={key} label={label}>
                <select
                  name={key}
                  disabled={busy}
                  defaultValue={
                    customer.module_overrides[key as Feature] === undefined
                      ? "plan"
                      : customer.module_overrides[key as Feature]
                        ? "enabled"
                        : "disabled"
                  }
                >
                  <option value="plan">Según el plan</option>
                  <option value="enabled">Habilitado para este cliente</option>
                  <option value="disabled">
                    Desactivado para este cliente
                  </option>
                </select>
              </Field>
            ))}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar permisos"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function PlanControls({
  plan,
  onClose,
  onSave,
}: {
  plan: Plan;
  onClose(): void;
  onSave(data: Json): Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const modules = Object.fromEntries(
        Object.keys(featureLabels).map((k) => [k, data.get(k) === "on"]),
      );
      await onSave({
        id: plan.id,
        name: String(data.get("name")),
        monthly_cents: parseMoney(String(data.get("price"))),
        max_trucks: data.get("max_trucks")
          ? Number(data.get("max_trucks"))
          : null,
        modules,
        published: data.get("published") === "on",
      });
    } catch {
      setError("Revisa el precio y los límites del plan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Editar plan ${plan.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="access-form" onSubmit={save}>
        <Field label="Nombre del plan">
          <input
            name="name"
            required
            maxLength={50}
            defaultValue={plan.name}
            disabled={busy}
          />
        </Field>
        <Field label="Precio mensual sin IVA (€)">
          <input
            name="price"
            required
            inputMode="decimal"
            defaultValue={(plan.monthly_cents / 100)
              .toFixed(2)
              .replace(".", ",")}
            disabled={busy}
          />
        </Field>
        <p>
          Al precio mensual se añade el 21 % de IVA. Los cambios se aplican a
          nuevas solicitudes.
        </p>
        <Field label="Límite de camiones">
          <input
            type="number"
            name="max_trucks"
            min={1}
            max={10000}
            defaultValue={plan.max_trucks ?? ""}
            placeholder="Sin límite comercial"
            disabled={busy}
          />
        </Field>
        <label className="check-row">
          <input
            name="published"
            type="checkbox"
            defaultChecked={plan.published !== false}
            disabled={busy}
          />
          Mostrar este plan en la entrada
        </label>
        <div className="module-grid">
          {Object.entries(featureLabels).map(([key, label]) => (
            <label className="check-row" key={key}>
              <input
                name={key}
                type="checkbox"
                defaultChecked={plan.modules[key as Feature]}
                disabled={busy}
              />
              {label}
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Guardar plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ManualPayment({
  requestId,
  disabled,
  onSave,
}: {
  requestId: string;
  disabled: boolean;
  onSave(receipt: string): Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Registrar pago confirmado
      </Button>
      {open && (
        <Modal
          title="Confirmar pago recibido"
          subtitle="Registra únicamente un pago que ya hayas comprobado."
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const receipt = String(
                new FormData(e.currentTarget).get("receipt"),
              );
              setBusy(true);
              void onSave(receipt)
                .then(() => setOpen(false))
                .catch(() => setError("No se ha registrado el pago."))
                .finally(() => setBusy(false));
            }}
          >
            <Field label="Referencia del pago">
              <input
                name="receipt"
                minLength={3}
                maxLength={160}
                required
                disabled={busy}
              />
            </Field>
            <p>
              Se habilitará un mes del plan solicitado. La solicitud{" "}
              {requestId.slice(0, 8)} quedará marcada como pagada.
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions">
              <Button type="submit" disabled={busy}>
                Confirmar pago y activar plan
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
