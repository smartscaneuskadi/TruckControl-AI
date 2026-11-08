import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { z } from "zod";
import {
  supplierSchema,
  tripFinanceLinkSchema,
  tripFinanceReviewSchema,
} from "../../domain/commercial-records";
import type { SubscriptionAccess } from "../../domain/subscriptions";
import { SupabaseFleetRepository } from "./repository";
import { CloudOperationRepository } from "../../data/operations";
import { DOCUMENT_BUCKET } from "./documents";
import { loadCompanyTyres, loadTyrePageSet } from "./tyres";
import {
  backupDocumentSchema,
  backupInvoiceSchema,
} from "../../data/company-backup";
import type {
  BackupCoverage,
  BackupDocument,
  BackupInvoice,
  BackupRecords,
  CompanyBackupGateway,
} from "../../data/company-backup";

/** Only ordinary authenticated/RLS requests. No service keys or unregistered objects. */
export class SupabaseCompanyBackup implements CompanyBackupGateway {
  private coverage: BackupCoverage = { documents: "none", invoices: false };
  constructor(
    private client: SupabaseClient<Database>,
    private organization: { id: string; name: string },
  ) {}
  async authorize() {
    const { data, error } = await this.client.rpc("tc_organization_access", {
      p_org: this.organization.id,
    });
    if (error || !data)
      throw Error(
        "No se pueden verificar tus permisos. Conecta y vuelve a iniciar sesión.",
      );
    const access = data as unknown as SubscriptionAccess;
    this.coverage = {
      documents: access.features?.documents
        ? "library"
        : access.features?.gmail
          ? "invoice-attachments"
          : "none",
      invoices: access.features?.gmail === true,
      ...(access.features?.maintenance === true ? { tyres: true } : {}),
      ...(access.features?.expenses === true ? { suppliers: true } : {}),
      ...(access.features?.trips === true &&
      access.features?.profitability === true &&
      access.features?.income === true &&
      access.features?.expenses === true
        ? { tripFinance: true }
        : {}),
    };
    return {
      active: access.active === true,
      canManage: access.can_manage === true,
      organizationId: access.organization_id ?? "",
      coverage: this.coverage,
      features: { ...access.features },
    };
  }
  private async page(kind: "documents" | "invoices") {
    const result: unknown[] = [];
    let after: string | null = null;
    for (let page = 0; page < 11; page++) {
      const {
        data,
        error,
      }: { data: Json | null; error: { code?: string } | null } =
        await this.client.rpc("tc_backup_page_v2", {
          p_org: this.organization.id,
          p_kind: kind,
          p_after: after,
        });
      if (error || !Array.isArray(data))
        throw Error("No se puede leer el archivo autorizado de esta empresa.");
      if (data.length > 200 || result.length + data.length > 2000)
        throw Error(
          "La copia supera el límite de 2.000 documentos o facturas.",
        );
      const parsed: (BackupDocument | BackupInvoice)[] = data.map((item) =>
        kind === "documents"
          ? backupDocumentSchema.parse(item)
          : backupInvoiceSchema.parse(item),
      );
      for (const item of parsed) {
        if (
          item.organization_id !== this.organization.id ||
          (after !== null && item.id <= after)
        )
          throw Error("La paginación no es válida o mezcla empresas.");
        after = item.id;
      }
      result.push(...parsed);
      if (data.length < 200) return result;
    }
    throw Error("No se ha podido completar la copia sin truncar el archivo.");
  }
  async read(): Promise<BackupRecords> {
    const fleet = await new SupabaseFleetRepository(
      this.client,
      this.organization,
    ).load();
    const [operations, documents, invoices] = await Promise.all([
      new CloudOperationRepository(this.client, this.organization.id).load(
        fleet,
      ),
      this.coverage.documents !== "none"
        ? this.page("documents")
        : Promise.resolve([]),
      this.coverage.invoices ? this.page("invoices") : Promise.resolve([]),
    ]);
    const tyreRecords = this.coverage.tyres
      ? {
          tyres: await loadCompanyTyres(
            this.client,
            this.organization.id,
            fleet,
          ),
          tyreHistory: await loadTyrePageSet(
            this.client,
            this.organization.id,
            "history",
          ),
        }
      : {};
    const suppliers = this.coverage.suppliers
      ? await this.commercialPage(
          "suppliers",
          supplierSchema,
          (r) => r.id,
          10000,
        )
      : undefined;
    const tripFinanceLinks = this.coverage.tripFinance
      ? await this.commercialPage(
          "trip_links",
          tripFinanceLinkSchema,
          (r) => r.entry_id,
          100000,
        )
      : undefined;
    const tripFinanceReviews = this.coverage.tripFinance
      ? await this.commercialPage(
          "trip_reviews",
          tripFinanceReviewSchema,
          (r) => r.trip_id,
          50000,
        )
      : undefined;
    return {
      fleet,
      operations,
      documents: documents.map((d) => backupDocumentSchema.parse(d)),
      invoices: invoices.map((i) => backupInvoiceSchema.parse(i)),
      ...tyreRecords,
      ...(suppliers !== undefined ? { suppliers } : {}),
      ...(tripFinanceLinks !== undefined
        ? { tripFinanceLinks, tripFinanceReviews }
        : {}),
    };
  }
  private async commercialPage<
    S extends z.ZodType<{ organization_id: string }>,
  >(
    kind: "suppliers" | "trip_links" | "trip_reviews",
    schema: S,
    id: (r: z.output<S>) => string,
    maximum: number,
  ): Promise<z.output<S>[]> {
    const result: z.output<S>[] = [];
    let after: string | null = null;
    const pageSchema = z.strictObject({
      schema_version: z.literal(1),
      organization_id: z.uuid(),
      kind: z.literal(kind),
      rows: z.array(schema).max(200),
    });
    for (let n = 0; n <= maximum / 200; n++) {
      const { data, error } = await this.client.rpc(
        "tc_commercial_backup_page",
        { p_org: this.organization.id, p_kind: kind, p_after: after },
      );
      if (error)
        throw Error(
          "No se puede completar el archivo de proveedores y viajes. No se ha generado una copia parcial.",
        );
      const page = pageSchema.parse(data);
      if (
        page.organization_id !== this.organization.id ||
        page.rows.some((r) => r.organization_id !== this.organization.id)
      )
        throw Error("El archivo comercial mezcla empresas.");
      for (const row of page.rows) {
        const next = id(row);
        if (after !== null && next <= after)
          throw Error("La paginación del archivo comercial no es válida.");
        after = next;
        result.push(row);
      }
      if (result.length > maximum)
        throw Error(
          "El archivo comercial supera el límite de la copia. No se ha truncado.",
        );
      if (page.rows.length < 200) return result;
    }
    throw Error("No se puede confirmar el archivo comercial completo.");
  }
  async download(document: BackupDocument): Promise<Uint8Array> {
    const doc = backupDocumentSchema.parse(document);
    if (doc.organization_id !== this.organization.id)
      throw Error("Documento de otra empresa.");
    const { data, error } = await this.client.storage
      .from(DOCUMENT_BUCKET)
      .download(doc.object_path);
    if (error || !data || data.size !== doc.size_bytes)
      throw Error(
        "Un original no se puede descargar. La copia se ha detenido.",
      );
    return new Uint8Array(await data.arrayBuffer());
  }
}
