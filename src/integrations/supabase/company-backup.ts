import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import type { SubscriptionAccess } from "../../domain/subscriptions";
import { SupabaseFleetRepository } from "./repository";
import { CloudOperationRepository } from "../../data/operations";
import { DOCUMENT_BUCKET } from "./documents";
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
        await this.client.rpc("tc_backup_page", {
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
    return {
      fleet,
      operations,
      documents: documents.map((d) => backupDocumentSchema.parse(d)),
      invoices: invoices.map((i) => backupInvoiceSchema.parse(i)),
    };
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
