import { it, expect } from "vitest";
import { createDemo } from "../src/data/demo";
import { demoOperations } from "../src/data/operations";
import {
  demoTripFinance,
  demoTripCandidates,
} from "../src/data/trip-finance-demo";
import {
  supplierSchema,
  emptySupplier,
  tripFinanceSchema,
} from "../src/domain/commercial-records";
import {
  validateCompanyBackup,
  validateBackupRecords,
  encryptCompanyBackup,
  decryptCompanyBackup,
} from "../src/data/company-backup";
import type { BackupRecords } from "../src/data/company-backup";
function fixture() {
  const fleet = createDemo();
  fleet.organization.id = crypto.randomUUID();
  const operations = demoOperations(fleet),
    trip = operations.find((r) => r.kind === "trips")!;
  trip.data.status = "completed";
  trip.data.endOn = trip.data.startOn;
  const expense = fleet.entries.find(
    (e) => e.kind === "expense" && e.truckId === trip.data.truckId,
  )!;
  const supplier = supplierSchema.parse({
    ...emptySupplier,
    name: "Taller ficticio",
    tax_id: "DEMO-SUPPLIER",
    id: crypto.randomUUID(),
    organization_id: fleet.organization.id,
    row_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const records: BackupRecords = {
    fleet,
    operations,
    documents: [],
    invoices: [],
    suppliers: [supplier],
    tripFinanceLinks: [
      {
        organization_id: fleet.organization.id,
        entry_id: expense.id,
        trip_id: trip.id,
        created_by: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      },
    ],
    tripFinanceReviews: [],
  };
  const pack = {
    ...records,
    format: "truckcontrol-company-records",
    version: 4,
    project: "kkkemaycedexymrpaqtp",
    exportedAt: new Date().toISOString(),
    coverage: {
      documents: "none",
      invoices: false,
      suppliers: true,
      tripFinance: true,
    },
    files: [],
  };
  return { fleet, operations, trip, expense, supplier, records, pack };
}
it("vincula y revisa el demo sin modificar importes ni crear movimientos", async () => {
  const { fleet, operations, trip, expense } = fixture(),
    before = structuredClone(fleet.entries);
  const available = demoTripCandidates(fleet, operations, trip.id);
  expect(available.some((r) => r.id === expense.id)).toBe(true);
  const linked = await demoTripFinance(fleet, operations, trip.id, "link", {
    entry_id: expense.id,
  });
  expect(linked.expense_cents).toBe(expense.amountCents);
  expect(linked.reviewed_margin_cents).toBeNull();
  const reviewed = await demoTripFinance(fleet, operations, trip.id, "review", {
    expected_fingerprint: linked.fingerprint!,
  });
  expect(reviewed.reviewed).toBe(true);
  expect(fleet.entries).toEqual(before);
  expense.amountCents++;
  expect((await demoTripFinance(fleet, operations, trip.id)).reviewed).toBe(
    false,
  );
  await expect(
    demoTripFinance(fleet, operations, trip.id, "review", {
      expected_fingerprint: linked.fingerprint!,
    }),
  ).rejects.toThrow();
});
it("rechaza movimientos de otro camión en la demostración", async () => {
  const { fleet, operations, trip } = fixture(),
    other = fleet.entries.find((e) => e.truckId !== trip.data.truckId)!;
  await expect(
    demoTripFinance(fleet, operations, trip.id, "link", { entry_id: other.id }),
  ).rejects.toThrow();
});
it("valida sumas, permisos, duplicados e importes seguros en la respuesta", async () => {
  const { fleet, operations, trip, expense } = fixture();
  const s = await demoTripFinance(fleet, operations, trip.id, "link", {
    entry_id: expense.id,
  });
  expect(
    tripFinanceSchema.safeParse({ ...s, recorded_margin_cents: 123456 })
      .success,
  ).toBe(false);
  expect(
    tripFinanceSchema.safeParse({ ...s, rows: [...s.rows, s.rows[0]] }).success,
  ).toBe(false);
  expect(
    tripFinanceSchema.safeParse({ ...s, expense_cents: null }).success,
  ).toBe(false);
  expect(
    tripFinanceSchema.safeParse({
      ...s,
      income_cents: Number.MAX_SAFE_INTEGER + 1,
    }).success,
  ).toBe(false);
});
it("conserva proveedores y vínculos en una copia v4 cifrada", async () => {
  const { fleet, pack } = fixture(),
    parsed = await validateCompanyBackup(pack, fleet.organization.id);
  const encrypted = await encryptCompanyBackup(
    parsed,
    "Frase privada de prueba 45678",
  );
  expect(JSON.stringify(encrypted)).not.toContain("Taller ficticio");
  const recovered = await decryptCompanyBackup(
    encrypted,
    "Frase privada de prueba 45678",
    fleet.organization.id,
  );
  expect(recovered.suppliers).toEqual(parsed.suppliers);
  expect(recovered.tripFinanceLinks).toEqual(parsed.tripFinanceLinks);
}, 20000);
it("rechaza mezclar empresas, duplicar asignaciones o perder relaciones en copias", () => {
  const { records, fleet } = fixture();
  expect(() =>
    validateBackupRecords(
      {
        ...records,
        suppliers: [
          { ...records.suppliers![0], organization_id: crypto.randomUUID() },
        ],
      },
      fleet.organization.id,
    ),
  ).toThrow();
  expect(() =>
    validateBackupRecords(
      {
        ...records,
        tripFinanceLinks: [
          ...records.tripFinanceLinks!,
          ...records.tripFinanceLinks!,
        ],
      },
      fleet.organization.id,
    ),
  ).toThrow();
  expect(() =>
    validateBackupRecords(
      {
        ...records,
        tripFinanceLinks: [
          { ...records.tripFinanceLinks![0], trip_id: crypto.randomUUID() },
        ],
      },
      fleet.organization.id,
    ),
  ).toThrow();
  expect(() =>
    validateBackupRecords(
      { ...records, tripFinanceReviews: undefined },
      fleet.organization.id,
    ),
  ).toThrow();
});
it("exige versión y cobertura explícitas para no perder el archivo comercial", async () => {
  const { pack, fleet } = fixture();
  await expect(
    validateCompanyBackup({ ...pack, version: 3 }, fleet.organization.id),
  ).rejects.toThrow();
  await expect(
    validateCompanyBackup(
      { ...pack, suppliers: undefined },
      fleet.organization.id,
    ),
  ).rejects.toThrow();
  await expect(
    validateCompanyBackup(
      { ...pack, coverage: { ...pack.coverage, tripFinance: false } },
      fleet.organization.id,
    ),
  ).rejects.toThrow();
});
