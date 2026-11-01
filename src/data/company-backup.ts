import { z } from "zod";
import { dateSchema, validateSnapshot } from "../domain/models";
import type { FleetSnapshot } from "../domain/models";
import { validateOperations } from "../domain/operations";
import type { OperationRecord } from "../domain/operations";
import { deriveVaultKey, newVaultSalt } from "./offline-vault";
import { detectDocumentType } from "../../supabase/functions/_shared/invoice";

export const backupProject = "kkkemaycedexymrpaqtp";
export const maxCompanyBackupBytes = 20 * 1024 * 1024;
export const maxEncryptedBackupBytes = 32 * 1024 * 1024;
export const backupRequiredFeatures = [
  "trucks",
  "drivers",
  "income",
  "expenses",
  "trailers",
  "customers",
  "trips",
  "maintenance",
  "fuel",
  "deadlines",
  "alerts",
] as const;
const encoder = new TextEncoder();
const aad = encoder.encode("TruckControl AI company records backup v1");
const timestamp = z.iso.datetime({ offset: true });
const b64 = z
  .string()
  .regex(/^[A-Za-z0-9+/]*={0,2}$/)
  .refine((value) => value.length % 4 === 0);
export function encodeBackupBytes(value: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += 16384)
    parts.push(String.fromCharCode(...value.subarray(i, i + 16384)));
  return btoa(parts.join(""));
}
export function decodeBackupBytes(value: string): Uint8Array<ArrayBuffer> {
  b64.parse(value);
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (encodeBackupBytes(bytes) !== value)
    throw Error("Codificación de copia no válida.");
  return bytes;
}
export async function backupDigest(value: Uint8Array | string) {
  const bytes =
    typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export const backupDocumentSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    name: z.string().min(1).max(160),
    object_path: z.string().min(1).max(400),
    content_type: z.enum([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
    size_bytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    truck_id: z.uuid().nullable(),
    driver_id: z.uuid().nullable(),
    created_at: timestamp,
  })
  .strict()
  .refine(
    (d) =>
      d.object_path.startsWith(`${d.organization_id}/${d.id}/`) &&
      /^[A-Za-z0-9._/-]+$/.test(d.object_path) &&
      !d.object_path.split("/").some((p) => !p || p === "." || p === ".."),
    "Ruta documental no válida.",
  );
export const backupInvoiceSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    message_id: z.string().min(1).max(200),
    attachment_id: z.string().min(1).max(600),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    document_id: z.uuid(),
    supplier: z.string().max(160),
    invoice_number: z.string().max(100),
    invoice_date: dateSchema.nullable(),
    net_cents: z.number().int().min(1).max(10_000_000_000).nullable(),
    tax_cents: z.number().int().min(0).max(10_000_000_000).nullable(),
    total_cents: z.number().int().min(1).max(20_000_000_000).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(["needs_review", "approved"]),
    review_note: z.string().max(400),
    finance_entry_id: z.uuid().nullable(),
    created_at: timestamp,
    import_source: z
      .enum(["gmail", "email_upload", "file_upload", "forwarded_email"])
      .optional(),
  })
  .strict();
export type BackupDocument = z.infer<typeof backupDocumentSchema>;
export type BackupInvoice = z.infer<typeof backupInvoiceSchema>;
export interface BackupRecords {
  fleet: FleetSnapshot;
  operations: OperationRecord[];
  documents: BackupDocument[];
  invoices: BackupInvoice[];
}
const coverageSchema = z
  .object({
    documents: z.enum(["library", "invoice-attachments", "none"]),
    invoices: z.boolean(),
  })
  .strict();
