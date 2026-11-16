import { describe, expect, it } from "vitest";
import { createDemo } from "../src/data/demo";
import { applyCommand } from "../src/domain/commands";
import {
  entrySchema,
  financeDocumentTypes,
  validateSnapshot,
} from "../src/domain/models";
import {
  defaultDocumentInput,
  defaultDocumentTracking,
  documentTrackingInput,
  filterDocuments,
} from "../src/domain/documents";
import { createDemoBackup, parseDemoBackupText } from "../src/data/demo-backup";
import {
  backupRequiredFeatures,
  collectCompanyBackup,
  encryptCompanyBackup,
  decryptCompanyBackup,
  validateCompanyBackup,
  validateBackupRecords,
} from "../src/data/company-backup";
import type {
  BackupRecords,
  CompanyBackupGateway,
} from "../src/data/company-backup";
import { offlinePayload } from "../src/data/offline-vault";
import type { SubscriptionAccess } from "../src/domain/subscriptions";

function record() {
  return createDemo().entries[0];
}
async function backupFixture() {
  const fleet = createDemo();
  fleet.organization = {
    id: "ba110000-0000-4000-8000-000000000001",
    name: "Empresa sintética documental",
  };
  const bytes = new TextEncoder().encode("%PDF-1.7\nArchivo ficticio\n%%EOF");
  const id = "ba120000-0000-4000-8000-000000000001";
  const records: BackupRecords = {
    fleet,
    operations: [],
    invoices: [],
    documents: [
      {
        id,
        organization_id: fleet.organization.id,
        name: "Ficticio.pdf",
        object_path: `${fleet.organization.id}/${id}/document.pdf`,
        content_type: "application/pdf",
        size_bytes: bytes.length,
        truck_id: fleet.trucks[0].id,
        driver_id: null,
        created_at: "2026-11-16T00:00:00Z",
      },
    ],
  };
  const gateway: CompanyBackupGateway = {
    authorize: async () => ({
      active: true,
      canManage: true,
      organizationId: fleet.organization.id,
      coverage: { documents: "library", invoices: false },
      features: Object.fromEntries(
        backupRequiredFeatures.map((k) => [k, true]),
      ),
    }),
    read: async () => structuredClone(records),
    download: async () => bytes,
  };
  return { records, gateway, organization: fleet.organization.id };
}
describe("clasificación documental sin modificar la contabilidad", () => {
  it("mantiene vacíos los movimientos históricos", () => {
    expect(financeDocumentTypes).toEqual({
      invoice: "Factura",
      ticket: "Ticket",
      delivery_note: "Albarán",
    });
    expect(entrySchema.parse(record())).not.toHaveProperty("documentType");
    expect(
      validateSnapshot(createDemo()).entries.every(
        (e) => e.documentType === undefined,
      ),
    ).toBe(true);
  });
  it.each(["invoice", "ticket", "delivery_note", null] as const)(
    "acepta %s sin alterar céntimos o kilómetros",
    (documentType) => {
      const e = record();
      expect(entrySchema.parse({ ...e, documentType })).toEqual({
        ...e,
        documentType,
      });
    },
  );
  it.each(["other", "Factura", "", 4, {}])(
    "rechaza la clase ajena %j",
    (documentType) => {
      expect(entrySchema.safeParse({ ...record(), documentType }).success).toBe(
        false,
      );
    },
  );
  it("edición legacy conserva una clase, null la borra y no inyecta defaults", () => {
    const fleet = createDemo();
    fleet.entries[0].documentType = "ticket";
    const legacy = { ...fleet.entries[0] };
    delete legacy.documentType;
    const next = applyCommand(fleet, {
      type: "save-entry",
      value: { ...legacy, concept: "Editado" },
    });
    expect(next.entries[0].documentType).toBe("ticket");
    expect(
      applyCommand(next, {
        type: "save-entry",
        value: { ...next.entries[0], documentType: null },
      }).entries[0].documentType,
    ).toBeNull();
    expect(
      applyCommand(createDemo(), { type: "save-entry", value: record() })
        .entries[0],
    ).not.toHaveProperty("documentType");
  });
  it("conserva la clasificación en la instantánea offline sin abrir permisos", () => {
    const fleet = createDemo();
    fleet.entries[0].documentType = "delivery_note";
    const now = new Date().toISOString();
    const access: SubscriptionAccess = {
      active: true,
      plan: "full",
      features: {},
      company_role: "owner",
      can_write: true,
      can_manage: true,
      is_admin: false,
      max_trucks: 50,
      sms_ready: false,
      payments_enabled: false,
      prices_are_examples: true,
      profile: {
        user_id: crypto.randomUUID(),
        email: "ficticio@example.invalid",
        contact_name: "Persona ficticia",
        company_name: fleet.organization.name,
        tax_id: "DEMO",
        address: "Dirección ficticia",
        phone: "+12025551000",
        requested_plan: "limited",
        paid_plan: null,
        status: "trial",
        trial_started_at: now,
        trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
        paid_until: null,
        ai_allowed: false,
        ai_opt_in: false,
        module_overrides: {},
        created_at: now,
        updated_at: now,
      },
    };
    const payload = offlinePayload(fleet, [], access);
    expect(payload.snapshot.entries[0].documentType).toBe("delivery_note");
    expect(payload.access.features).toEqual({});
  });
});
describe("metadatos documentales opcionales y versiones de recuperación", () => {
  it.each([
    "technical_card",
    "identity",
    "driving_license",
    "ticket",
    "delivery_note",
  ] as const)("valida %s y una descripción libre", (category) => {
    expect(
      documentTrackingInput.parse({
        ...defaultDocumentInput,
        category,
        label: "  Descripción propia  ",
      }),
    ).toMatchObject({ category, label: "Descripción propia" });
  });
  it("no inyecta label ni vínculo, admite limpieza explícita y limita la descripción", () => {
    expect(documentTrackingInput.parse(defaultDocumentInput)).toEqual(
      defaultDocumentInput,
    );
    expect(
      documentTrackingInput.parse({
        ...defaultDocumentInput,
        label: "",
        finance_entry_id: null,
      }),
    ).toMatchObject({ label: "", finance_entry_id: null });
    expect(
      documentTrackingInput.safeParse({
        ...defaultDocumentInput,
        label: "x".repeat(161),
      }).success,
    ).toBe(false);
    expect(
      documentTrackingInput.safeParse({
        ...defaultDocumentInput,
        finance_entry_id: "otra-empresa",
      }).success,
    ).toBe(false);
  });
  it("busca descripciones propias sin dejar de filtrar categorías y estados", () => {
    const d = {
      id: crypto.randomUUID(),
      organization_id: createDemo().organization.id,
      name: "foto.pdf",
      truck_id: null,
      driver_id: null,
      size_bytes: 1,
      created_at: "2026-11-16T00:00:00Z",
      tracking: {
        ...defaultDocumentTracking,
        label: "Identidad del conductor",
        category: "identity" as const,
      },
    };
    expect(
      filterDocuments([d], "2026-11-16", "CONDUCTOR", "active", "identity"),
    ).toEqual([d]);
    expect(
      filterDocuments([d], "2026-11-16", "CONDUCTOR", "active", "insurance"),
    ).toEqual([]);
  });
  it("emite demo4 solo cuando hay clasificación y rechaza su degradación a demo3", () => {
    const fleet = createDemo();
    expect(createDemoBackup(fleet, []).version).toBe(1);
    fleet.entries[0].documentType = "ticket";
    const backup = createDemoBackup(fleet, []);
    expect(backup.version).toBe(4);
    expect(
      parseDemoBackupText(JSON.stringify(backup)).backup.fleet.entries[0]
        .documentType,
    ).toBe("ticket");
    expect(() =>
      parseDemoBackupText(JSON.stringify({ ...backup, version: 3 })),
    ).toThrow(/versión 4/);
  });
  it("recupera empresa6 cifrada con clasificación y varios documentos vinculados", async () => {
    const f = await backupFixture();
    f.records.fleet.entries[0].documentType = "invoice";
    f.records.documents[0].tracking = {
      ...defaultDocumentTracking,
      row_version: 2,
      updated_at: "2026-11-16T00:00:00Z",
      category: "ticket",
      label: "Justificante original",
      finance_entry_id: f.records.fleet.entries[0].id,
    };
    const extra = structuredClone(f.records.documents[0]);
    extra.id = crypto.randomUUID();
    extra.object_path = `${f.organization}/${extra.id}/document.pdf`;
    f.records.documents.push(extra);
    const backup = await collectCompanyBackup(f.gateway, f.organization);
    expect(backup.version).toBe(6);
    const recovered = await decryptCompanyBackup(
      await encryptCompanyBackup(
        backup,
        "Frase sintética de recuperación 2026",
      ),
      "Frase sintética de recuperación 2026",
      f.organization,
    );
    expect(recovered.fleet.entries).toEqual(f.records.fleet.entries);
    expect(recovered.documents).toEqual(f.records.documents);
    await expect(
      validateCompanyBackup({ ...backup, version: 5 }, f.organization),
    ).rejects.toThrow(/versión 6/);
  }, 20000);
  it("clasificación null mantiene la versión previa y metadatos sin valor no crean una clase", async () => {
    const f = await backupFixture();
    f.records.fleet.entries[0].documentType = null;
    expect(
      (await collectCompanyBackup(f.gateway, f.organization)).version,
    ).toBe(1);
  });
  it("rechaza vínculos huérfanos o de otra empresa sin confundirlos con facturas contabilizadas", async () => {
    const f = await backupFixture();
    f.records.documents[0].tracking = {
      ...defaultDocumentTracking,
      finance_entry_id: crypto.randomUUID(),
    };
    expect(() => validateBackupRecords(f.records, f.organization)).toThrow(
      /ficha relacionada/,
    );
    f.records.documents[0].tracking.finance_entry_id =
      f.records.fleet.entries[0].id;
    expect(validateBackupRecords(f.records, f.organization).invoices).toEqual(
      [],
    );
    f.records.documents[0].organization_id = crypto.randomUUID();
    f.records.documents[0].object_path = `${f.records.documents[0].organization_id}/${f.records.documents[0].id}/document.pdf`;
    expect(() => validateBackupRecords(f.records, f.organization)).toThrow(
      /mezcla empresas/,
    );
  });
  it("un cambio legítimo de camión financiero no invalida la ficha histórica del original", async () => {
    const f = await backupFixture();
    f.records.documents[0].tracking = {
      ...defaultDocumentTracking,
      finance_entry_id: f.records.fleet.entries[0].id,
    };
    f.records.fleet.entries[0].truckId = f.records.fleet.trucks[1].id;
    expect(() =>
      validateBackupRecords(f.records, f.organization),
    ).not.toThrow();
  });
});
