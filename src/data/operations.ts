import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/database.types";
import type { FleetSnapshot } from "../domain/models";
import { validateSnapshot } from "../domain/models";
import { STORAGE_KEY } from "./demo-keys";
import {
  applyOperation,
  parseOperation,
  validateOperations,
} from "../domain/operations";
import type {
  OperationCommand,
  OperationKind,
  OperationRecord,
} from "../domain/operations";
import { today } from "../lib/format";
import type { VaultSession } from "./offline-vault";
import {
  readDemoOperations,
  hasEmbeddedOperations,
  writeDemoOperations,
} from "./demo-workspace";

export interface OperationRepository {
  load(fleet: FleetSnapshot): Promise<OperationRecord[]>;
  execute(
    command: OperationCommand,
    fleet: FleetSnapshot,
  ): Promise<OperationRecord[]>;
}
export class OfflineOperationRepository implements OperationRepository {
  constructor(private session: VaultSession) {}
  async load(fleet: FleetSnapshot) {
    return validateOperations((await this.session.read()).operations, fleet);
  }
  async execute(command: OperationCommand) {
    return (await this.session.enqueue(command)).operations;
  }
}
export { demoOperationKey } from "./demo-keys";
function future(days: number) {
  const date = new Date(`${today()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function demoOperations(fleet: FleetSnapshot): OperationRecord[] {
  if (!fleet.trucks.length) return [];
  const truckId = fleet.trucks[0].id,
    driverId = fleet.drivers[0]?.id ?? null;
  const id = (n: number) =>
    `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const row = (n: number, kind: OperationKind, data: Record<string, unknown>) =>
    parseOperation({ id: id(n), kind, data, version: 1, financeEntryId: null });
  return [
    row(1, "trailers", {
      plate: "R DEMO 01",
      type: "tautliner",
      status: "available",
      capacityKg: 24000,
      inspectionDueOn: future(20),
      insuranceDueOn: future(80),
    }),
    row(2, "customers", {
      name: "Logística Atlántica · Demo",
      taxId: "DEMO-CLIENTE-01",
      email: "logistica@example.com",
      phone: "",
      address: "Dirección ficticia",
    }),
    row(3, "trips", {
      reference: "DEMO-001",
      truckId,
      driverId,
      trailerId: id(1),
      customerId: id(2),
      origin: "Bilbao",
      destination: "Madrid",
      startOn: future(0),
      endOn: future(1),
      status: "planned",
      distanceKm: 400,
      amountCents: 98000,
    }),
    row(4, "maintenance", {
      truckId,
      type: "preventive",
      description: "Revisión de frenos y filtros",
      scheduledOn: future(8),
      status: "planned",
      odometerKm: fleet.trucks[0].odometerKm,
      amountCents: 32000,
      supplier: "Taller de demostración",
    }),
    row(5, "deadlines", {
      title: "Revisión del tacógrafo",
      category: "tachograph",
      truckId,
      dueOn: future(15),
      remindDays: 30,
      status: "active",
    }),
    row(6, "fuel", {
      truckId,
      driverId,
      date: future(-5),
      odometerKm: 100000,
      millilitres: 250000,
      amountCents: 35000,
      station: "Estación Demo",
      fullTank: true,
    }),
    row(7, "fuel", {
      truckId,
      driverId,
      date: future(-1),
      odometerKm: 100800,
      millilitres: 240000,
      amountCents: 33600,
      station: "Estación Demo",
      fullTank: true,
    }),
  ];
}
export class DemoOperationRepository implements OperationRepository {
  async load(fleet: FleetSnapshot) {
    const current = localStorage.getItem(STORAGE_KEY);
    const actualFleet =
      current === null ? fleet : validateSnapshot(JSON.parse(current));
    if (actualFleet.organization.id !== fleet.organization.id)
      throw Error(
        "El espacio de demostración ha cambiado. Recarga para continuar.",
      );
    const rows =
      readDemoOperations(localStorage, actualFleet) ??
      validateOperations(demoOperations(actualFleet), actualFleet);
    if (!hasEmbeddedOperations(localStorage))
      writeDemoOperations(localStorage, rows);
    return rows;
  }
  async execute(command: OperationCommand, fleet: FleetSnapshot) {
    const next = applyOperation(await this.load(fleet), command, fleet);
    writeDemoOperations(localStorage, next);
    return next;
  }
  async markBooked(id: string, entryId: string, fleet: FleetSnapshot) {
    const rows = (await this.load(fleet)).map((r) =>
      r.id === id
        ? { ...r, financeEntryId: entryId, version: r.version + 1 }
        : r,
    );
    writeDemoOperations(localStorage, rows);
    return rows;
  }
}
function databaseError(error: { code?: string } | null): never {
  if (error?.code === "40001")
    throw Error(
      "Otro dispositivo ha cambiado este registro. Actualiza y revisa los datos; tu cambio no se ha sobrescrito.",
    );
  if (error?.code === "23503")
    throw Error(
      "Este registro está vinculado a otros datos. Conserva su historial y revisa las asignaciones.",
    );
  if (error?.code === "23505")
    throw Error(
      "Ya existe ese registro o hay un vehículo asignado a otro viaje en curso.",
    );
  if (error?.code === "42501")
    throw Error(
      "Tu cuenta no tiene permiso para esta operación. Actualiza tus permisos.",
    );
  throw Error(
    "No se ha podido guardar. Revisa los datos y tu conexión; no cierres el formulario.",
  );
}
export class CloudOperationRepository implements OperationRepository {
  constructor(
    private client: SupabaseClient<Database>,
    readonly organizationId: string,
  ) {}
  async load(fleet: FleetSnapshot) {
    const rows: OperationRecord[] = [];
    let after: string | null = null;
    for (let page = 0; page < 101; page++) {
      const {
        data,
        error,
      }: { data: Json | null; error: { code?: string } | null } =
        await this.client.rpc("tc_list_records", {
          p_org: this.organizationId,
          p_after: after,
        });
      if (error || !Array.isArray(data))
        throw Error("No se han podido cargar las operaciones de esta empresa.");
      const batch: OperationRecord[] = data.map(parseOperation);
      rows.push(...batch);
      if (batch.length < 500) return validateOperations(rows, fleet);
      after = batch.at(-1)!.id;
    }
    throw Error(
      "El historial supera el límite de consulta. Los datos se conservan.",
    );
  }
  async execute(command: OperationCommand, fleet: FleetSnapshot) {
    const result =
      command.type === "save"
        ? await this.client.rpc("tc_save_record", {
            p_org: this.organizationId,
            p_id: command.value.id,
            p_kind: command.value.kind,
            p_payload: command.value.data as Json,
            p_expected: command.expected,
          })
        : await this.client.rpc("tc_delete_record", {
            p_org: this.organizationId,
            p_id: command.id,
            p_expected: command.expected,
          });
    if (result.error) databaseError(result.error);
    return this.load(fleet);
  }
  async book(record: OperationRecord) {
    const { error } = await this.client.rpc("tc_book_record", {
      p_org: this.organizationId,
      p_record: record.id,
      p_expected: record.version,
    });
    if (error) databaseError(error);
  }
}
