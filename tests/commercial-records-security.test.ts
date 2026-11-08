import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import {
  tripFinanceSchema,
  tripCandidatesSchema,
} from "../src/domain/commercial-records";
let db: PGlite, org: string, foreign: string;
const owner = "fce10000-0000-4000-8000-000000000001",
  other = "fce10000-0000-4000-8000-000000000002",
  viewer = "fce10000-0000-4000-8000-000000000003";
const truck = "fce20000-0000-4000-8000-000000000001",
  truck2 = "fce20000-0000-4000-8000-000000000002",
  trip = "fce30000-0000-4000-8000-000000000001",
  trip2 = "fce30000-0000-4000-8000-000000000002";
const income = "fce40000-0000-4000-8000-000000000001",
  expense = "fce40000-0000-4000-8000-000000000002",
  wrongTruckExpense = "fce40000-0000-4000-8000-000000000003",
  supplier = "fce50000-0000-4000-8000-000000000001";
const fields = {
  name: "Taller ficticio",
  tax_id: "demo-supplier-1",
  email: "",
  phone: "",
  address: "",
  notes: "",
  archived: false,
};
async function as<T>(
  actor: string,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec("set role " + role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  await db.exec("savepoint call");
  try {
    return await fn();
  } catch (e) {
    await db.exec("rollback to savepoint call");
    throw e;
  } finally {
    await db.exec("release savepoint call;reset role");
  }
}
async function rpc(
  fn: "tc_company_suppliers" | "tc_trip_finance",
  action: string,
  data: unknown = {},
  company = org,
  actor = owner,
): Promise<any> {
  return as(
    actor,
    async () =>
      (
        await db.query<{ v: unknown }>(
          `select public.${fn}($1,$2,$3::jsonb) v`,
          [company, action, JSON.stringify(data)],
        )
      ).rows[0].v,
  );
}
const suppliers = (
  action: string,
  data: unknown = {},
  company = org,
  actor = owner,
) => rpc("tc_company_suppliers", action, data, company, actor);
const finance = (
  action: string,
  data: Record<string, unknown> = {},
  company = org,
  actor = owner,
) => rpc("tc_trip_finance", action, { trip_id: trip, ...data }, company, actor);
const link = () =>
  finance("link", { entry_id: expense, expected_entry_version: 1 });
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const [n, id] of [owner, other, viewer].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        id,
        `commercial-${n}@example.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: "DEMO Comercial " + n,
            tax_id: "DEMO-COM-" + n,
            address: "Direccion ficticia",
            phone: "+1202555060" + n,
            requested_plan: "limited",
          },
        },
      ],
    );
  org = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [owner],
    )
  ).rows[0].id;
  foreign = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [other],
    )
  ).rows[0].id;
  await db.exec(
    "update private.tc_settings set enforce_access=true,sms_ready=false;update private.tc_modules set enabled=true;update private.tc_customers set status='trial',trial_started_at=now(),trial_ends_at=now()+interval '10 days',trial_plan_id='full';",
  );
  await db.query(
    "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'viewer','active',$3)",
    [org, viewer, owner],
  );
  await db.query(
    "insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values($1,$2,'DEMO-COM-A','Scania','Ficticio',2020,100800,'available',current_date+30,''),($3,$2,'DEMO-COM-B','MAN','Ficticio',2020,100000,'available',current_date+30,'')",
    [truck, org, truck2],
  );
  await db.query(
    "insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values($1,$2,$3,'income','Ingreso ficticio',current_date,110000,'transport','paid',1000),($4,$2,$3,'expense','Gasto ficticio',current_date,33000,'fuel','paid',0),($5,$2,$6,'expense','Otro camion',current_date,10000,'tolls','pending',0)",
    [income, org, truck, expense, wrongTruckExpense, truck2],
  );
  for (const [id, offset] of [
    [trip, 0],
    [trip2, -10],
  ] as const)
    await db.query(
      "insert into private.fleet_records(id,organization_id,kind,payload) values($1,$2,'trips',jsonb_build_object('reference',$3::text,'customerId',null,'truckId',$4::text,'driverId',null,'trailerId',null,'origin','Bilbao ficticio','destination','Lisboa ficticia','startOn',current_date+$5::int,'endOn',current_date+$5::int,'status','completed','distanceKm',1000,'amountCents',140000,'notes',''))",
      [id, org, id, truck, offset],
    );
  await db.query(
    "update private.fleet_records set finance_entry_id=$1 where organization_id=$2 and id=$3",
    [income, org, trip],
  );
}, 30000);
beforeEach(() =>
  db.exec("begin;select set_config('request.jwt.claims','',false)"),
);
afterEach(() => db.exec("rollback;reset role"));
afterAll(() => db.close());
describe("proveedores con empresa,roles y versiones", () => {
  it("crea,normaliza y reintenta sin duplicar", async () => {
    const input = { id: supplier, expected_version: null, fields };
    const s = await suppliers("save", input);
    expect(s.row).toMatchObject({
      organization_id: org,
      tax_id: "DEMO-SUPPLIER-1",
      row_version: 1,
    });
    expect(await suppliers("save", input)).toEqual(s);
    expect((await suppliers("list")).rows).toHaveLength(1);
  });
  it("rechaza edición obsoleta y conserva la ficha", async () => {
    await suppliers("save", { id: supplier, fields });
    const s = await suppliers("save", {
      id: supplier,
      expected_version: 1,
      fields: { ...fields, name: "Nombre revisado" },
    });
    expect(s.row.row_version).toBe(2);
    await expect(
      suppliers("save", {
        id: supplier,
        expected_version: 1,
        fields: { ...fields, name: "Otro nombre" },
      }),
    ).rejects.toThrow();
    expect((await suppliers("list")).rows[0].name).toBe("Nombre revisado");
  });
  it("archiva conservando datos y auditoría", async () => {
    await suppliers("save", { id: supplier, fields });
    const s = await suppliers("save", {
      id: supplier,
      expected_version: 1,
      fields: { ...fields, archived: true },
    });
    expect(s.row.archived).toBe(true);
    expect((await suppliers("list")).rows).toHaveLength(1);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from private.tc_admin_audit where action='company_supplier_save'",
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("no mezcla empresas ni permite escribir a consulta", async () => {
    await suppliers("save", { id: supplier, fields });
    await expect(suppliers("list", {}, org, other)).rejects.toThrow();
    expect((await suppliers("list", {}, org, viewer)).rows).toHaveLength(1);
    await expect(
      suppliers("save", { id: supplier, fields }, org, viewer),
    ).rejects.toThrow();
  });
  it("no permite DML directo ni claves extra o tipos falsos", async () => {
    await expect(
      as(owner, () => db.exec("select * from private.company_suppliers")),
    ).rejects.toThrow();
    for (const f of [
      { ...fields, archived: "true" },
      { ...fields, role: "admin" },
      { ...fields, email: "invalid" },
    ])
      await expect(
        suppliers("save", { id: supplier, fields: f }),
      ).rejects.toThrow();
  });
  it("deduplica identificación por empresa y respeta módulo", async () => {
    await suppliers("save", { id: supplier, fields });
    await expect(
      suppliers("save", { id: crypto.randomUUID(), fields }),
    ).rejects.toThrow();
    expect(
      (await suppliers("save", { id: supplier, fields }, foreign, other)).row
        .organization_id,
    ).toBe(foreign);
    await db.query(
      "update private.tc_customers set module_overrides='{" +
        '"expenses":false' +
        "}' where user_id=$1",
      [owner],
    );
    await expect(suppliers("list")).rejects.toThrow();
  });
  it("sesiones revocadas y usuarios bloqueados no acceden", async () => {
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ session_id: crypto.randomUUID() }),
    ]);
    await expect(suppliers("list")).rejects.toThrow();
    await db.exec("select set_config('request.jwt.claims','',false)");
    await db.query(
      "update auth.users set banned_until=now()+interval '1 day' where id=$1",
      [owner],
    );
    await expect(suppliers("list")).rejects.toThrow();
  });
});
describe("rentabilidad por viaje sin nuevos apuntes ni reparto implícito", () => {
  it("distingue presupuesto,ingreso y revisión pendiente", async () => {
    const s = await finance("summary");
    expect(s).toMatchObject({
      quoted_net_cents: 140000,
      income_cents: 110000,
      expense_cents: 0,
      recorded_margin_cents: 110000,
      reviewed_margin_cents: null,
      reviewed: false,
    });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].auto_booked).toBe(true);
  });
  it("vincula gasto una vez y no duplica contabilidad", async () => {
    const before = await db.query(
      "select sum(amount_cents) amount,count(*) n from public.finance_entries",
    );
    const s = await link();
    expect(s).toMatchObject({
      income_cents: 110000,
      expense_cents: 33000,
      recorded_margin_cents: 77000,
      reviewed_margin_cents: null,
    });
    expect(await link()).toEqual(s);
    expect(
      (
        await db.query(
          "select sum(amount_cents) amount,count(*) n from public.finance_entries",
        )
      ).rows,
    ).toEqual(before.rows);
  });
  it("la revisión explícita queda obsoleta al cambiar un importe", async () => {
    const s = await link();
    const reviewed = await finance("review", {
      expected_fingerprint: s.fingerprint,
    });
    expect(reviewed).toMatchObject({
      reviewed: true,
      reviewed_margin_cents: 77000,
    });
    await db.query(
      "update public.finance_entries set amount_cents=44000 where id=$1",
      [expense],
    );
    expect(await finance("summary")).toMatchObject({
      recorded_margin_cents: 66000,
      reviewed: false,
      reviewed_margin_cents: null,
    });
  });
  it("rechaza revisar una instantánea obsoleta", async () => {
    const s = await finance("summary");
    await link();
    await expect(
      finance("review", { expected_fingerprint: s.fingerprint }),
    ).rejects.toThrow();
  });
  it("no vincula otro camión,otro viaje o apuntes sin versión", async () => {
    await expect(
      finance("link", {
        entry_id: wrongTruckExpense,
        expected_entry_version: 1,
      }),
    ).rejects.toThrow();
    await link();
    await expect(
      finance("link", {
        trip_id: trip2,
        entry_id: expense,
        expected_entry_version: 1,
      }),
    ).rejects.toThrow();
    await expect(finance("link", { entry_id: expense })).rejects.toThrow();
  });
  it("conserva el origen del ingreso contabilizado", async () => {
    await expect(
      finance("unlink", { entry_id: income, expected_entry_version: 1 }),
    ).rejects.toThrow();
    await expect(
      finance("link", {
        trip_id: trip2,
        entry_id: income,
        expected_entry_version: 1,
      }),
    ).rejects.toThrow();
  });
  it("desvincular no elimina el gasto ni mantiene revisión antigua", async () => {
    let s = await link();
    await finance("review", { expected_fingerprint: s.fingerprint });
    s = await finance("unlink", {
      entry_id: expense,
      expected_entry_version: 1,
    });
    expect(s).toMatchObject({
      expense_cents: 0,
      reviewed: false,
      reviewed_margin_cents: null,
    });
    expect(
      (
        await db.query("select id from public.finance_entries where id=$1", [
          expense,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("los vínculos impiden cambiar el camión por una API antigua", async () => {
    await link();
    await db.exec("savepoint legacy");
    await expect(
      db.query("update public.finance_entries set truck_id=$1 where id=$2", [
        truck2,
        expense,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await db.exec("rollback to savepoint legacy");
    await finance("unlink", { entry_id: expense, expected_entry_version: 1 });
    await finance("link", {
      trip_id: trip2,
      entry_id: expense,
      expected_entry_version: 1,
    });
    await expect(
      db.query(
        "update private.fleet_records set payload=jsonb_set(payload,'{truckId}',to_jsonb($1::text)) where id=$2",
        [truck2, trip2],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await db.exec("rollback to savepoint legacy;release savepoint legacy");
  });
  it("ofrece solo apuntes disponibles del mismo camión y conserva versiones", async () => {
    const before = tripCandidatesSchema.parse(await finance("candidates"));
    expect(before.rows.map((r) => r.id)).toEqual([expense]);
    expect(before.rows[0].row_version).toBe(1);
    await link();
    expect((await finance("candidates")).rows).toEqual([]);
    expect((await finance("candidates", { trip_id: trip2 })).rows).toEqual([]);
    const unbooked = tripFinanceSchema.parse(
      await finance("summary", { trip_id: trip2 }),
    );
    expect(unbooked.recorded_margin_cents).toBe(0);
    await finance("unlink", { entry_id: expense, expected_entry_version: 1 });
    const result = tripFinanceSchema.parse(
      await finance("link", {
        trip_id: trip2,
        entry_id: expense,
        expected_entry_version: 1,
      }),
    );
    expect(result.rows[0].auto_booked).toBe(false);
    expect(result.reviewed_margin_cents).toBeNull();
  });
  it("oculta importes,fingerprint y revisión sin permiso económico", async () => {
    await link();
    await db.query(
      "update private.tc_customers set module_overrides='{" +
        '"expenses":false' +
        "}' where user_id=$1",
      [owner],
    );
    const s = await finance("summary");
    expect(s).toMatchObject({
      income_cents: 110000,
      expense_cents: null,
      expense_count: null,
      recorded_margin_cents: null,
      reviewed_margin_cents: null,
      fingerprint: null,
      can_review: false,
    });
    expect(s.rows.every((r: any) => r.kind === "income")).toBe(true);
  });
  it("no accede a empresa ajena ni modifica como consulta", async () => {
    await expect(finance("summary", {}, org, other)).rejects.toThrow();
    expect((await finance("summary", {}, org, viewer)).organization_id).toBe(
      org,
    );
    await expect(
      finance(
        "link",
        { entry_id: expense, expected_entry_version: 1 },
        org,
        viewer,
      ),
    ).rejects.toThrow();
    await expect(
      as(owner, () => db.exec("select * from private.trip_finance_links")),
    ).rejects.toThrow();
  });
});
describe("copia comercial con autorización vigente", () => {
  async function page(
    kind: string,
    actor = owner,
    company = org,
    after: string | null = null,
  ): Promise<any> {
    return as(
      actor,
      async () =>
        (
          await db.query<{ v: unknown }>(
            "select public.tc_commercial_backup_page($1,$2,$3) v",
            [company, kind, after],
          )
        ).rows[0].v,
    );
  }
  it("incluye fichas archivadas, asociaciones y revisión sin duplicar contabilidad", async () => {
    await suppliers("save", {
      id: supplier,
      fields: { ...fields, archived: true },
    });
    const s = await link();
    await finance("review", { expected_fingerprint: s.fingerprint });
    expect((await page("suppliers")).rows[0]).toMatchObject({
      id: supplier,
      archived: true,
      organization_id: org,
    });
    expect((await page("trip_links")).rows[0]).toMatchObject({
      entry_id: expense,
      trip_id: trip,
      created_by: owner,
    });
    expect((await page("trip_reviews")).rows[0].fingerprint).toBe(
      s.fingerprint,
    );
    expect((await page("suppliers", owner, org, supplier)).rows).toEqual([]);
  });
  it("deniega consulta,otra empresa, permisos revocados y archivos ajenos", async () => {
    await expect(page("suppliers", viewer)).rejects.toThrow();
    await expect(page("suppliers", other)).rejects.toThrow();
    await expect(page("secrets")).rejects.toThrow();
    await db.query(
      "update private.tc_customers set module_overrides=$1 where user_id=$2",
      [{ expenses: false }, owner],
    );
    await expect(page("suppliers")).rejects.toThrow();
    await expect(page("trip_links")).rejects.toThrow();
  });
});
