import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;
const ownerA = "10000000-0000-4000-8000-000000000001",
  ownerB = "10000000-0000-4000-8000-000000000002";
const orgA = "20000000-0000-4000-8000-000000000001",
  orgB = "20000000-0000-4000-8000-000000000002";
const truckA = "30000000-0000-4000-8000-000000000001",
  truckB = "30000000-0000-4000-8000-000000000002";
const driverA = "40000000-0000-4000-8000-000000000001";
async function asOwner(owner: string, fn: () => Promise<void>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    owner,
  ]);
  try {
    await fn();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
  `);
  for (const file of readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users(id) values ($1), ($2)", [
    ownerA,
    ownerB,
  ]);
  await db.query(
    "insert into public.organizations(id, owner_id, name) values ($1,$2,$3),($4,$5,$6)",
    [orgA, ownerA, "Demo A", orgB, ownerB, "Demo B"],
  );
  await db.query(
    "insert into public.drivers(id, organization_id, name, license, license_expires_on) values ($1,$2,'Conductor demo','CE','2028-01-01')",
    [driverA, orgA],
  );
  await db.query(
    "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on,driver_id) values ($1,$2,'1234 TST','Demo','Model',2025,'2028-01-01',$3),($4,$5,'5678 TST','Demo','Model',2025,'2028-01-01',null)",
    [truckA, orgA, driverA, truckB, orgB],
  );
  await db.query(
    "insert into public.finance_entries(organization_id,truck_id,kind,concept,date,amount_cents,category) values ($1,$2,'income','Ingreso demo','2026-10-01',10010,'transport'),($1,$2,'expense','Gasto demo','2026-10-01',2010,'fuel'),($3,$4,'income','Otra demo','2026-10-01',50000,'transport')",
    [orgA, truckA, orgB, truckB],
  );
}, 30_000);
afterAll(async () => {
  await db?.close();
});

describe("migración PostgreSQL y autorización RLS", () => {
  it("habilita RLS en todas las tablas expuestas del proyecto", async () => {
    const result = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'",
    );
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
  });
  it("cada propietario solo ve su organización, camiones y movimientos", async () => {
    await asOwner(ownerA, async () => {
      expect(
        (await db.query("select * from public.organizations")).rows,
      ).toHaveLength(1);
      expect((await db.query("select * from public.trucks")).rows).toHaveLength(
        1,
      );
      expect(
        (await db.query("select * from public.finance_entries")).rows,
      ).toHaveLength(2);
    });
    await asOwner(ownerB, async () =>
      expect(
        (await db.query("select * from public.drivers")).rows,
      ).toHaveLength(0),
    );
  });
  it("no deja leer a visitantes anónimos", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.trucks")).rejects.toThrow(
        "permission denied",
      );
    } finally {
      await db.exec("reset role");
    }
  });
  it("impide insertar datos en una organización ajena y transferir la propiedad", async () => {
    await asOwner(ownerB, async () => {
      await expect(
        db.query(
          "insert into public.finance_entries(organization_id,truck_id,kind,concept,date,amount_cents,category) values ($1,$2,'income','Intrusión','2026-10-02',100,'transport')",
          [orgA, truckA],
        ),
      ).rejects.toThrow("row-level security");
      const result = await db.query(
        "update public.organizations set owner_id=$1 where id=$2 returning id",
        [ownerB, orgA],
      );
      expect(result.rows).toHaveLength(0);
    });
    await asOwner(ownerA, async () => {
      await expect(
        db.query("update public.organizations set owner_id=$1 where id=$2", [
          ownerB,
          orgA,
        ]),
      ).rejects.toThrow("row-level security");
    });
  });
  it("permite al propietario editar y reconcilia el resultado SQL con céntimos exactos", async () => {
    await asOwner(ownerA, async () => {
      await db.query(
        "update public.trucks set route='Ruta de prueba' where id=$1",
        [truckA],
      );
      const result = await db.query<{ cents: string }>(
        "select sum(case when kind='income' then amount_cents else -amount_cents end)::text as cents from public.finance_entries",
      );
      expect(result.rows[0].cents).toBe("8000");
    });
  });
  it("bloquea referencias a camiones de otra organización incluso como administrador", async () => {
    await expect(
      db.query(
        "insert into public.finance_entries(organization_id,truck_id,kind,concept,date,amount_cents,category) values ($1,$2,'expense','Referencia cruzada','2026-10-01',100,'fuel')",
        [orgA, truckB],
      ),
    ).rejects.toThrow("foreign key");
  });
  it("ejecuta los triggers con los permisos reales del propietario", async () => {
    await asOwner(ownerA, async () => {
      const driver = "40000000-0000-4000-8000-000000000003";
      const truck = "30000000-0000-4000-8000-000000000003";
      await db.query(
        "insert into public.drivers(id,organization_id,name,license,license_expires_on) values ($1,$2,'Conductor de prueba','CE','2028-01-01')",
        [driver, orgA],
      );
      await db.query(
        "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on,driver_id) values ($1,$2,'9012 TST','Demo','Prueba',2025,'2028-01-01',$3)",
        [truck, orgA, driver],
      );
      await expect(
        db.query("update public.drivers set status='leave' where id=$1", [
          driver,
        ]),
      ).rejects.toThrow("Unassign");
      await db.query("update public.trucks set driver_id=null where id=$1", [
        truck,
      ]);
      await db.query("update public.drivers set status='leave' where id=$1", [
        driver,
      ]);
      await expect(
        db.query("update public.trucks set driver_id=$1 where id=$2", [
          driver,
          truck,
        ]),
      ).rejects.toThrow("active");
      await db.query("delete from public.trucks where id=$1", [truck]);
      await db.query("delete from public.drivers where id=$1", [driver]);
    });
  });
  it("impide borrar vehículos con historial y asignar un conductor dos veces", async () => {
    await expect(
      db.query("delete from public.trucks where id=$1", [truckA]),
    ).rejects.toThrow("foreign key");
    await expect(
      db.query(
        "insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on,driver_id) values ($1,'9999 TST','Demo','Model',2025,'2028-01-01',$2)",
        [orgA, driverA],
      ),
    ).rejects.toThrow("duplicate key");
  });
  it("valida en el servidor importes, kilómetros y disponibilidad del conductor", async () => {
    await expect(
      db.query(
        "update public.finance_entries set amount_cents=-1 where organization_id=$1",
        [orgA],
      ),
    ).rejects.toThrow("check constraint");
    await expect(
      db.query(
        "update public.finance_entries set distance_km=12 where kind='expense' and organization_id=$1",
        [orgA],
      ),
    ).rejects.toThrow("check constraint");
    await expect(
      db.query("update public.drivers set status='leave' where id=$1", [
        driverA,
      ]),
    ).rejects.toThrow("Unassign");
  });
});
