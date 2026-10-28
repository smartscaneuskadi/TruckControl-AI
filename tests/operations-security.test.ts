import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;
let orgA: string, orgB: string;
const id = (n: number) =>
  `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ownerA = id(1),
  ownerB = id(2),
  viewer = id(3),
  operator = id(4),
  truckA = id(10),
  truckB = id(11),
  customerA = id(20),
  trailerA = id(21),
  tripA = id(22);
async function as<T>(
  user: string | null,
  action: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc<T = Record<string, unknown>>(
  name: string,
  args: unknown[] = [],
) {
  const result = await db.query<{ v: T }>(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) v`,
    args.map((v) =>
      v !== null && typeof v === "object" ? JSON.stringify(v) : v,
    ),
  );
  return result.rows[0].v;
}
const save = (
  org: string,
  record: string,
  kind: string,
  data: Record<string, unknown>,
  version: number | null = null,
) =>
  rpc<{
    id: string;
    data: Record<string, unknown>;
    version: number;
    financeEntryId: string | null;
  }>("tc_save_record", [org, record, kind, data, version]);
const customer = {
  name: "Cliente ficticio",
  taxId: "DEMO-CIF",
  email: "",
  phone: "",
  address: "",
  notes: "",
};
const trailer = {
  plate: "R DEMO 10",
  type: "tautliner",
  status: "available",
  capacityKg: 24000,
  inspectionDueOn: "2027-02-01",
  insuranceDueOn: "2027-03-01",
  notes: "",
};
const trip = {
  reference: "DEMO-SEC-01",
  customerId: customerA,
  truckId: truckA,
  driverId: null,
  trailerId: trailerA,
  origin: "Bilbao",
  destination: "Madrid",
  startOn: "2026-10-28",
  endOn: "2026-10-29",
  status: "completed",
  distanceKm: 400,
  amountCents: 98000,
  notes: "",
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [i, user] of [ownerA, ownerB, viewer, operator].entries()) {
    const metadata = {
      truckcontrol_registration: {
        contact_name: `Persona Demo ${i}`,
        company_name: `Empresa Demo ${i}`,
        tax_id: `DEMO-${i}`,
        address: "Dirección ficticia 10",
        phone: `+3460000000${i}`,
        requested_plan: "limited",
      },
      role: "admin",
      company_role: "owner",
    };
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [user, `demo${i}@example.com`, metadata],
    );
  }
  orgA = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [ownerA],
    )
  ).rows[0].id;
  orgB = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [ownerB],
    )
  ).rows[0].id;
  for (const [truck, org] of [
    [truckA, orgA],
    [truckB, orgB],
  ])
    await db.query(
      `insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route)
 values($1,$2,$3,'Demo','Demo',2024,100000,'available','2027-01-01','')`,
      [truck, org, truck === truckA ? "DEMO 01" : "DEMO 02"],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("seguridad de equipo y operaciones por empresa", () => {
  it("activa treinta días sin enviar SMS cuando no existe proveedor y mantiene el límite de 50", async () => {
    const access = await as(ownerA, () =>
      rpc<{
        active: boolean;
        max_trucks: number;
        requires_phone_verification: boolean;
        profile: { trial_started_at: string; trial_ends_at: string };
      }>("tc_organization_access", [orgA]),
    );
    expect(access.active).toBe(true);
    expect(access.max_trucks).toBe(50);
    expect(access.requires_phone_verification).toBe(false);
    expect(
      (Date.parse(access.profile.trial_ends_at) -
        Date.parse(access.profile.trial_started_at)) /
        86400000,
    ).toBeCloseTo(30, 4);
  });
  it("rechaza lectura anónima y servicios internos desde el navegador", async () => {
    await as(
      null,
      () =>
        expect(rpc("tc_list_records", [orgA])).rejects.toThrow(
          "permission denied",
        ),
      "anon",
    );
    await as(ownerA, () =>
      expect(rpc("tc_company_server_access", [ownerB, orgB])).rejects.toThrow(
        "permission denied",
      ),
    );
    await as(ownerA, () =>
      expect(db.query("select * from private.tc_memberships")).rejects.toThrow(
        "permission denied",
      ),
    );
  });
  it("crea operaciones válidas con el usuario y la empresa de la sesión", async () => {
    const result = await as(ownerA, () =>
      save(orgA, customerA, "customers", customer),
    );
    expect(result.id).toBe(customerA);
    expect(result.version).toBe(1);
    await as(ownerA, () => save(orgA, trailerA, "trailers", trailer));
    await as(ownerA, () => save(orgA, tripA, "trips", trip));
    const rows = await as(ownerA, () =>
      rpc<unknown[]>("tc_list_records", [orgA]),
    );
    expect(rows).toHaveLength(3);
  });
  it("bloquea IDOR de lectura, escritura y contabilidad de otra empresa", async () => {
    await as(ownerB, () =>
      expect(rpc("tc_list_records", [orgA])).rejects.toThrow(
        "Empresa no disponible",
      ),
    );
    await as(ownerB, () =>
      expect(save(orgA, id(30), "customers", customer)).rejects.toThrow(
        "Sin permiso",
      ),
    );
    await as(ownerB, () =>
      expect(rpc("tc_book_record", [orgA, tripA, 1])).rejects.toThrow(
        "Sin permiso",
      ),
    );
    expect(
      await as(ownerB, () => rpc<unknown[]>("tc_list_records", [orgB])),
    ).toHaveLength(0);
  });
  it("rechaza referencias cruzadas, fechas imposibles e importes fraccionarios", async () => {
    await as(ownerA, () =>
      expect(
        save(orgA, id(31), "trips", { ...trip, truckId: truckB }),
      ).rejects.toThrow("foreign key"),
    );
    await as(ownerA, () =>
      expect(
        save(orgA, id(31), "trips", { ...trip, startOn: "2026-02-30" }),
      ).rejects.toThrow("Revisa los datos"),
    );
    await as(ownerA, () =>
      expect(
        save(orgA, id(31), "trips", { ...trip, amountCents: 0.5 }),
      ).rejects.toThrow("Revisa los datos"),
    );
  });
  it("impide sobrescribir cambios de otro dispositivo y admite reintentos idénticos", async () => {
    expect(
      (await as(ownerA, () => save(orgA, customerA, "customers", customer)))
        .version,
    ).toBe(1);
    const update = { ...customer, name: "Cliente revisado" };
    expect(
      (await as(ownerA, () => save(orgA, customerA, "customers", update, 1)))
        .version,
    ).toBe(2);
    expect(
      (await as(ownerA, () => save(orgA, customerA, "customers", update, 1)))
        .version,
    ).toBe(2);
    await as(ownerA, () =>
      expect(
        save(
          orgA,
          customerA,
          "customers",
          { ...customer, name: "Otro cambio" },
          1,
        ),
      ).rejects.toThrow("Otro dispositivo"),
    );
  });
  it("contabiliza el viaje una sola vez y conserva su registro y referencias", async () => {
    const first = await as(ownerA, () =>
      rpc<{ entry_id: string; already_booked: boolean }>("tc_book_record", [
        orgA,
        tripA,
        1,
      ]),
    );
    const retry = await as(ownerA, () =>
      rpc<{ entry_id: string; already_booked: boolean }>("tc_book_record", [
        orgA,
        tripA,
        1,
      ]),
    );
    expect(first.entry_id).toBe(retry.entry_id);
    expect(retry.already_booked).toBe(true);
    const entries = await as(ownerA, () =>
      db.query<{ amount_cents: number; concept: string }>(
        "select amount_cents,concept from public.finance_entries where organization_id=$1",
        [orgA],
      ),
    );
    expect(entries.rows).toHaveLength(1);
    expect(entries.rows[0].amount_cents).toBe(98000);
    expect(entries.rows[0].concept).toContain("DEMO-SEC-01");
    await as(ownerA, () =>
      expect(
        save(orgA, tripA, "trips", { ...trip, amountCents: 1 }, 2),
      ).rejects.toThrow("Conserva el registro"),
    );
    await as(ownerA, () =>
      expect(rpc("tc_delete_record", [orgA, customerA, 2])).rejects.toThrow(
        "foreign key",
      ),
    );
  });
  it("evita dos viajes en curso con el mismo camión y matrículas duplicadas", async () => {
    await as(ownerA, () =>
      save(orgA, id(32), "trips", { ...trip, status: "in_transit" }),
    );
    await as(ownerA, () =>
      expect(
        save(orgA, id(33), "trips", { ...trip, status: "in_transit" }),
      ).rejects.toThrow("unique constraint"),
    );
    await as(ownerA, () =>
      expect(
        save(orgA, id(34), "trailers", { ...trailer, plate: "r-demo-10" }),
      ).rejects.toThrow("unique constraint"),
    );
  });
  it("solo un administrador puede invitar y el destinatario debe aceptar", async () => {
    await as(ownerB, () =>
      expect(
        rpc("tc_team_control", [
          orgA,
          "invite",
          { email: "demo2@example.com", role: "viewer" },
        ]),
      ).rejects.toThrow("Solo el administrador"),
    );
    await as(ownerA, () =>
      rpc("tc_team_control", [
        orgA,
        "invite",
        { email: "demo2@example.com", role: "viewer" },
      ]),
    );
    await as(viewer, () =>
      expect(rpc("tc_list_records", [orgA])).rejects.toThrow(
        "Empresa no disponible",
      ),
    );
    const invitations = await as(viewer, () =>
      rpc<unknown[]>("tc_team_control", [null, "invitations", {}]),
    );
    expect(invitations).toHaveLength(1);
    await as(viewer, () => rpc("tc_team_control", [orgA, "accept", {}]));
    expect(
      await as(viewer, () => rpc<unknown[]>("tc_list_records", [orgA])),
    ).toHaveLength(4);
  });
  it("permite consultar al lector y rechaza cualquier escritura o gestión de equipo", async () => {
    const access = await as(viewer, () =>
      rpc<{ active: boolean; company_role: string; can_write: boolean }>(
        "tc_organization_access",
        [orgA],
      ),
    );
    expect(access.active).toBe(true);
    expect(access.company_role).toBe("viewer");
    expect(access.can_write).toBe(false);
    await as(viewer, () =>
      expect(save(orgA, id(40), "customers", customer)).rejects.toThrow(
        "Sin permiso",
      ),
    );
    await as(viewer, () =>
      expect(rpc("tc_delete_record", [orgA, customerA, 2])).rejects.toThrow(
        "Sin permiso",
      ),
    );
    expect(
      (
        await as(viewer, () =>
          db.query("delete from public.trucks where id=$1 returning id", [
            truckA,
          ]),
        )
      ).rows,
    ).toHaveLength(0);
    await as(viewer, () =>
      expect(rpc("tc_team_control", [orgA, "list", {}])).rejects.toThrow(
        "Solo el administrador",
      ),
    );
  });
  it("un empleado con su propia prueba caducada puede trabajar en una empresa activa", async () => {
    await db.query(
      "update private.tc_customers set trial_ends_at=now()-interval '1 day',trial_started_at=now()-interval '31 days' where user_id=$1",
      [viewer],
    );
    expect(
      (await as(viewer, () => rpc<{ active: boolean }>("tc_my_access"))).active,
    ).toBe(false);
    expect(
      (
        await as(viewer, () =>
          rpc<{ active: boolean }>("tc_organization_access", [orgA]),
        )
      ).active,
    ).toBe(true);
  });
  it("operador edita operaciones pero no amplía permisos ni supera el bloqueo de un módulo", async () => {
    await as(ownerA, () =>
      rpc("tc_team_control", [
        orgA,
        "invite",
        {
          email: "demo3@example.com",
          role: "operator",
          module_overrides: { trips: false },
        },
      ]),
    );
    await as(operator, () => rpc("tc_team_control", [orgA, "accept", {}]));
    await as(operator, () => save(orgA, id(41), "customers", customer));
    await as(operator, () =>
      expect(save(orgA, id(42), "trips", trip)).rejects.toThrow("Sin permiso"),
    );
    await as(operator, () =>
      expect(
        rpc("tc_team_control", [
          orgA,
          "update",
          { user_id: operator, role: "admin" },
        ]),
      ).rejects.toThrow("Solo el administrador"),
    );
  });
  it("revocar un miembro impide el acceso aunque conserve la sesión", async () => {
    await as(ownerA, () =>
      rpc("tc_team_control", [orgA, "remove", { user_id: operator }]),
    );
    await as(operator, () =>
      expect(rpc("tc_list_records", [orgA])).rejects.toThrow(
        "Empresa no disponible",
      ),
    );
  });
  it("activar SMS más adelante exige verificación sin reiniciar el periodo de prueba", async () => {
    const before = await db.query<{ trial_ends_at: string }>(
      "select trial_ends_at from private.tc_customers where user_id=$1",
      [ownerA],
    );
    await db.exec("update private.tc_settings set sms_ready=true");
    const access = await as(ownerA, () =>
      rpc<{ active: boolean; requires_phone_verification: boolean }>(
        "tc_organization_access",
        [orgA],
      ),
    );
    expect(access.active).toBe(false);
    expect(access.requires_phone_verification).toBe(true);
    await as(ownerA, () =>
      expect(rpc("tc_list_records", [orgA])).rejects.toThrow(
        "Empresa no disponible",
      ),
    );
    await db.query(
      "update auth.users set phone='34600000000',phone_confirmed_at=now() where id=$1",
      [ownerA],
    );
    const after = await db.query<{ trial_ends_at: string }>(
      "select trial_ends_at from private.tc_customers where user_id=$1",
      [ownerA],
    );
    expect(String(after.rows[0].trial_ends_at)).toBe(
      String(before.rows[0].trial_ends_at),
    );
    expect(
      (
        await as(ownerA, () =>
          rpc<{ active: boolean }>("tc_organization_access", [orgA]),
        )
      ).active,
    ).toBe(true);
  });
});
