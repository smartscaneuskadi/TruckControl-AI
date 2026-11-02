import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { emptyTyreData } from "../src/domain/tyres";
import type { TyreData, TyreRecord, TyreHistory } from "../src/domain/tyres";
let db: PGlite, org: string, foreign: string;
const owner = "ea100000-0000-4000-8000-000000000001",
  other = "ea100000-0000-4000-8000-000000000002",
  viewer = "ea100000-0000-4000-8000-000000000003";
const id = (n: number) =>
  `ea200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function as<T>(
  user: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function save(
  data: TyreData,
  n = 1,
  expected: number | null = null,
  user = owner,
  company = org,
) {
  return as(
    user,
    async () =>
      (
        await db.query<{ v: TyreRecord }>(
          "select public.tc_save_tyre($1,$2,$3::jsonb,$4) v",
          [company, id(n), JSON.stringify(data), expected],
        )
      ).rows[0].v,
  );
}
async function page(
  company = org,
  user = owner,
  kind = "tyres",
  after: string | null = null,
  tyre: string | null = null,
) {
  return as(
    user,
    async () =>
      (
        await db.query<{ v: (TyreRecord | TyreHistory)[] }>(
          "select public.tc_tyre_page($1,$2,$3,$4) v",
          [company, kind, after, tyre],
        )
      ).rows[0].v,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [i, u] of [owner, other, viewer].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        u,
        `tyre-${i}@example.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: "Cubiertas ficticias " + i,
            tax_id: "DEMO-TYRE-" + i,
            address: "Direccion ficticia",
            phone: "+1202555010" + i,
            requested_plan: "full",
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
  await db.query(
    "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'viewer','active',$3)",
    [org, viewer, owner],
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "delete from private.company_tyre_history;delete from private.company_tyres;update private.tc_customers set status='trial',module_overrides='{\"maintenance\":true}';update private.tc_modules set enabled=true where id='maintenance';",
  );
});
afterAll(async () => {
  await db?.close();
});
const data = (code = "DEMO-1"): TyreData => ({ ...emptyTyreData, code });
describe("neumáticos PostgreSQL: permisos, versiones e historial", () => {
  it("registra datos desconocidos como null, conserva cero medido y audita sin exponer actor", async () => {
    const r = await save({
      ...data(),
      measuredOn: "2026-01-01",
      treadTenthsMm: 0,
      pressureKpa: 0,
    });
    expect(r.version).toBe(1);
    expect(r.data.installedKm).toBeNull();
    expect(r.data.treadTenthsMm).toBe(0);
    const h = await page(org, owner, "history", null, r.id);
    expect(h).toHaveLength(1);
    expect(h[0]).not.toHaveProperty("actor_id");
    expect(h[0].data).toEqual(r.data);
    expect(
      (
        await db.query<{ actor_id: string }>(
          "select actor_id from private.company_tyre_history",
        )
      ).rows[0].actor_id,
    ).toBe(owner);
  });
  it("rechaza valores manipulados, fechas futuras, mediciones sin fecha y campos económicos", async () => {
    for (const patch of [
      { treadTenthsMm: 10 },
      { treadTenthsMm: -1, measuredOn: "2026-01-01" },
      { pressureKpa: 2001, measuredOn: "2026-01-01" },
      { installedOn: "2099-01-01" },
      { measuredOn: "2099-01-01" },
      { minPressureKpa: 900, maxPressureKpa: 800 },
      { amountCents: 10000 },
      { truckId: false },
    ])
      await expect(save({ ...data(), ...patch } as TyreData)).rejects.toThrow();
    expect(await page()).toEqual([]);
    expect(await page(org, owner, "history")).toEqual([]);
  });
  it("aísla empresas y no permite utilizar un UUID ajeno", async () => {
    await save(data());
    await save(data(), 2, null, other, foreign);
    expect(await page()).toHaveLength(1);
    expect(await page(foreign, other)).toHaveLength(1);
    await expect(page(org, other)).rejects.toThrow();
    await expect(save(data("X"), 3, null, other, org)).rejects.toThrow();
    await expect(page(foreign, owner)).rejects.toThrow();
    await expect(save(data("X"), 1, null, other, foreign)).rejects.toThrow();
  });
  it("permite consulta al visor y deniega escrituras, borrado y manipulación del historial", async () => {
    await save(data());
    expect(await page(org, viewer)).toHaveLength(1);
    expect(await page(org, viewer, "history")).toHaveLength(1);
    await expect(save(data("X"), 2, null, viewer)).rejects.toThrow();
    for (const sql of [
      "delete from private.company_tyres",
      "update private.company_tyre_history set row_version=99",
      "delete from private.company_tyre_history",
      "select private.tc_tyre_audit()",
    ])
      await as(owner, async () => {
        await expect(db.exec(sql)).rejects.toThrow();
      });
    await as(
      null,
      async () => {
        await expect(
          db.query("select public.tc_tyre_page($1)", [org]),
        ).rejects.toThrow();
      },
      "anon",
    );
  });
  it("no duplica revisiones tras respuestas perdidas y conserva versiones ajenas", async () => {
    const first = await save(data());
    expect(await save(data())).toEqual(first);
    const second = await save({ ...data(), notes: "Medición revisada" }, 1, 1);
    expect(second.version).toBe(2);
    expect(await save(second.data, 1, 1)).toEqual(second);
    await expect(
      save({ ...data(), notes: "Cambio obsoleto" }, 1, 1),
    ).rejects.toThrow("Otro dispositivo");
    const h = await page(org, owner, "history");
    expect(h).toHaveLength(2);
    expect(h.map((r) => r.version).sort()).toEqual([1, 2]);
  });
  it("controla códigos y posiciones dentro de empresa, y libera una posición al retirar", async () => {
    const truck = "ea300000-0000-4000-8000-000000000001";
    await db.query(
      "insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on) values($1,$2,'DEMO-001','Ficticio','Demo',2020,1000,'available','2099-01-01')",
      [truck, org],
    );
    const mounted = {
      ...data(),
      status: "mounted" as const,
      truckId: truck,
      position: "Eje 1 izquierda",
    };
    await save(mounted);
    await expect(
      save(
        { ...mounted, code: "DEMO-2", position: "  EJE 1   IZQUIERDA  " },
        2,
      ),
    ).rejects.toThrow();
    await expect(save(data(" demo-1 "), 3)).rejects.toThrow();
    await expect(
      save({ ...mounted, code: "AJENO" }, 4, null, other, foreign),
    ).rejects.toThrow();
    await save(
      { ...mounted, status: "retired", truckId: null, position: "" },
      1,
      1,
    );
    await save({ ...mounted, code: "DEMO-2" }, 2);
    expect(await page()).toHaveLength(2);
    expect(await page(org, owner, "history")).toHaveLength(3);
  });
  it("revalida el módulo, la suspensión y la revocación sin eliminar datos", async () => {
    await save(data());
    await db.exec(
      "update private.tc_modules set enabled=false where id='maintenance'",
    );
    await expect(page()).rejects.toThrow();
    await expect(save(data("X"), 2)).rejects.toThrow();
    await db.exec(
      "update private.tc_modules set enabled=true where id='maintenance'",
    );
    await db.query(
      "update private.tc_customers set status='suspended' where user_id=$1",
      [owner],
    );
    await expect(page()).rejects.toThrow();
    expect(
      (await db.query("select * from private.company_tyres")).rows,
    ).toHaveLength(1);
  });
  it("pagina más de 200 cubiertas y sus revisiones sin truncar ni repetir IDs", async () => {
    for (let n = 1; n <= 205; n++) await save(data("DEMO-" + n), n);
    const first = await page(),
      last = await page(org, owner, "tyres", first.at(-1)!.id);
    expect(first).toHaveLength(200);
    expect(last).toHaveLength(5);
    expect(new Set([...first, ...last].map((r) => r.id)).size).toBe(205);
    expect(await page(org, owner, "tyres", last.at(-1)!.id)).toEqual([]);
    const history = await page(org, owner, "history");
    expect(history).toHaveLength(200);
    expect(await page(org, owner, "history", history.at(-1)!.id)).toHaveLength(
      5,
    );
  }, 20000);
  it("no crea apuntes ni modifica los planes o funciones existentes", async () => {
    const before = await db.query("select * from public.finance_entries");
    const plans = await db.query("select * from private.tc_plans");
    await save(data());
    expect(
      (await db.query("select * from public.finance_entries")).rows,
    ).toEqual(before.rows);
    expect((await db.query("select * from private.tc_plans")).rows).toEqual(
      plans.rows,
    );
    expect(
      (
        await db.query<{ prosecdef: boolean }>(
          "select prosecdef from pg_proc where oid='public.tc_save_tyre(uuid,uuid,jsonb,bigint)'::regprocedure",
        )
      ).rows[0].prosecdef,
    ).toBe(false);
  });
});
