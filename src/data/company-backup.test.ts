import { describe, it, expect, vi } from "vitest";
import { createDemo } from "./demo";
import { demoOperations } from "./operations";
import {
  backupDigest,
  backupProject,
  collectCompanyBackup,
  decryptCompanyBackup,
  encryptCompanyBackup,
  encodeBackupBytes,
  validateCompanyBackup,
} from "./company-backup";
import type { BackupRecords, CompanyBackupGateway } from "./company-backup";

const org = "20000000-0000-4000-8000-000000000111",
  docId = "50000000-0000-4000-8000-000000000111";
const phrase = "Frase ficticia para pruebas 2026";
async function fixture() {
  const fleet = createDemo();
  fleet.organization = { id: org, name: "Empresa ficticia de recuperación" };
  const bytes = new TextEncoder().encode(
      "%PDF-1.7\nOriginal ficticio para verificar recuperacion\n%%EOF",
    ),
    hash = await backupDigest(bytes);
  const doc = {
    id: docId,
    organization_id: org,
    name: "Factura ficticia.pdf",
    object_path: `${org}/${docId}/document.pdf`,
    content_type: "application/pdf" as const,
    size_bytes: bytes.length,
    truck_id: fleet.trucks[0].id,
    driver_id: null,
    created_at: new Date().toISOString(),
  };
  const records: BackupRecords = {
    fleet,
    operations: demoOperations(fleet),
    documents: [doc],
    invoices: [
      {
        id: "60000000-0000-4000-8000-000000000111",
        organization_id: org,
        message_id: "ficticio",
        attachment_id: "ficticio",
        content_hash: hash,
        document_id: docId,
        supplier: "Proveedor ficticio",
        invoice_number: "DEMO-1",
        invoice_date: "2026-11-01",
        net_cents: 10000,
        tax_cents: 2100,
        total_cents: 12100,
        currency: "EUR",
        status: "needs_review",
        review_note: "",
        finance_entry_id: null,
        created_at: doc.created_at,
        import_source: "file_upload",
      },
    ],
  };
  const access = {
    active: true,
    canManage: true,
    organizationId: org,
    coverage: { documents: "library" as const, invoices: true },
    features: Object.fromEntries(
      [
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
      ].map((f) => [f, true]),
    ),
  };
  const gateway = {
    authorize: vi.fn(async () => structuredClone(access)),
    read: vi.fn(async () => structuredClone(records)),
    download: vi.fn(async () => bytes),
  } satisfies CompanyBackupGateway;
  return {
    records,
    bytes,
    gateway,
    access,
    backup: await collectCompanyBackup(gateway, org),
  };
}

