import { z } from "zod";
import { validateSnapshot } from "../domain/models";
import type { FleetSnapshot } from "../domain/models";
import { validateOperations } from "../domain/operations";
import type { OperationRecord } from "../domain/operations";
import { demoOrganizationId } from "./demo";
import { STORAGE_KEY, demoOperationKey, demoRecoveryKey } from "./demo-keys";
import { readDemoOperations, writeDemoWorkspace } from "./demo-workspace";
import type { DemoStorage } from "./demo-workspace";

export const maxDemoBackupBytes = 10 * 1024 * 1024;
export interface DemoBackup {
  format: "truckcontrol-demo-records";
  version: 1;
  exportedAt: string;
  attachmentsIncluded: false;
  fleet: FleetSnapshot;
  operations: OperationRecord[];
}
const envelope = z
  .object({
    format: z.literal("truckcontrol-demo-records"),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    attachmentsIncluded: z.literal(false),
    fleet: z.unknown(),
    operations: z.array(z.unknown()).max(50_000),
  })
  .strict();
export function createDemoBackup(
  fleet: FleetSnapshot,
  operations: OperationRecord[],
  exportedAt = new Date().toISOString(),
): DemoBackup {
  const valid = validateSnapshot(fleet);
  if (valid.organization.id !== demoOrganizationId)
    throw Error(
      "Solo se admiten copias del espacio de demostración. Los datos de empresas no se importan aquí.",
    );
  const records = validateOperations(operations, valid);
  const entryIds = new Set(valid.entries.map((e) => e.id));
  for (const record of records)
    if (record.financeEntryId && !entryIds.has(record.financeEntryId))
      throw Error(
        "Un registro contabilizado no tiene su movimiento económico. Revisa la copia antes de restaurarla.",
      );
  z.iso.datetime().parse(exportedAt);
  return {
    format: "truckcontrol-demo-records",
    version: 1,
    exportedAt,
    attachmentsIncluded: false,
    fleet: valid,
    operations: records,
  };
}
export function parseDemoBackupText(text: string): {
  backup: DemoBackup;
  legacy: boolean;
} {
  if (
    text.length > maxDemoBackupBytes ||
    new TextEncoder().encode(text).byteLength > maxDemoBackupBytes
  )
    throw Error("La copia supera el máximo de 10 MB.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("El archivo no contiene una copia JSON válida.");
  }
  try {
    if (value && typeof value === "object" && "schemaVersion" in value) {
      const legacy = value as Record<string, unknown>;
      return {
        backup: createDemoBackup(
          validateSnapshot(value),
          (legacy.demoOperationsV1 as OperationRecord[]) ?? [],
        ),
        legacy: true,
      };
    }
    const parsed = envelope.parse(value);
    return {
      backup: createDemoBackup(
        validateSnapshot(parsed.fleet),
        parsed.operations as OperationRecord[],
        parsed.exportedAt,
      ),
      legacy: false,
    };
  } catch (e) {
    if (e instanceof z.ZodError)
      throw Error(
        "El formato, la versión o los datos de la copia no son compatibles.",
      );
    throw e;
  }
}
export interface DemoRestorePreview {
  backup: DemoBackup;
  expectedCore: string;
  expectedLegacyOperations: string | null;
}
export function prepareDemoRestore(
  storage: DemoStorage,
  backup: DemoBackup,
): DemoRestorePreview {
  const valid = createDemoBackup(
    backup.fleet,
    backup.operations,
    backup.exportedAt,
  );
  const current = storage.getItem(STORAGE_KEY);
  if (current === null) throw Error("No se encuentra la demostración actual.");
  const fleet = validateSnapshot(JSON.parse(current));
  createDemoBackup(fleet, readDemoOperations(storage, fleet) ?? []);
  return {
    backup: valid,
    expectedCore: current,
    expectedLegacyOperations: storage.getItem(demoOperationKey),
  };
}
export function restoreDemoBackup(
  storage: DemoStorage,
  preview: DemoRestorePreview,
) {
  const valid = createDemoBackup(
    preview.backup.fleet,
    preview.backup.operations,
    preview.backup.exportedAt,
  );
  const unchanged = () =>
    storage.getItem(STORAGE_KEY) === preview.expectedCore &&
    storage.getItem(demoOperationKey) === preview.expectedLegacyOperations;
  if (!unchanged())
    throw Error(
      "Los datos han cambiado desde la vista previa. Vuelve a seleccionar la copia para revisarla.",
    );
  const fleet = validateSnapshot(JSON.parse(preview.expectedCore));
  const recovery = createDemoBackup(
    fleet,
    readDemoOperations(storage, fleet) ?? [],
  );
  try {
    storage.setItem(demoRecoveryKey, JSON.stringify(recovery));
  } catch {
    throw Error(
      "No hay espacio para conservar la copia de recuperación. No se ha restaurado nada.",
    );
  }
  if (!unchanged())
    throw Error(
      "Los datos han cambiado durante la preparación. Se han conservado; revisa de nuevo la copia.",
    );
  try {
    // One atomic write replaces both record sets. A failed write leaves the
    // previous workspace intact; no staged or half-restored state is exposed.
    writeDemoWorkspace(storage, valid.fleet, valid.operations);
  } catch {
    throw Error(
      "No se ha podido guardar la restauración. La demostración anterior se conserva.",
    );
  }
}
export function readDemoRecovery(storage: DemoStorage) {
  const raw = storage.getItem(demoRecoveryKey);
  return raw === null ? null : parseDemoBackupText(raw).backup;
}
