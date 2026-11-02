import { useState } from "react";
import { Download, FileText, RefreshCw, Sparkles } from "lucide-react";
import { useInvoiceAiStates } from "./useInvoiceAiStates";
import type { CompanyInvoice } from "../integrations/supabase/database.types";
import {
  defaultInvoiceFilters,
  filterInvoices,
  invoiceCsv,
  invoiceSource,
  invoiceSourceLabels,
  summarizeInvoices,
} from "../domain/invoice-inbox";
import type { InvoiceFilters } from "../domain/invoice-inbox";
import { money } from "../lib/format";
import { exportCsv } from "../lib/export";
import { Badge, Button, Empty, Field, Pagination, SearchField } from "./ui";

export function InvoiceRegister({
  invoices,
  organizationId,
  busy,
  canWrite,
  cloud = false,
  aiAllowed = false,
  onAnalyze,
  canDownload,
  onDownload,
  onReview,
  onRefresh,
}: {
  invoices: CompanyInvoice[];
  organizationId: string;
  busy: boolean;
  canWrite: boolean;
  cloud?: boolean;
  aiAllowed?: boolean;
  onAnalyze?(invoice: CompanyInvoice): void;
  canDownload(invoice: CompanyInvoice): boolean;
  onDownload(invoice: CompanyInvoice): void;
  onReview(invoice: CompanyInvoice): void;
  onRefresh(): void;
}) {
  const [filters, setFilters] = useState(defaultInvoiceFilters),
    [page, setPage] = useState(1);
  const set = <K extends keyof InvoiceFilters>(
    key: K,
    value: InvoiceFilters[K],
  ) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const invalidDates = Boolean(
    filters.from && filters.until && filters.from > filters.until,
  );
  const rows = invalidDates
    ? []
    : filterInvoices(invoices, organizationId, filters);
  const summary = summarizeInvoices(rows);
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  const visible = rows.slice((actual - 1) * 12, actual * 12);
  const ai = useInvoiceAiStates(
    organizationId,
    visible.map((i) => i.id),
    cloud && aiAllowed && canWrite,
  );
  return (
    <section
      className="card operation-register invoice-register"
      aria-label="Bandeja de facturas"
    >
      <div className="table-toolbar">
        <div>
          <h2>Facturas y revisión</h2>
          <p>
            Busca y exporta los documentos de esta empresa. Solo la confirmación
            registra un gasto.
          </p>
        </div>
        <div className="access-links">
          <Button
            variant="secondary"
            icon={RefreshCw}
            disabled={busy}
            onClick={onRefresh}
          >
            Actualizar facturas
          </Button>
          <Button
            variant="secondary"
            icon={Download}
            disabled={busy || !rows.length || invalidDates}
            onClick={() =>
              exportCsv("truckcontrol-facturas.csv", invoiceCsv(rows))
            }
          >
            Exportar facturas
          </Button>
        </div>
      </div>
      <div className="invoice-register-body">
        <p>
          La lectura IA de documentos guardados no necesita conectar Gmail.
          Requiere permiso y consentimiento de tu cuenta.
        </p>
        {cloud && aiAllowed && canWrite && (
          <p role={ai.error ? "alert" : "status"}>
            {ai.error ||
              (ai.loading
                ? "Comprobando la lectura IA de esta página…"
                : ai.ready
                  ? "Puedes solicitar una primera lectura IA de los originales pendientes y revisar sus datos antes de registrar el gasto."
                  : "La lectura IA no está disponible ahora. Puedes completar las facturas manualmente.")}
          </p>
        )}
        <div className="list-toolbar">
          <SearchField
            label="Buscar factura"
            placeholder="Proveedor o número…"
            value={filters.query}
            onChange={(v) => set("query", v)}
          />
          <div className="inline-actions">
            <select
              aria-label="Filtrar estado de factura"
              value={filters.status}
              onChange={(e) =>
                set("status", e.target.value as InvoiceFilters["status"])
              }
            >
              <option value="all">Todos los estados</option>
              <option value="needs_review">Pendientes de revisión</option>
              <option value="approved">Registradas</option>
            </select>
            <select
              aria-label="Filtrar origen de factura"
              value={filters.source}
              onChange={(e) =>
                set("source", e.target.value as InvoiceFilters["source"])
              }
            >
              <option value="all">Todos los orígenes</option>
              {Object.entries(invoiceSourceLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="integration-fields">
          <Field label="Fecha de factura desde">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </Field>
          <Field label="Fecha de factura hasta">
            <input
              type="date"
              value={filters.until}
              onChange={(e) => set("until", e.target.value)}
            />
          </Field>
        </div>
        <div className="inline-actions">
          <Button
            variant="ghost"
            onClick={() => {
              setFilters(defaultInvoiceFilters);
              setPage(1);
            }}
          >
            Restablecer filtros de facturas
          </Button>
        </div>
        {invalidDates && (
          <p role="alert" className="form-error">
            La fecha inicial no puede ser posterior a la final.
          </p>
        )}
        <p role="status">
          {summary.count} {summary.count === 1 ? "factura" : "facturas"} en el
          filtro · {summary.needsReview} por revisar · {summary.approved}{" "}
          registradas.
        </p>
        <p>
          Base conocida en EUR:{" "}
          <strong>
            {rows.some((i) => i.currency === "EUR" && i.net_cents !== null)
              ? money(summary.knownNetEurCents, true)
              : "Sin importes disponibles"}
          </strong>
          . No es un total de gastos contabilizados.
        </p>
        {(summary.unknownNet > 0 || summary.otherCurrency > 0) && (
          <p>
            {summary.unknownNet} sin base extraída · {summary.otherCurrency} en
            otras monedas. Esos importes no se suman a la base conocida en EUR.
          </p>
        )}
        {(filters.from || filters.until) && (
          <p>
            El período usa la fecha de factura; las que todavía no tienen fecha
            quedan fuera del filtro.
          </p>
        )}
        {!rows.length ? (
          <Empty
            title={
              invoices.length
                ? "No hay facturas en este filtro"
                : "Sin facturas importadas"
            }
          >
            Importa un correo, PDF o imagen, o cambia los filtros.
          </Empty>
        ) : (
          <div className="document-grid">
            {visible.map((invoice) => (
              <article className="card document-card" key={invoice.id}>
                <FileText size={25} aria-hidden="true" />
                <Badge tone="blue">
                  {invoiceSourceLabels[invoiceSource(invoice)]}
                </Badge>
                <Badge tone={invoice.status === "approved" ? "green" : "amber"}>
                  {invoice.status === "approved" ? "Registrada" : "Revisar"}
                </Badge>
                <h3>{invoice.supplier || "Proveedor pendiente"}</h3>
                <p>
                  {invoice.invoice_number || "Sin número"} ·{" "}
                  {invoice.invoice_date || "Fecha pendiente"}
                </p>
                <div className="invoice-amounts">
                  {[
                    ["Base", invoice.net_cents],
                    ["IVA", invoice.tax_cents],
                    ["Total", invoice.total_cents],
                  ].map(([label, n]) => (
                    <span key={String(label)}>
                      {label}
                      <strong>
                        {n === null
                          ? "—"
                          : invoice.currency === "EUR"
                            ? money(n as number, true)
                            : `${((n as number) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${invoice.currency}`}
                      </strong>
                    </span>
                  ))}
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
                {ai.states[invoice.id]?.state === "attempted" && (
                  <p className="invoice-review-note">
                    Lectura IA ya solicitada. Revisa los datos disponibles; no
                    se repetirá automáticamente.
                  </p>
                )}
                {ai.states[invoice.id]?.state === "too_large" && (
                  <p className="invoice-review-note">
                    Lectura IA: el original supera 6 MB. Puedes completar sus
                    datos manualmente.
                  </p>
                )}
                {ai.states[invoice.id]?.state === "approved" &&
                  invoice.status !== "approved" && (
                    <p className="invoice-review-note">
                      La factura se ha registrado en otra sesión. Actualiza la
                      bandeja.
                    </p>
                  )}
                <div className="inline-actions">
                  <Button
                    disabled={
                      busy ||
                      !canWrite ||
                      invoice.status === "approved" ||
                      invoice.currency !== "EUR"
                    }
                    onClick={() => onReview(invoice)}
                  >
                    Revisar factura
                  </Button>
                  {canDownload(invoice) && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onDownload(invoice)}
                    >
                      Ver original
                    </Button>
                  )}
                  {cloud &&
                    aiAllowed &&
                    canWrite &&
                    invoice.status !== "approved" && (
                      <Button
                        variant="secondary"
                        icon={Sparkles}
                        disabled={
                          busy ||
                          ai.loading ||
                          !ai.ready ||
                          !ai.states[invoice.id]?.can_analyze
                        }
                        onClick={() => onAnalyze?.(invoice)}
                      >
                        Solicitar lectura IA
                      </Button>
                    )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <Pagination
        total={rows.length}
        page={actual}
        pageSize={12}
        onChange={setPage}
      />
    </section>
  );
}
