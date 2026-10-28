import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { FleetRepository } from "../../data/repository";
import type { FleetCommand } from "../../domain/commands";
import { validateSnapshot } from "../../domain/models";
import { today } from "../../lib/format";

type Tables = Database["public"]["Tables"];
type FleetTable = "trucks" | "drivers" | "finance_entries";

/** Tenant scope is fixed at construction; every query also passes through RLS. */
export class SupabaseFleetRepository implements FleetRepository {
  private versions = new Map<string, number>();
  constructor(
    private client: SupabaseClient<Database>,
    private organization: { id: string; name: string },
  ) {}

  private rows(table: "trucks"): Promise<Tables["trucks"]["Row"][]>;
  private rows(table: "drivers"): Promise<Tables["drivers"]["Row"][]>;
  private rows(
    table: "finance_entries",
  ): Promise<Tables["finance_entries"]["Row"][]>;
  private async rows(table: FleetTable): Promise<Tables[FleetTable]["Row"][]> {
    const rows: Tables[FleetTable]["Row"][] = [];
    // Paginate explicitly: Supabase's default 1,000-row cap must not truncate finance.
    for (let page = 0; page < 101; page++) {
      const { data, error } = await this.client
        .from(table)
        .select("*")
        .eq("organization_id", this.organization.id)
        .order("id")
        .range(page * 1000, page * 1000 + 999);
      if (error)
        throw new Error(
          "No se ha podido cargar la empresa. Comprueba tu conexión e inicia sesión de nuevo si es necesario.",
        );
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
    throw new Error(
      "La empresa supera el límite de esta versión. Los datos no se han modificado.",
    );
  }

  async load() {
    const [trucks, drivers, entries] = await Promise.all([
      this.rows("trucks"),
      this.rows("drivers"),
      this.rows("finance_entries"),
    ]);
    const snapshot = validateSnapshot({
      schemaVersion: 1,
      organization: this.organization,
      demoMonth: today().slice(0, 7),
      trucks: trucks.map((t) => ({
        id: t.id,
        plate: t.plate,
        brand: t.brand,
        model: t.model,
        year: t.year,
        odometerKm: t.odometer_km,
        status: t.status,
        driverId: t.driver_id,
        inspectionDueOn: t.inspection_due_on,
        route: t.route,
      })),
      drivers: drivers.map((d) => ({
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        license: d.license,
        licenseExpiresOn: d.license_expires_on,
        status: d.status,
      })),
      entries: entries.map((e) => ({
        id: e.id,
        truckId: e.truck_id,
        kind: e.kind,
        concept: e.concept,
        date: e.date,
        amountCents: Number(e.amount_cents),
        category: e.category,
        paymentStatus: e.payment_status,
        distanceKm: e.distance_km,
      })),
    });
    this.versions = new Map([
      ...trucks.map((r) => [`trucks:${r.id}`, Number(r.row_version)] as const),
      ...drivers.map(
        (r) => [`drivers:${r.id}`, Number(r.row_version)] as const,
      ),
      ...entries.map(
        (r) => [`finance_entries:${r.id}`, Number(r.row_version)] as const,
      ),
    ]);
    return snapshot;
  }
  async execute(command: FleetCommand) {
    const table: FleetTable = command.type.endsWith("truck")
      ? "trucks"
      : command.type.endsWith("driver")
        ? "drivers"
        : "finance_entries";
    const id = "value" in command ? command.value.id : command.id;
    const expected = this.versions.get(`${table}:${id}`);
    let failure: { message: string; code?: string } | null = null;
    if ("value" in command) {
      let value: Tables[FleetTable]["Insert"];
      if (command.type === "save-truck") {
        const t = command.value;
        value = {
          id: t.id,
          organization_id: this.organization.id,
          plate: t.plate.trim().toUpperCase(),
          brand: t.brand,
          model: t.model,
          year: t.year,
          odometer_km: t.odometerKm,
          status: t.status,
          driver_id: t.driverId,
          inspection_due_on: t.inspectionDueOn,
          route: t.route,
          row_version: 1,
        };
      } else if (command.type === "save-driver") {
        const d = command.value;
        value = {
          id: d.id,
          organization_id: this.organization.id,
          name: d.name,
          email: d.email,
          phone: d.phone,
          license: d.license,
          license_expires_on: d.licenseExpiresOn,
          status: d.status,
          row_version: 1,
        };
      } else {
        const e = command.value;
        value = {
          id: e.id,
          organization_id: this.organization.id,
          truck_id: e.truckId,
          kind: e.kind,
          concept: e.concept,
          date: e.date,
          amount_cents: e.amountCents,
          category: e.category,
          payment_status: e.paymentStatus,
          distance_km: e.distanceKm,
          row_version: 1,
        };
      }
      if (expected === undefined) {
        // The command above selects both the table and its matching payload.
        const result = await (table === "trucks"
          ? this.client
              .from("trucks")
              .insert(value as Tables["trucks"]["Insert"])
          : table === "drivers"
            ? this.client
                .from("drivers")
                .insert(value as Tables["drivers"]["Insert"])
            : this.client
                .from("finance_entries")
                .insert(value as Tables["finance_entries"]["Insert"]));
        failure = result.error;
      } else {
        const { row_version: _version, ...fields } = value;
        void _version;
        const result = await this.client
          .from(table)
          .update(fields)
          .eq("organization_id", this.organization.id)
          .eq("id", id)
          .eq("row_version", expected)
          .select("id");
        failure = result.error;
        if (!failure && result.data?.length !== 1)
          throw new Error(
            "Otro dispositivo ha cambiado este registro. Recarga la empresa antes de volver a editarlo.",
          );
      }
    } else {
      if (expected === undefined)
        throw new Error(
          "El registro ya no está disponible. Recarga la empresa.",
        );
      const result = await this.client
        .from(table)
        .delete()
        .eq("organization_id", this.organization.id)
        .eq("id", id)
        .eq("row_version", expected)
        .select("id");
      failure = result.error;
      if (!failure && result.data?.length !== 1)
        throw new Error(
          "Otro dispositivo ha cambiado este registro. Recarga la empresa.",
        );
    }
    if (failure) {
      const message =
        failure.code === "23505"
          ? "Ya existe un registro con esos datos."
          : failure.code === "23503"
            ? "El registro está vinculado a otros datos de la empresa. Conserva su historial."
            : "No se ha podido guardar el cambio. Comprueba tus permisos y la conexión.";
      throw new Error(message);
    }
    // The write has committed. A later network failure must never cause a local demo fallback.
    return this.load();
  }
  async save(): Promise<never> {
    throw new Error("El modo empresa guarda cada cambio por separado.");
  }
  async reset(): Promise<never> {
    throw new Error(
      "Los datos de empresa no pueden restablecerse como una demostración.",
    );
  }
}