export type BackupCoverage = z.infer<typeof coverageSchema>;
export interface CompanyBackup extends BackupRecords {
  format: "truckcontrol-company-records";
  version: 1;
  project: typeof backupProject;
  exportedAt: string;
  coverage: BackupCoverage;
  files: { documentId: string; sha256: string; base64: string }[];
}
const packageSchema = z
  .object({
    format: z.literal("truckcontrol-company-records"),
    version: z.literal(1),
    project: z.literal(backupProject),
    exportedAt: timestamp,
    coverage: coverageSchema,
    fleet: z.unknown(),
    operations: z.array(z.unknown()).max(50_000),
    documents: z.array(backupDocumentSchema).max(2000),
    invoices: z.array(backupInvoiceSchema).max(2000),
    files: z
      .array(
        z
          .object({
            documentId: z.uuid(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            base64: b64.max(Math.ceil((10 * 1024 * 1024) / 3) * 4),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export function validateBackupRecords(
  raw: BackupRecords,
  organizationId: string,
): BackupRecords {
  const fleet = validateSnapshot(raw.fleet);
  if (fleet.organization.id !== organizationId)
    throw Error("La copia pertenece a otra empresa.");
  const operations = validateOperations(raw.operations, fleet),
    documents = raw.documents.map((d) => backupDocumentSchema.parse(d)),
    invoices = raw.invoices.map((i) => backupInvoiceSchema.parse(i));
  for (const rows of [documents, invoices])
    if (
      new Set(rows.map((r) => r.id)).size !== rows.length ||
      rows.some((r) => r.organization_id !== organizationId)
    )
      throw Error(
        "La copia mezcla empresas o contiene identificadores duplicados.",
      );
  const trucks = new Set(fleet.trucks.map((t) => t.id)),
    drivers = new Set(fleet.drivers.map((d) => d.id)),
    entries = new Map(fleet.entries.map((e) => [e.id, e])),
    docs = new Map(documents.map((d) => [d.id, d]));
  if (new Set(documents.map((d) => d.object_path)).size !== documents.length)
    throw Error("La copia contiene rutas duplicadas.");
  for (const d of documents)
    if (
      (d.truck_id && !trucks.has(d.truck_id)) ||
      (d.driver_id && !drivers.has(d.driver_id))
    )
      throw Error("Un documento ha perdido su ficha relacionada.");
  for (const r of operations)
    if (r.financeEntryId && !entries.has(r.financeEntryId))
      throw Error("Una operación contabilizada ha perdido su movimiento.");
  const booked = new Set<string>();
  for (const i of invoices) {
    if (
      !docs.has(i.document_id) ||
      (i.status === "approved") !== Boolean(i.finance_entry_id)
    )
      throw Error("Una factura ha perdido su documento o su estado contable.");
    if (
      i.net_cents !== null &&
      i.tax_cents !== null &&
      i.total_cents !== null &&
      i.net_cents + i.tax_cents !== i.total_cents
    )
      throw Error("Los importes de una factura no cuadran.");
    if (i.finance_entry_id) {
      const entry = entries.get(i.finance_entry_id);
      if (
        !entry ||
        entry.kind !== "expense" ||
        booked.has(entry.id) ||
        (i.currency === "EUR" && entry.amountCents !== i.total_cents)
      )
        throw Error("El movimiento de una factura no es coherente.");
      booked.add(entry.id);
    }
  }
  return { fleet, operations, documents, invoices };
}
export async function validateCompanyBackup(
  raw: unknown,
  organizationId: string,
): Promise<CompanyBackup> {
  const p = packageSchema.parse(raw),
    records = validateBackupRecords(
      {
        ...p,
        fleet: validateSnapshot(p.fleet),
        operations: p.operations as OperationRecord[],
      },
      organizationId,
    );
  if (encoder.encode(JSON.stringify(p)).byteLength > maxCompanyBackupBytes)
    throw Error("La copia supera el máximo de 20 MB.");
  if (
    (p.coverage.documents === "none" && p.documents.length) ||
    (!p.coverage.invoices && p.invoices.length)
  )
    throw Error("El alcance de la copia no corresponde a su contenido.");
  if (
    p.files.length !== p.documents.length ||
    new Set(p.files.map((f) => f.documentId)).size !== p.files.length
  )
    throw Error("Faltan originales o hay archivos duplicados.");
  const docs = new Map(p.documents.map((d) => [d.id, d])),
    hashes = new Map<string, string>();
  for (const f of p.files) {
    const doc = docs.get(f.documentId),
      bytes = decodeBackupBytes(f.base64);
    if (
      !doc ||
      bytes.length !== doc.size_bytes ||
      detectDocumentType(bytes.subarray(0, 16)) !== doc.content_type ||
      (await backupDigest(bytes)) !== f.sha256
    )
      throw Error(
        "Un original está incompleto, alterado o tiene otro formato.",
      );
    hashes.set(f.documentId, f.sha256);
  }
  for (const i of p.invoices)
    if (hashes.get(i.document_id) !== i.content_hash)
      throw Error("El original de una factura no coincide con su huella.");
  return { ...p, ...records };
}
const encryptedSchema = z
  .object({
    format: z.literal("truckcontrol-encrypted-company-backup"),
    version: z.literal(1),
    algorithm: z.literal("AES-256-GCM/PBKDF2-SHA256-600000"),
    salt: b64.length(24),
    iv: b64.length(16),
    cipher: b64.max(maxEncryptedBackupBytes),
  })
  .strict();
export async function encryptCompanyBackup(
  backup: CompanyBackup,
  passphrase: string,
) {
  const valid = await validateCompanyBackup(
      backup,
      backup.fleet.organization.id,
    ),
    salt = newVaultSalt(),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await deriveVaultKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    encoder.encode(JSON.stringify(valid)),
  );
  return JSON.stringify({
    format: "truckcontrol-encrypted-company-backup",
    version: 1,
    algorithm: "AES-256-GCM/PBKDF2-SHA256-600000",
    salt,
    iv: encodeBackupBytes(iv),
    cipher: encodeBackupBytes(new Uint8Array(cipher)),
  });
}
export async function decryptCompanyBackup(
  text: string,
  passphrase: string,
  organizationId: string,
): Promise<CompanyBackup> {
  if (
    text.length > maxEncryptedBackupBytes ||
    encoder.encode(text).byteLength > maxEncryptedBackupBytes
  )
    throw Error("El archivo supera el máximo de 32 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Error("El archivo no es una copia cifrada válida.");
  }
  const p = encryptedSchema.parse(raw),
    iv = decodeBackupBytes(p.iv),
    cipher = decodeBackupBytes(p.cipher);
  if (
    iv.length !== 12 ||
    cipher.length > maxCompanyBackupBytes + 16 ||
    cipher.length < 17
  )
    throw Error("Copia cifrada no válida.");
  const key = await deriveVaultKey(passphrase, p.salt);
  let clear: ArrayBuffer;
  try {
    clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      cipher,
    );
  } catch {
    throw Error(
      "No se puede abrir: la frase es incorrecta o la copia está alterada.",
    );
  }
  return validateCompanyBackup(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clear)),
    organizationId,
  );
}
export interface CompanyBackupGateway {
  authorize(): Promise<{
    active: boolean;
    canManage: boolean;
    organizationId: string;
    coverage: BackupCoverage;
    features: Record<string, boolean>;
  }>;
  read(): Promise<BackupRecords>;
  download(document: BackupDocument): Promise<Uint8Array>;
}
export async function collectCompanyBackup(
  gateway: CompanyBackupGateway,
  organizationId: string,
  onProgress: (message: string) => void = () => {},
  signal?: AbortSignal,
): Promise<CompanyBackup> {
  function check() {
    if (signal?.aborted)
      throw Error("La preparación de la copia se ha cancelado.");
  }
  const auth = await gateway.authorize();
  check();
  if (
    !auth.active ||
    !auth.canManage ||
    auth.organizationId !== organizationId ||
    backupRequiredFeatures.some((f) => !auth.features[f])
  )
    throw Error(
      "Necesitas una cuenta administradora activa y acceso a los módulos de registros.",
    );
  onProgress("Leyendo fichas y operaciones…");
  const records = validateBackupRecords(await gateway.read(), organizationId);
  check();
  const footprint = await backupDigest(JSON.stringify(records)),
    files: CompanyBackup["files"] = [];
  if (records.documents.length > 2000 || records.invoices.length > 2000)
    throw Error("La copia supera el límite de 2.000 documentos o facturas.");
  let size = encoder.encode(JSON.stringify(records)).byteLength;
  if (
    size +
      records.documents.reduce(
        (n, d) => n + Math.ceil(d.size_bytes / 3) * 4 + 300,
        0,
      ) >
    maxCompanyBackupBytes
  )
    throw Error("La copia supera 20 MB. No se ha generado una copia parcial.");
  for (const doc of records.documents) {
    check();
    onProgress(
      `Preparando original ${files.length + 1} de ${records.documents.length}…`,
    );
    if (size + Math.ceil(doc.size_bytes / 3) * 4 + 300 > maxCompanyBackupBytes)
      throw Error(
        "La copia supera 20 MB. No se ha generado una copia parcial.",
      );
    const bytes = await gateway.download(doc);
    check();
    if (bytes.length !== doc.size_bytes)
      throw Error("No se ha podido recuperar un original completo.");
    const file = {
      documentId: doc.id,
      sha256: await backupDigest(bytes),
      base64: encodeBackupBytes(bytes),
    };
    size += encoder.encode(JSON.stringify(file)).byteLength;
    files.push(file);
  }
  onProgress("Comprobando que los datos y permisos siguen vigentes…");
  const current = await gateway.authorize();
  check();
  if (
    !current.active ||
    !current.canManage ||
    current.organizationId !== organizationId ||
    JSON.stringify(current.coverage) !== JSON.stringify(auth.coverage) ||
    backupRequiredFeatures.some((f) => !current.features[f])
  )
    throw Error("Los permisos han cambiado. La copia no se ha descargado.");
  if (
    (await backupDigest(
      JSON.stringify(
        validateBackupRecords(await gateway.read(), organizationId),
      ),
    )) !== footprint
  )
    throw Error(
      "La empresa ha cambiado mientras se preparaba la copia. Vuelve a intentarlo.",
    );
  check();
  return validateCompanyBackup(
    {
      ...records,
      format: "truckcontrol-company-records",
      version: 1,
      project: backupProject,
      exportedAt: new Date().toISOString(),
      coverage: auth.coverage,
      files,
    },
    organizationId,
  );
}