describe("copias cifradas de empresa", () => {
  it("cifra y recupera un original de 3 MB sin desbordar el validador", async () => {
    const f = await fixture(),
      bytes = new Uint8Array(3 * 1024 * 1024);
    bytes.set(new TextEncoder().encode("%PDF-1.7\nFicticio\n"));
    const hash = await backupDigest(bytes);
    f.backup.documents[0].size_bytes = bytes.length;
    f.backup.invoices[0].content_hash = hash;
    f.backup.files[0] = {
      documentId: docId,
      sha256: hash,
      base64: encodeBackupBytes(bytes),
    };
    const text = await encryptCompanyBackup(f.backup, phrase),
      restored = await decryptCompanyBackup(text, phrase, org);
    expect(restored.documents[0].size_bytes).toBe(bytes.length);
    expect(restored.files[0].sha256).toBe(hash);
  });
  it("recupera cincuenta camiones, operaciones, facturas y originales sin alterar los importes", async () => {
    const f = await fixture(),
      before = structuredClone(f.records),
      text = await encryptCompanyBackup(f.backup, phrase);
    const restored = await decryptCompanyBackup(text, phrase, org);
    expect(restored.fleet.trucks).toHaveLength(50);
    expect(restored.fleet).toEqual(before.fleet);
    expect(restored.operations).toEqual(before.operations);
    expect(restored.invoices).toEqual(before.invoices);
    expect(restored.files[0].base64).toBe(encodeBackupBytes(f.bytes));
    expect(text).not.toContain(before.fleet.organization.name);
    expect(text).not.toContain("Factura ficticia");
    expect(JSON.parse(text)).not.toHaveProperty("organization_id");
    expect(f.records).toEqual(before);
  });
  it("usa sal e IV nuevos en cada copia", async () => {
    const f = await fixture(),
      a = JSON.parse(await encryptCompanyBackup(f.backup, phrase)),
      b = JSON.parse(await encryptCompanyBackup(f.backup, phrase));
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.cipher).not.toBe(b.cipher);
  });
  it("rechaza la contraseña incorrecta", async () => {
    const f = await fixture(),
      text = await encryptCompanyBackup(f.backup, phrase);
    await expect(
      decryptCompanyBackup(text, "Otra frase ficticia distinta", org),
    ).rejects.toThrow(/incorrecta|alterada/);
  });
  it("no permite abrir una copia en otra empresa", async () => {
    const f = await fixture(),
      text = await encryptCompanyBackup(f.backup, phrase);
    await expect(
      decryptCompanyBackup(
        text,
        phrase,
        "20000000-0000-4000-8000-000000000112",
      ),
    ).rejects.toThrow(/otra empresa/);
  });
  it("rechaza alteraciones del cifrado y algoritmos o versiones ajenos", async () => {
    const f = await fixture(),
      encrypted = JSON.parse(await encryptCompanyBackup(f.backup, phrase));
    const altered = {
      ...encrypted,
      cipher:
        (encrypted.cipher[0] === "A" ? "B" : "A") + encrypted.cipher.slice(1),
    };
    await expect(
      decryptCompanyBackup(JSON.stringify(altered), phrase, org),
    ).rejects.toThrow(/incorrecta|alterada/);
    await expect(
      decryptCompanyBackup(
        JSON.stringify({ ...encrypted, version: 2 }),
        phrase,
        org,
      ),
    ).rejects.toThrow();
    await expect(
      decryptCompanyBackup(
        JSON.stringify({
          ...encrypted,
          algorithm: "untrusted-kdf",
          iterations: 999999999,
        }),
        phrase,
        org,
      ),
    ).rejects.toThrow();
  });
  it("no acepta una copia sin cifrar ni una frase corta", async () => {
    const f = await fixture();
    await expect(
      decryptCompanyBackup(JSON.stringify(f.backup), phrase, org),
    ).rejects.toThrow();
    await expect(encryptCompanyBackup(f.backup, "corta")).rejects.toThrow(
      /12 caracteres/,
    );
  });
  it("rechaza otro proyecto y campos de credenciales añadidos", async () => {
    const f = await fixture();
    await expect(
      validateCompanyBackup({ ...f.backup, project: "fixpilot" }, org),
    ).rejects.toThrow();
    await expect(
      validateCompanyBackup(
        { ...f.backup, access_token: "synthetic-must-not-enter" },
        org,
      ),
    ).rejects.toThrow();
    expect(f.backup.project).toBe(backupProject);
  });
  it("detecta un archivo ausente, duplicado o cambiado", async () => {
    const f = await fixture();
    await expect(
      validateCompanyBackup({ ...f.backup, files: [] }, org),
    ).rejects.toThrow(/Faltan originales/);
    await expect(
      validateCompanyBackup(
        { ...f.backup, files: [f.backup.files[0], f.backup.files[0]] },
        org,
      ),
    ).rejects.toThrow(/duplicados/);
    const changed = structuredClone(f.backup);
    changed.files[0].base64 = encodeBackupBytes(
      new TextEncoder().encode("%PDF-1.7\nModificado"),
    );
    await expect(validateCompanyBackup(changed, org)).rejects.toThrow(
      /alterado|incompleto/,
    );
  });
  it("rechaza rutas ajenas y recorridos de directorio", async () => {
    const f = await fixture();
    for (const path of [
      `${org}/${docId}/../secret.pdf`,
      `other/${docId}/document.pdf`,
      `${org}/${docId}/%2e%2e/document.pdf`,
    ]) {
      const changed = structuredClone(f.backup);
      changed.documents[0].object_path = path;
      await expect(validateCompanyBackup(changed, org)).rejects.toThrow();
    }
  });
  it("comprueba los tipos de documento y la huella original de cada factura", async () => {
    const f = await fixture(),
      changed = structuredClone(f.backup);
    changed.invoices[0].content_hash = "f".repeat(64);
    await expect(validateCompanyBackup(changed, org)).rejects.toThrow(/huella/);
    const format = structuredClone(f.backup);
    format.documents[0].content_type = "image/jpeg";
    await expect(validateCompanyBackup(format, org)).rejects.toThrow(/formato/);
  });
  it("detecta facturas sin documento y totales que no cuadran", async () => {
    const f = await fixture(),
      changed = structuredClone(f.backup);
    changed.invoices[0].tax_cents = 1;
    await expect(validateCompanyBackup(changed, org)).rejects.toThrow(
      /no cuadran/,
    );
    changed.invoices[0] = {
      ...f.backup.invoices[0],
      document_id: "50000000-0000-4000-8000-000000000112",
    };
    await expect(validateCompanyBackup(changed, org)).rejects.toThrow(
      /perdido su documento/,
    );
  });
  it("no reinterpreta una factura pendiente como contabilizada", async () => {
    const f = await fixture(),
      changed = structuredClone(f.backup);
    changed.invoices[0].status = "approved";
    await expect(validateCompanyBackup(changed, org)).rejects.toThrow(
      /estado contable/,
    );
    expect(f.backup.fleet.entries).toEqual(f.records.fleet.entries);
  });
  it("no lee datos para usuarios de consulta, suspendidos o sin todos los módulos", async () => {
    const f = await fixture();
    for (const patch of [
      { canManage: false },
      { active: false },
      { features: { ...f.access.features, fuel: false } },
    ]) {
      f.gateway.authorize.mockResolvedValue({ ...f.access, ...patch });
      f.gateway.read.mockClear();
      await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(
        /administradora activa/,
      );
      expect(f.gateway.read).not.toHaveBeenCalled();
    }
  });
  it("descarta la copia cuando la cuenta pierde permisos durante la descarga", async () => {
    const f = await fixture();
    f.gateway.authorize
      .mockReset()
      .mockResolvedValueOnce(f.access)
      .mockResolvedValueOnce({ ...f.access, canManage: false });
    await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(
      /permisos han cambiado/,
    );
  });
  it("detecta una edición concurrente y conserva los datos originales", async () => {
    const f = await fixture(),
      changed = structuredClone(f.records);
    changed.fleet.trucks[0].odometerKm++;
    f.gateway.read
      .mockReset()
      .mockResolvedValueOnce(f.records)
      .mockResolvedValueOnce(changed);
    await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(
      /ha cambiado/,
    );
  });
  it("no genera una copia parcial si un original no se puede recuperar", async () => {
    const f = await fixture();
    f.gateway.download.mockRejectedValue(Error("Sin permiso"));
    await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(
      /Sin permiso/,
    );
  });
  it("calcula el límite de memoria antes de descargar archivos grandes", async () => {
    const f = await fixture(),
      records = structuredClone(f.records);
    records.invoices = [];
    records.documents = [1, 2].map((n) => ({
      ...records.documents[0],
      id: `50000000-0000-4000-8000-00000000011${n}`,
      object_path: `${org}/50000000-0000-4000-8000-00000000011${n}/document.pdf`,
      size_bytes: 10 * 1024 * 1024,
    }));
    f.gateway.read.mockResolvedValue(records);
    f.gateway.download.mockClear();
    await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(/20 MB/);
    expect(f.gateway.download).not.toHaveBeenCalled();
  });
  it("cancelar no deja descargas de una empresa anterior", async () => {
    const f = await fixture(),
      controller = new AbortController();
    controller.abort();
    f.gateway.read.mockClear();
    await expect(
      collectCompanyBackup(f.gateway, org, undefined, controller.signal),
    ).rejects.toThrow(/cancelado/);
    expect(f.gateway.read).not.toHaveBeenCalled();
  });
});
