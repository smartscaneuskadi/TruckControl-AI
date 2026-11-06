import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { copilotActionSchema, copilotTurnSchema } from "../src/domain/copilot";
import type { CopilotAction, CopilotTurn } from "../src/domain/copilot";
let db: PGlite, org: string, foreign: string;
const owner = "fc110000-0000-4000-8000-000000000001",
  other = "fc110000-0000-4000-8000-000000000002",
  member = "fc110000-0000-4000-8000-000000000003";
const truck = "fc120000-0000-4000-8000-000000000001",
  foreignTruck = "fc120000-0000-4000-8000-000000000002";
const truckFields = {
  plate: "1234-ABC",
  brand: "Scania",
  model: "R ficticio",
  year: 2020,
  odometerKm: 180000,
  status: "available",
  driverId: null,
  inspectionDueOn: "2027-01-20",
  route: "",
};
const customer = {
  name: "Cliente ficticio",
  taxId: "DEMO-NO-FISCAL",
  email: "",
  phone: "",
  address: "Dirección ficticia",
  notes: "",
};
async function as<T>(
  actor: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor ?? "",
  ]);
  await db.exec("savepoint operation");
  try {
    return await fn();
  } catch (e) {
    await db.exec("rollback to savepoint operation");
    throw e;
  } finally {
    await db.exec("release savepoint operation;reset role");
  }
}
async function control<T = unknown>(
  action: string,
  data: unknown = {},
  company = org,
  actor: string | null = owner,
  role = "authenticated",
): Promise<T> {
  return as(
    actor,
    async () =>
      (
        await db.query<{ v: T }>(
          "select public.tc_company_copilot($1,$2,$3::jsonb) v",
          [company, action, JSON.stringify(data)],
        )
      ).rows[0].v,
    role,
  );
}
async function server(
  action: string,
  data: unknown,
  company = org,
  actor = owner,
  role = "service_role",
) {
  return as(
    actor,
    async () =>
      (
        await db.query<{ v: CopilotTurn & { started?: boolean } }>(
          "select public.company_copilot_server($1,$2,$3,$4::jsonb) v",
          [company, actor, action, JSON.stringify(data)],
        )
      ).rows[0].v,
    role,
  );
}
async function proposal(
  entity = "customers",
  fields: Record<string, unknown> = customer,
  mode = "create",
  record: string | null = null,
  expected: number | null = null,
) {
  const request = randomUUID();
  await server("begin", { request_id: request });
  return (
    await server("finish", {
      request_id: request,
      reply: "Propuesta ficticia para revisar.",
      items: [
        { entity, mode, record_id: record, expected_version: expected, fields },
      ],
    })
  ).actions[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
    create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const name of readdirSync("supabase/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  for (const [i, id] of [owner, other, member].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        id,
        `copilot-${i}@example.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Copilot ficticia ${i}`,
            tax_id: `DEMO-COPILOT-${i}`,
            address: "Dirección ficticia",
            phone: `+1202555010${i}`,
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
    "update private.tc_settings set enforce_access=true,sms_ready=false;update private.tc_modules set enabled=true;update private.tc_provider_settings set ai_enabled=true,ai_monthly_budget_cents=1000;update private.tc_customers set status='trial',trial_started_at=now(),trial_ends_at=now()+interval '10 days',trial_plan_id='full',ai_allowed=true,ai_opt_in=true",
  );
  await db.query(
    "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'admin','active',$3)",
    [org, member, owner],
  );
  await db.exec("begin");
  for (const [actor, company, id, plate] of [
    [owner, org, truck, "DEMO-COP-1"],
    [other, foreign, foreignTruck, "DEMO-COP-2"],
  ])
    await as(actor, () =>
      db.query(
        "insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values($1,$2,$3,'Scania','Ficticio',2020,100000,'available','2027-01-20','')",
        [id, company, plate],
      ),
    );
  await db.exec("commit");
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("reset role;rollback");
});
afterAll(async () => {
  await db?.close();
});
describe("asistente conversacional con tareas bajo control de empresa", () => {
  it("rechaza valores anidados que aparentan texto y no prepara datos incompatibles con los formularios", async () => {
    await expect(
      proposal("customers", {
        ...customer,
        name: { injected: "texto no autorizado" },
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      proposal("customers", { ...customer, phone: ["no es texto"] }),
    ).rejects.toMatchObject({ code: "23514" });
  });
  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["truck", truckFields, { odometerKm: 180100 }],
    [
      "driver",
      {
        name: "Conductor ficticio",
        email: "",
        phone: "",
        license: "C+E",
        licenseExpiresOn: "2027-02-20",
        status: "active",
      },
      { phone: "+12025550199" },
    ],
    [
      "income",
      {
        truckId: truck,
        concept: "Transporte ficticio",
        date: "2026-11-06",
        amountCents: 55000,
        category: "transport",
        paymentStatus: "pending",
        distanceKm: 300,
      },
      { paymentStatus: "paid" },
    ],
    [
      "expense",
      {
        truckId: truck,
        concept: "Peaje ficticio",
        date: "2026-11-06",
        amountCents: 1575,
        category: "tolls",
        paymentStatus: "paid",
        distanceKm: 0,
      },
      { concept: "Peaje ficticio revisado" },
    ],
    [
      "trailers",
      {
        plate: "R-DEMO-COP",
        type: "tautliner",
        status: "available",
        capacityKg: 24000,
        inspectionDueOn: "2027-01-20",
        insuranceDueOn: "2027-02-20",
        notes: "",
      },
      { capacityKg: 20000 },
    ],
    ["customers", customer, { phone: "+12025550199" }],
    [
      "trips",
      {
        reference: "DEMO-COP-1",
        truckId: truck,
        customerId: null,
        driverId: null,
        trailerId: null,
        origin: "Bilbao",
        destination: "Madrid",
        startOn: "2026-11-06",
        endOn: null,
        status: "planned",
        distanceKm: 400,
        amountCents: 120000,
        notes: "",
      },
      { notes: "Carga ficticia confirmada" },
    ],
    [
      "maintenance",
      {
        truckId: truck,
        type: "preventive",
        description: "Revisión ficticia",
        scheduledOn: "2026-11-10",
        completedOn: null,
        status: "planned",
        odometerKm: 100000,
        nextDueKm: null,
        nextDueOn: null,
        amountCents: 20000,
        supplier: "Taller ficticio",
        notes: "",
      },
      { notes: "Confirmado" },
    ],
    [
      "fuel",
      {
        truckId: truck,
        driverId: null,
        date: "2026-11-06",
        odometerKm: 100000,
        millilitres: 120000,
        amountCents: 16500,
        station: "Estación ficticia",
        fullTank: true,
        notes: "",
      },
      { notes: "Repostaje revisado" },
    ],
    [
      "deadlines",
      {
        title: "Permiso ficticio",
        category: "permit",
        truckId: truck,
        driverId: null,
        trailerId: null,
        dueOn: "2027-01-20",
        remindDays: 30,
        status: "active",
        notes: "",
      },
      { remindDays: 45 },
    ],
    [
      "alerts",
      {
        title: "Aviso ficticio",
        dueOn: "2026-11-10",
        truckId: truck,
        priority: "normal",
        status: "open",
        sourceKey: "",
        notes: "",
      },
      { priority: "urgent" },
    ],
  ];
  it.each(cases)(
    "crea y actualiza %s con confirmación, versión y relaciones existentes",
    async (entity, fields, patch) => {
      const task = await proposal(entity, fields);
      const saved = await control<CopilotAction>("execute", { id: task.id });
      expect(copilotActionSchema.safeParse(saved).success).toBe(true);
      const context = await control<{
        entities: Record<
          string,
          {
            items: {
              id: string;
              version: number;
              fields: Record<string, unknown>;
            }[];
          }
        >;
      }>("context", { query: "ficticio" });
      const record = context.entities[entity].items.find(
        (r) => r.id === saved.record_id,
      )!;
      expect(record.fields).toMatchObject(fields);
      const update = await proposal(
        entity,
        patch,
        "update",
        saved.record_id,
        record.version,
      );
      expect(update.previous).toMatchObject(fields);
      const changed = await control<CopilotAction>("execute", {
        id: update.id,
      });
      expect(changed.state).toBe("applied");
      expect(changed.fields).toMatchObject(patch);
      expect(copilotActionSchema.safeParse(changed).success).toBe(true);
    },
  );
  it("comprueba permisos y entrega contexto de la empresa sin otras empresas", async () => {
    expect(await control("status")).toMatchObject({
      schema_version: 1,
      organization_id: org,
      allowed: true,
      can_write: true,
    });
    const context = await control<{
      organization_id: string;
      entities: Record<string, { items: { id: string }[] }>;
    }>("context", { query: "¿Qué camiones hay?" });
    expect(context.organization_id).toBe(org);
    expect(context.entities.truck.items.map((t) => t.id)).toEqual([truck]);
    expect(JSON.stringify(context)).not.toContain(foreignTruck);
  });
  it("una propuesta guarda datos privados sin ejecutar el alta hasta confirmar", async () => {
    const task = await proposal();
    expect(copilotActionSchema.safeParse(task).success).toBe(true);
    expect(
      (
        await db.query("select id from private.fleet_records where id=$1", [
          task.record_id,
        ])
      ).rows,
    ).toHaveLength(0);
    const applied = await control<CopilotAction>("execute", { id: task.id });
    expect(applied.state).toBe("applied");
    expect(
      (
        await db.query(
          "select payload from private.fleet_records where id=$1",
          [task.record_id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(await control("execute", { id: task.id })).toEqual(applied);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from private.tc_admin_audit where action='copilot_task_apply'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("no permite consultar ni ejecutar tareas de otra empresa o de otro usuario", async () => {
    const task = await proposal();
    await expect(
      control("context", { query: "todo" }, foreign),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      control("execute", { id: task.id }, foreign, other),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      control("task", { id: task.id }, org, member),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("exige la identidad verificada, consentimiento y módulo IA actual", async () => {
    await db.query(
      "update private.tc_customers set ai_opt_in=false where user_id=$1",
      [owner],
    );
    expect(await control("status")).toMatchObject({ allowed: false });
    await expect(control("context", { query: "todo" })).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      server("begin", { request_id: randomUUID() }),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("los clientes no pueden fingir respuestas del modelo ni editar el ledger privado", async () => {
    await expect(
      server(
        "begin",
        { request_id: randomUUID() },
        org,
        owner,
        "authenticated",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      as(owner, () => db.query("select * from private.tc_copilot_actions")),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      as(owner, () =>
        db.query("update private.tc_copilot_actions set state='applied'"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      control("status", {}, org, null, "anon"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("un turno repetido no duplica propuestas y su respuesta no ejecuta registros", async () => {
    const id = randomUUID();
    expect(await server("begin", { request_id: id })).toEqual({
      started: true,
    });
    expect(await server("begin", { request_id: id })).toMatchObject({
      state: "pending",
      actions: [],
    });
    const input = {
      request_id: id,
      reply: "Borrador para revisar",
      items: [
        {
          entity: "customers",
          mode: "create",
          record_id: null,
          expected_version: null,
          fields: customer,
        },
      ],
    };
    const turn = await server("finish", input);
    expect(copilotTurnSchema.safeParse(turn).success).toBe(true);
    expect(await server("finish", input)).toEqual(turn);
    expect(await server("begin", { request_id: id })).toEqual(turn);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from private.tc_copilot_actions",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query("select id from private.fleet_records where id=$1", [
          turn.actions[0].record_id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("rechaza lotes parciales, campos protegidos y acciones fuera del catálogo sin guardar ninguna", async () => {
    const id = randomUUID();
    await server("begin", { request_id: id });
    await expect(
      server("finish", {
        request_id: id,
        reply: "No válido",
        items: [
          {
            entity: "customers",
            mode: "create",
            record_id: null,
            expected_version: null,
            fields: customer,
          },
          {
            entity: "customers",
            mode: "create",
            record_id: null,
            expected_version: null,
            fields: { ...customer, organization_id: foreign },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (await db.query("select id from private.tc_copilot_actions")).rows,
    ).toHaveLength(0);
    await expect(proposal("invoice", customer)).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("rechaza enlaces a camiones ajenos antes de preparar una tarea", async () => {
    await expect(
      proposal("expense", {
        truckId: foreignTruck,
        concept: "Peaje ficticio",
        date: "2026-11-06",
        amountCents: 1000,
        category: "tolls",
        paymentStatus: "pending",
        distanceKm: 0,
      }),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      proposal("truck", { ...truckFields, driverId: other }),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("cancelar y repetir una cancelación conserva los registros y bloquea la ejecución", async () => {
    const task = await proposal();
    expect(await control("cancel", { id: task.id })).toMatchObject({
      state: "cancelled",
    });
    expect(await control("cancel", { id: task.id })).toMatchObject({
      state: "cancelled",
    });
    await expect(control("execute", { id: task.id })).rejects.toMatchObject({
      code: "40001",
    });
    expect(
      (
        await db.query("select id from private.fleet_records where id=$1", [
          task.record_id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("el plazo caducado bloquea la escritura", async () => {
    const task = await proposal();
    await db.query(
      "update private.tc_copilot_actions set expires_at=now()-interval '1 second' where id=$1",
      [task.id],
    );
    await expect(control("execute", { id: task.id })).rejects.toMatchObject({
      code: "40001",
    });
    expect(await control("list")).toMatchObject({ actions: [] });
  });
  it("una edición de otro dispositivo impide sobrescribir con un borrador antiguo", async () => {
    const task = await proposal(
      "truck",
      { route: "Ruta propuesta" },
      "update",
      truck,
      1,
    );
    await as(owner, () =>
      db.query(
        "update public.trucks set route='Cambio real posterior' where id=$1",
        [truck],
      ),
    );
    await expect(control("execute", { id: task.id })).rejects.toMatchObject({
      code: "40001",
    });
    expect(
      (
        await db.query<{ route: string }>(
          "select route from public.trucks where id=$1",
          [truck],
        )
      ).rows[0].route,
    ).toBe("Cambio real posterior");
  });
  it("retirar el módulo bloquea propuestas, contexto y confirmaciones y oculta resultados anteriores", async () => {
    const task = await proposal();
    const turn = (
      await db.query<{ turn_id: string }>(
        "select turn_id from private.tc_copilot_actions where id=$1",
        [task.id],
      )
    ).rows[0].turn_id;
    await db.query(
      "update private.tc_customers set module_overrides=module_overrides||'{\"customers\":false}' where user_id=$1",
      [owner],
    );
    await expect(control("execute", { id: task.id })).rejects.toMatchObject({
      code: "42501",
    });
    await expect(control("result", { request_id: turn })).rejects.toMatchObject(
      { code: "42501" },
    );
    expect(await control("list")).toMatchObject({ actions: [] });
    const ctx = await control<{ entities: Record<string, unknown> }>(
      "context",
      { query: "clientes" },
    );
    expect(ctx.entities.customers).toMatchObject({
      allowed: false,
      total: 0,
      items: [],
    });
  });
  it("usuarios de consulta pueden preguntar pero no preparar ni ejecutar cambios", async () => {
    await db.query(
      "update private.tc_memberships set role='viewer' where organization_id=$1 and user_id=$2",
      [org, member],
    );
    expect(await control("status", {}, org, member)).toMatchObject({
      can_write: false,
      allowed: true,
    });
    const id = randomUUID();
    await server("begin", { request_id: id }, org, member);
    await expect(
      server(
        "finish",
        {
          request_id: id,
          reply: "No autorizado",
          items: [
            {
              entity: "customers",
              mode: "create",
              record_id: null,
              expected_version: null,
              fields: customer,
            },
          ],
        },
        org,
        member,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it.each(["banned", "deleted", "unverified"])(
    "rechaza al actor %s aunque conserve un JWT antiguo",
    async (state) => {
      await db.query(
        state === "banned"
          ? "update auth.users set banned_until=now()+interval '1 day' where id=$1"
          : state === "deleted"
            ? "update auth.users set deleted_at=now() where id=$1"
            : "update auth.users set email_confirmed_at=null where id=$1",
        [owner],
      );
      await expect(control("status")).rejects.toMatchObject({ code: "42501" });
    },
  );
  it("revoca una sesión concreta sin depender de la caducidad del token", async () => {
    const id = randomUUID();
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ session_id: id }),
    ]);
    await expect(control("status")).rejects.toMatchObject({ code: "42501" });
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      id,
      owner,
    ]);
    expect(await control("status")).toMatchObject({ allowed: true });
    await db.query("delete from auth.sessions where id=$1", [id]);
    await expect(control("status")).rejects.toMatchObject({ code: "42501" });
  });
  it("limita las consultas por minuto y permite consultar un request_id existente sin duplicarlo", async () => {
    let first = "";
    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      if (i === 0) first = id;
      await server("begin", { request_id: id });
    }
    await expect(
      server("begin", { request_id: randomUUID() }),
    ).rejects.toMatchObject({ code: "54000" });
    expect(await server("begin", { request_id: first })).toMatchObject({
      state: "pending",
    });
  });
  it("el apagado global de IA bloquea el chat y las tareas pendientes en servidor", async () => {
    const task = await proposal();
    await db.exec("update private.tc_provider_settings set ai_enabled=false");
    await expect(control("execute", { id: task.id })).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      server("begin", { request_id: randomUUID() }),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("el copiloto conserva el límite real de 50 camiones sin modificarlo", async () => {
    await db.exec("update private.tc_plans set max_trucks=50 where id='full'");
    for (let i = 0; i < 49; i++)
      await as(owner, () =>
        db.query(
          "insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values($1,$2,$3,'MAN','Ficticio',2020,0,'available','2027-01-20','')",
          [randomUUID(), org, `DEMO-Q-${i}`],
        ),
      );
    const task = await proposal("truck", truckFields);
    await expect(control("execute", { id: task.id })).rejects.toThrow();
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trucks where organization_id=$1",
          [org],
        )
      ).rows[0].n,
    ).toBe(50);
  });
  it("un apunte vinculado a una operación contabilizada no se reescribe desde el chat", async () => {
    const fields = {
      truckId: truck,
      type: "preventive",
      description: "Revisión ficticia",
      scheduledOn: "2026-11-06",
      completedOn: "2026-11-06",
      status: "completed",
      odometerKm: 100000,
      nextDueKm: null,
      nextDueOn: null,
      amountCents: 20000,
      supplier: "Taller ficticio",
      notes: "",
    };
    const task = await proposal("maintenance", fields);
    await control("execute", { id: task.id });
    const booked = await as(
      owner,
      async () =>
        (
          await db.query<{ v: { entry_id: string } }>(
            "select public.tc_book_record($1,$2,1) v",
            [org, task.record_id],
          )
        ).rows[0].v,
    );
    const expense = booked.entry_id;
    const changed = await proposal(
      "expense",
      { amountCents: 100 },
      "update",
      expense,
      1,
    );
    await expect(control("execute", { id: changed.id })).rejects.toMatchObject({
      code: "23514",
    });
    expect(
      (
        await db.query<{ amount_cents: number }>(
          "select amount_cents from public.finance_entries where id=$1",
          [expense],
        )
      ).rows[0].amount_cents,
    ).toBe(20000);
  });
  it("los totales financieros provienen de todos los apuntes autorizados y marcan los listados parciales", async () => {
    for (let i = 0; i < 25; i++)
      await as(owner, () =>
        db.query(
          "insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values($1,$2,$3,'income','Ficticio',current_date,100,'transport','pending',10)",
          [randomUUID(), org, truck],
        ),
      );
    const c = await control<{
      entities: Record<
        string,
        { total: number; partial: boolean; items: unknown[] }
      >;
      monthly_eur: {
        incomeCents: number;
        profitCents: number;
        distanceKm: number;
      }[];
    }>("context", { query: "resumen" });
    expect(c.entities.income).toMatchObject({ total: 25, partial: true });
    expect(c.entities.income.items).toHaveLength(20);
    expect(c.monthly_eur).toEqual([
      expect.objectContaining({
        incomeCents: 2500,
        profitCents: 2500,
        distanceKm: 250,
      }),
    ]);
  });
  it("sin gastos autorizados no devuelve importes ni beneficios inferidos", async () => {
    await as(owner, () =>
      db.query(
        "insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values($1,$2,$3,'income','Ficticio',current_date,100,'transport','pending',0)",
        [randomUUID(), org, truck],
      ),
    );
    await db.query(
      "update private.tc_customers set module_overrides=module_overrides||'{\"expenses\":false}' where user_id=$1",
      [owner],
    );
    const c = await control<{
      monthly_eur: { expenseCents: null; profitCents: null }[];
      entities: Record<string, unknown>;
    }>("context", { query: "beneficio" });
    expect(c.monthly_eur[0]).toMatchObject({
      expenseCents: null,
      profitCents: null,
    });
    expect(c.entities.expense).toMatchObject({ allowed: false, items: [] });
  });
});
