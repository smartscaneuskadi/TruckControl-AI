import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { FileText, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { errorMessage, useFleet } from "../app/FleetProvider";
import { getSupabaseClient } from "../integrations/supabase/client";
import type {
  CompanyGmail,
  CompanyInvoice,
} from "../integrations/supabase/database.types";
import { downloadCompanyDocument } from "../integrations/supabase/documents";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeading,
} from "../components/ui";
import { categories, entrySchema } from "../domain/models";
import { parseMoney } from "../domain/finance";
import { money } from "../lib/format";

const demoEntryId = "b1000000-0000-4000-8000-000000000001";
interface IntegrationStatus {
  oauth_ready: boolean;
  ai_enabled: boolean;
}
export function Invoices() {
  const subscription = useSubscription();
  const access = useCompany();
  const { snapshot, execute, refresh, notify } = useFleet();
  const client = getSupabaseClient();
  const cloud = access.mode === "company" && Boolean(client);
  const [connection, setConnection] = useState<CompanyGmail | null>(null);
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [invoices, setInvoices] = useState<CompanyInvoice[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(cloud);
  const [review, setReview] = useState<CompanyInvoice | null>(null);
  const [disconnect, setDisconnect] = useState(false);
  const org = snapshot.organization.id;
  const [callback] = useState(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] ?? "",
    );
    return {
      ticket: params.get("gmail_ticket"),
      error: params.get("gmail_error"),
    };
  });
  const completion = useRef<PromiseLike<{ error: unknown }> | null>(null);
  useEffect(() => {
    if (!callback.ticket && !callback.error) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#/invoices`,
    );
    if (callback.error) {
      setError(
        "No se ha conectado Gmail. La autorización se ha cancelado o ha caducado. Inténtalo de nuevo.",
      );
      return;
    }
    if (!cloud || !client || !callback.ticket) return;
    let active = true;
    setBusy(true);
    completion.current ??= client.functions.invoke("company-gmail", {
      body: {
        action: "complete",
        organization_id: org,
        ticket: callback.ticket,
      },
    });
    void Promise.resolve(completion.current)
      .then(({ error }) => {
        if (!active) return;
        if (error)
          setError(
            "No se ha conectado Gmail. Debes finalizar la autorización con la misma cuenta y empresa que la iniciaron.",
          );
        else {
          notify("Gmail conectado a esta empresa.");
          setRevision((n) => n + 1);
        }
      })
      .catch(() => {
        if (active)
          setError("No se ha podido finalizar la autorización de Gmail.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [callback, cloud, client, org, notify]);
  useEffect(() => {
    if (!cloud || !client) return;
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      client.rpc("get_company_gmail", { p_organization_id: org }),
      client.rpc("list_company_invoices", { p_organization_id: org }),
      client.functions.invoke<IntegrationStatus>("company-gmail", {
        body: { action: "status", organization_id: org },
      }),
    ])
      .then(([gmail, docs, config]) => {
        if (!active) return;
        setLoading(false);
        if (gmail.error || docs.error) {
          setError("No se ha podido cargar la bandeja de esta empresa.");
          return;
        }
        setConnection(gmail.data?.[0] ?? null);
        setInvoices(docs.data ?? []);
        setStatus(config.error ? null : config.data);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setError("No se puede conectar con la bandeja de facturas.");
        }
      });
    return () => {
      active = false;
    };
  }, [cloud, client, org, revision]);
  async function gmailAction(action: "start" | "sync" | "disconnect") {
    if (!cloud || !client || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await client.functions.invoke<{
        url?: string;
        imported?: number;
        failures?: number;
        error?: string;
      }>("company-gmail", { body: { action, organization_id: org } });
      if (error || data?.error)
        throw new Error(
          action === "start"
            ? "Gmail todavía no está disponible. La autorización de Google debe estar activada para esta aplicación."
            : "No se ha podido completar la operación de Gmail. Revisa la conexión e inténtalo de nuevo.",
        );
      if (action === "start") {
        const url = new URL(data?.url ?? "");
        if (
          url.origin !== "https://accounts.google.com" ||
          url.pathname !== "/o/oauth2/v2/auth"
        )
          throw new Error(
            "No se ha recibido una autorización válida de Google.",
          );
        window.location.assign(url.href);
      } else {
        setRevision((n) => n + 1);
        setDisconnect(false);
        notify(
          action === "sync"
            ? `${data?.imported ?? 0} facturas nuevas pendientes de revisión.`
            : "Gmail desconectado de esta empresa.",
        );
        if (data?.failures)
          setError(
            `${data.failures} adjuntos no se han podido guardar. Puedes volver a importar; las facturas ya guardadas no se duplicarán.`,
          );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const sample: CompanyInvoice = {
    id: "c1000000-0000-4000-8000-000000000001",
    organization_id: org,
    message_id: "demo",
    attachment_id: "demo",
    content_hash: "",
    document_id: "",
    supplier: "Taller Ejemplo · proveedor ficticio",
    invoice_number: "DEMO-001",
    invoice_date: `${snapshot.demoMonth}-15`,
    net_cents: 10000,
    tax_cents: 2100,
    total_cents: 12100,
    currency: "EUR",
    status: snapshot.entries.some((e) => e.id === demoEntryId)
      ? "approved"
      : "needs_review",
    review_note:
      "Ejemplo ficticio. No se ha leído ningún correo ni utilizado un modelo IA.",
    finance_entry_id: null,
    created_at: "",
  };
  const rows = cloud ? invoices : [sample];
  async function approve(invoice: CompanyInvoice, form: FormData) {
    const net = parseMoney(String(form.get("net")));
    const taxText = String(form.get("tax")).trim();
    const tax = /^0([.,]0{1,2})?$/.test(taxText) ? 0 : parseMoney(taxText);
    const total = parseMoney(String(form.get("total")));
    if (total !== net + tax)
      throw new Error("El total debe coincidir con la base más el IVA.");
    const entry = entrySchema.parse({
      id: demoEntryId,
      truckId: String(form.get("truck")),
      kind: "expense",
      concept: String(form.get("concept")),
      date: String(form.get("date")),
      amountCents: net,
      category: String(form.get("category")),
      paymentStatus: "pending",
      distanceKm: 0,
    });
    if (cloud && client) {
      const { error } = await client.rpc("approve_company_invoice", {
        p_organization_id: org,
        p_invoice_id: invoice.id,
        p_entry: {
          truck_id: entry.truckId,
          concept: entry.concept,
          date: entry.date,
          category: entry.category,
          net_cents: net,
          tax_cents: tax,
          total_cents: total,
        },
      });
      if (error)
        throw new Error(
          "No se ha registrado la factura. Comprueba la fecha, los importes y el camión de esta empresa.",
        );
      await refresh();
      setRevision((n) => n + 1);
    } else if (!snapshot.entries.some((e) => e.id === demoEntryId))
      await execute({ type: "save-entry", value: entry });
    notify(
      cloud
        ? "Factura registrada como gasto pendiente de pago."
        : "Gasto ficticio añadido a la demo.",
    );
    setReview(null);
  }
  async function download(invoice: CompanyInvoice) {
    if (!client || !cloud) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await client.rpc("get_company_document", {
        p_organization_id: org,
        p_document_id: invoice.document_id,
      });
      const doc = data?.[0];
      if (error || !doc)
        throw new Error("El documento no está disponible en esta empresa.");
      await downloadCompanyDocument(client, doc.object_path, doc.name);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="BANDEJA DE FACTURAS"
        title="De tu Gmail a tus gastos"
        description="Una cuenta Gmail independiente para cada empresa. Revisa cada factura antes de registrarla."
      />
      <section className="card integration-card">
        <div className="integration-status">
          <span className="settings-icon">
            <Mail size={28} />
          </span>
          <Badge tone={connection ? "green" : cloud ? "amber" : "blue"}>
            {connection
              ? connection.email
              : cloud
                ? "Gmail sin conectar"
                : "Demostración · datos ficticios"}
          </Badge>
        </div>
        <h2>
          {cloud
            ? snapshot.organization.name
            : "Prueba la revisión de una factura"}
        </h2>
        <p>
          {cloud
            ? "Autoriza el buzón de esta empresa en Google. TruckControl solo leerá los adjuntos de mensajes con facturas; no enviará correos ni cambiará tu buzón."
            : "Esta factura de ejemplo permite probar el registro de un gasto. Gmail y la lectura IA todavía no están activos en la demostración."}
        </p>
        {cloud && (
          <p>
            Importa hasta 10 adjuntos nuevos por pasada de mensajes de los
            últimos 30 días que contengan «factura» o «invoice».
          </p>
        )}
        <div className="config-fact">
          <ShieldCheck size={18} /> Documentos y conexión separados por empresa
        </div>
        {cloud && subscription.enabled && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={subscription.access?.profile?.ai_opt_in ?? false}
              disabled={busy || !subscription.access?.profile?.ai_allowed}
              onChange={(e) => {
                if (!client) return;
                setBusy(true);
                setError("");
                void Promise.resolve(
                  client.rpc("tc_set_ai_opt_in", {
                    p_enabled: e.target.checked,
                  }),
                )
                  .then(({ error }) => {
                    if (error)
                      setError("No se ha podido cambiar tu preferencia de IA.");
                    else subscription.refresh();
                  })
                  .finally(() => setBusy(false));
              }}
            />
            <span>
              Usar lectura IA para mis facturas{" "}
              {subscription.access?.profile?.ai_allowed
                ? "(opcional)"
                : "· pendiente de autorización del administrador"}
            </span>
          </label>
        )}
        {cloud ? (
          <>
            <p>
              {!status?.oauth_ready
                ? "La conexión Gmail está pendiente de activación por el administrador."
                : status.ai_enabled
                  ? "Lectura IA habilitada. Los resultados siempre requieren tu revisión."
                  : "Lectura IA desactivada. Puedes importar los documentos y completar sus datos manualmente."}
            </p>
            <div className="inline-actions">
              {connection ? (
                <>
                  <Button
                    icon={RefreshCw}
                    disabled={busy || connection.status !== "connected"}
                    onClick={() => void gmailAction("sync")}
                  >
                    {busy ? "Importando…" : "Importar facturas"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void gmailAction("start")}
                  >
                    Cambiar o renovar cuenta
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Unplug}
                    disabled={busy}
                    onClick={() => setDisconnect(true)}
                  >
                    Desconectar
                  </Button>
                </>
              ) : (
                <Button
                  icon={Mail}
                  disabled={busy || !status?.oauth_ready}
                  onClick={() => void gmailAction("start")}
                >
                  Conectar Gmail de esta empresa
                </Button>
              )}
            </div>
            {connection?.last_sync_at && (
              <p>
                Última importación:{" "}
                {new Date(connection.last_sync_at).toLocaleString("es-ES")}
              </p>
            )}
            {connection?.status === "reauthorize" && (
              <p className="invoice-review-note">
                Google solicita renovar el permiso. Conecta de nuevo esta
                cuenta.
              </p>
            )}
          </>
        ) : (
          <Button onClick={access.openAccount}>Acceso de empresas</Button>
        )}
      </section>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando facturas…</p>
      ) : rows.length ? (
        <div className="document-grid">
          {rows.map((invoice) => (
            <article className="card document-card" key={invoice.id}>
              <FileText size={25} />
              <Badge tone={invoice.status === "approved" ? "green" : "amber"}>
                {invoice.status === "approved" ? "Registrada" : "Revisar"}
              </Badge>
              <h2>{invoice.supplier || "Proveedor pendiente"}</h2>
              <p>
                {invoice.invoice_number || "Sin número"} ·{" "}
                {invoice.invoice_date || "Fecha pendiente"}
              </p>
              <div className="invoice-amounts">
                <span>
                  Base
                  <strong>
                    {invoice.net_cents === null
                      ? "—"
                      : money(invoice.net_cents, true)}
                  </strong>
                </span>
                <span>
                  IVA
                  <strong>
                    {invoice.tax_cents === null
                      ? "—"
                      : money(invoice.tax_cents, true)}
                  </strong>
                </span>
                <span>
                  Total
                  <strong>
                    {invoice.total_cents === null
                      ? "—"
                      : money(invoice.total_cents, true)}
                  </strong>
                </span>
              </div>
              {invoice.review_note && (
                <p className="invoice-review-note">{invoice.review_note}</p>
              )}
              {invoice.currency !== "EUR" && (
                <p className="invoice-review-note">
                  Moneda {invoice.currency}: el registro requiere conversión
                  manual y no está disponible en esta versión.
                </p>
              )}
              <div className="inline-actions">
                <Button
                  disabled={
                    busy ||
                    invoice.status === "approved" ||
                    invoice.currency !== "EUR"
                  }
                  onClick={() => setReview(invoice)}
                >
                  Revisar factura
                </Button>
                {cloud && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void download(invoice)}
                  >
                    Ver original
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="card">
          <Empty title="Sin facturas importadas">
            Conecta Gmail e importa los adjuntos de esta empresa para empezar.
          </Empty>
        </section>
      )}
      {review && (
        <InvoiceReview
          invoice={review}
          onClose={() => setReview(null)}
          onApprove={approve}
          cloud={cloud}
        />
      )}
      {disconnect && (
        <Modal
          title="Desconectar Gmail de esta empresa"
          onClose={() => {
            if (!busy) setDisconnect(false);
          }}
        >
          <p>
            Se eliminará la autorización guardada para esta empresa. Los
            documentos y gastos ya registrados se conservarán.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDisconnect(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void gmailAction("disconnect")}
            >
              Desconectar Gmail
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function InvoiceReview({
  invoice,
  onClose,
  onApprove,
  cloud,
}: {
  invoice: CompanyInvoice;
  onClose(): void;
  onApprove(invoice: CompanyInvoice, form: FormData): Promise<void>;
  cloud: boolean;
}) {
  const { snapshot } = useFleet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amount = (n: number | null) =>
    n === null ? "" : (n / 100).toFixed(2).replace(".", ",");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onApprove(invoice, data);
    } catch (e) {
      setError(
        e && typeof e === "object" && "issues" in e
          ? "Revisa los campos de la factura."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Revisar y registrar factura"
      subtitle={
        cloud
          ? "Comprueba los datos con el documento original."
          : "Ejemplo ficticio: añadirá un gasto local de demostración."
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="integration-fields">
          <Field label="Concepto">
            <input
              name="concept"
              required
              minLength={2}
              maxLength={160}
              defaultValue={`${invoice.supplier || "Factura"} ${invoice.invoice_number}`.slice(
                0,
                160,
              )}
              disabled={busy}
            />
          </Field>
          <Field label="Fecha de factura">
            <input
              type="date"
              name="date"
              required
              defaultValue={invoice.invoice_date ?? ""}
              disabled={busy}
            />
          </Field>
          <Field label="Camión">
            <select name="truck" required disabled={busy} defaultValue="">
              <option value="" disabled>
                Selecciona un camión
              </option>
              {snapshot.trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.plate}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select name="category" defaultValue="other" disabled={busy}>
              {Object.entries(categories)
                .filter(([key]) => key !== "transport")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Base sin IVA (€)">
            <input
              name="net"
              required
              inputMode="decimal"
              defaultValue={amount(invoice.net_cents)}
              disabled={busy}
            />
          </Field>
          <Field label="IVA (€)">
            <input
              name="tax"
              required
              inputMode="decimal"
              defaultValue={amount(invoice.tax_cents)}
              disabled={busy}
            />
          </Field>
          <Field label="Total (€)">
            <input
              name="total"
              required
              inputMode="decimal"
              defaultValue={amount(invoice.total_cents)}
              disabled={busy}
            />
          </Field>
        </div>
        <p>
          La rentabilidad utiliza la base sin IVA. El gasto quedará pendiente de
          pago.
        </p>
        {!snapshot.trucks.length && (
          <p role="alert">Añade un camión antes de registrar la factura.</p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !snapshot.trucks.length}>
            {busy ? "Registrando…" : "Confirmar y registrar gasto"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
