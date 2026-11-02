import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const owner = "c2000000-0000-4000-8000-000000000001",
  other = "c2000000-0000-4000-8000-000000000002";
let org: string, foreign: string;
async function role<T>(name: string, fn: () => Promise<T>) {
  await db.exec("set role " + name);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function reserve(user = owner, company = org, kind = "document") {
  return role(
    "service_role",
    async () =>
      (
        await db.query<{ v: { id: string } | null }>(
          "select public.company_ai_budget_server('reserve',$1::jsonb) v",
          [
            JSON.stringify({
              organization_id: company,
              user_id: user,
              kind,
              model: "gpt-6-luna",
            }),
          ],
        )
      ).rows[0].v,
  );
}
async function settle(id: string, input_tokens: number, output_tokens: number) {
  return role("service_role", () =>
    db.query("select public.company_ai_budget_server('settle',$1::jsonb)", [
      JSON.stringify({ id, input_tokens, output_tokens }),
    ]),
  );
}
async function newInvoice() {
  const doc = crypto.randomUUID();
  const content = doc.replaceAll("-", "").repeat(2);
  return role(
    "service_role",
    async () =>
      (
        await db.query<{ v: { id: string } }>(
          "select public.company_mail_server('record_invoice',$1::jsonb) v",
          [
            JSON.stringify({
              organization_id: org,
              user_id: owner,
              import_source: "email_upload",
              content_hash: content,
              message_id: doc,
              attachment_id: doc,
              document: {
                id: doc,
                name: "Factura ficticia.pdf",
                object_path: org + "/" + doc + "/document.pdf",
                content_type: "application/pdf",
                size_bytes: 100,
              },
            }),
          ],
        )
      ).rows[0].v.id,
  );
}
const fields = {
  supplier: "Proveedor ficticio",
  invoice_number: "DEMO-AI",
  invoice_date: "2026-11-01",
  net_cents: 10000,
  tax_cents: 2100,
  total_cents: 12100,
  currency: "EUR",
  review_note: "Verifica con el original",
};
async function applyInvoice(
  invoice_id: string,
  user_id = owner,
  organization_id = org,
) {
  return role(
    "service_role",
    async () =>
      (
        await db.query<{ v: boolean }>(
          "select public.company_invoice_ai_apply($1::jsonb) v",
          [JSON.stringify({ organization_id, user_id, invoice_id, fields })],
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
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [i, id] of [owner, other].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        id,
        `budget-${i}@example.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: "Presupuesto ficticio " + i,
            tax_id: "DEMO-BUDGET-" + i,
            address: "Dirección de prueba",
            phone: "+3460000010" + i,
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
}, 30000);
beforeEach(async () => {
  // Isolated in-memory fixtures only; never change live settings for a test.
  await db.exec(
    "delete from private.tc_ai_calls;delete from private.tc_ai_monthly_budget;delete from private.tc_document_ai_usage;delete from private.invoice_ai_usage;update private.tc_provider_settings set ai_enabled=true,ai_monthly_budget_cents=200;update private.tc_modules set enabled=true where id in ('gmail','assistant','document_ai','invoice_ai');update private.tc_customers set status='active',paid_plan='full',paid_until=now()+interval '30 days',ai_allowed=true,ai_opt_in=true;",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("presupuesto IA: permisos y cargos desconocidos en PostgreSQL", () => {
  it("las credenciales y la contabilidad interna no son accesibles a clientes", async () => {
    for (const name of ["anon", "authenticated"])
      await role(name, async () => {
        await expect(
          db.query("select public.company_provider_runtime_config('ai')"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.query("select public.company_ai_budget_server('reserve','{}')"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.query("select public.company_invoice_ai_apply('{}')"),
        ).rejects.toThrow("permission denied");
        for (const table of [
          "tc_provider_settings",
          "tc_ai_calls",
          "tc_ai_monthly_budget",
        ])
          await expect(
            db.query("select * from private." + table),
          ).rejects.toThrow("permission denied");
      });
  });
  it("la configuración inicial es cerrada aunque exista una clave; sin presupuesto no reserva", async () => {
    await db.exec(
      "update private.tc_provider_settings set ai_enabled=false,ai_monthly_budget_cents=0",
    );
    expect(await reserve()).toBeNull();
    expect(
      (await db.query("select * from private.tc_ai_calls")).rows,
    ).toHaveLength(0);
  });
  it("un presupuesto global impide que dos empresas lo gasten por separado", async () => {
    expect(await reserve()).not.toBeNull();
    expect(await reserve(other, foreign)).not.toBeNull();
    expect(await reserve()).toBeNull();
    expect(
      (
        await db.query<{ n: number }>(
          "select reserved_micro_usd::integer n from private.tc_ai_monthly_budget",
        )
      ).rows[0].n,
    ).toBe(2000000);
  });
  it("rechaza suplantación de usuario o de empresa y no consume cuota", async () => {
    expect(await reserve(other, org)).toBeNull();
    expect(await reserve(owner, foreign)).toBeNull();
    expect(
      (await db.query("select * from private.tc_document_ai_usage")).rows,
    ).toHaveLength(0);
  });
  it("revalida el consentimiento y los módulos en cada petición", async () => {
    await db.query(
      "update private.tc_customers set ai_opt_in=false where user_id=$1",
      [owner],
    );
    expect(await reserve()).toBeNull();
    await db.query(
      "update private.tc_customers set ai_opt_in=true where user_id=$1",
      [owner],
    );
    await db.exec(
      "update private.tc_modules set enabled=false where id='document_ai'",
    );
    expect(await reserve()).toBeNull();
  });
  it("liquida una sola vez y conserva una reserva cuando falta la respuesta del otro cargo", async () => {
    const first = (await reserve())!,
      second = (await reserve(other, foreign))!;
    await settle(first.id, 1000, 100);
    await settle(first.id, 1000, 100);
    const r = (
      await db.query<{ reserved: number; estimate: number }>(
        "select reserved_micro_usd::integer reserved,estimated_micro_usd::integer estimate from private.tc_ai_monthly_budget",
      )
    ).rows[0];
    expect(r).toEqual({ reserved: 1000000, estimate: 908 });
    expect(await reserve()).toBeNull();
    await settle(second.id, 0, 0);
    expect(await reserve()).not.toBeNull();
  });
  it("no libera dinero para usos negativos, enormes o reservas inexistentes", async () => {
    const r = (await reserve())!;
    await expect(settle(r.id, -1, 10)).rejects.toThrow("Invalid token usage");
    await expect(settle(r.id, 1050001, 10)).rejects.toThrow(
      "Invalid token usage",
    );
    await expect(settle(r.id, 10, 1201)).rejects.toThrow("Invalid token usage");
    expect(
      (
        await db.query<{ n: number }>(
          "select reserved_micro_usd::integer n from private.tc_ai_monthly_budget",
        )
      ).rows[0].n,
    ).toBe(1000000);
  });
  it("conserva el límite anterior de cien consultas por empresa", async () => {
    await db.query(
      "insert into private.tc_document_ai_usage(organization_id,month,calls) values($1,date_trunc('month',now())::date,100)",
      [org],
    );
    expect(await reserve()).toBeNull();
    expect(
      (await db.query("select * from private.tc_ai_calls")).rows,
    ).toHaveLength(0);
  });
  it("dos reservas concurrentes no sobrepasan el límite", async () => {
    await db.exec(
      "update private.tc_provider_settings set ai_monthly_budget_cents=100;set role service_role;",
    );
    try {
      const q = () =>
        db.query<{ v: unknown }>(
          "select public.company_ai_budget_server('reserve',$1::jsonb) v",
          [
            JSON.stringify({
              organization_id: org,
              user_id: owner,
              kind: "document",
              model: "gpt-6-luna",
            }),
          ],
        );
      const r = await Promise.all([q(), q()]);
      expect(r.filter((v) => v.rows[0].v !== null)).toHaveLength(1);
    } finally {
      await db.exec("reset role");
    }
  });
  it("la lectura rellena una factura pendiente solo después de reservar para su empresa y usuario", async () => {
    const invoice_id = await newInvoice();
    expect(await applyInvoice(invoice_id)).toBe(false);
    const data = {
      organization_id: org,
      user_id: owner,
      invoice_id,
      kind: "invoice",
      model: "gpt-6-luna",
    };
    const reservation = await role(
      "service_role",
      async () =>
        (
          await db.query<{ v: { id: string } }>(
            "select public.company_ai_budget_server('reserve',$1::jsonb) v",
            [JSON.stringify(data)],
          )
        ).rows[0].v,
    );
    expect(reservation.id).toBeTruthy();
    expect(await applyInvoice(invoice_id, other, foreign)).toBe(false);
    expect(await applyInvoice(invoice_id)).toBe(true);
    const row = (
      await db.query<{
        status: string;
        total_cents: number;
        finance_entry_id: null;
      }>(
        "select status,total_cents,finance_entry_id from private.invoice_documents where id=$1",
        [invoice_id],
      )
    ).rows[0];
    expect(row).toMatchObject({
      status: "needs_review",
      total_cents: 12100,
      finance_entry_id: null,
    });
    expect(
      (await db.query("select * from public.finance_entries")).rows,
    ).toHaveLength(0);
    const duplicate = await role(
      "service_role",
      async () =>
        (
          await db.query<{ v: unknown }>(
            "select public.company_ai_budget_server('reserve',$1::jsonb) v",
            [JSON.stringify(data)],
          )
        ).rows[0].v,
    );
    expect(duplicate).toBeNull();
  });
  it("la IA no sobrescribe una factura que el cliente ya ha confirmado", async () => {
    const invoice_id = await newInvoice();
    await role("service_role", () =>
      db.query("select public.company_ai_budget_server('reserve',$1::jsonb)", [
        JSON.stringify({
          organization_id: org,
          user_id: owner,
          invoice_id,
          kind: "invoice",
          model: "gpt-6-luna",
        }),
      ]),
    );
    const truck = crypto.randomUUID();
    await db.query(
      "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on) values($1,$2,$3,'Demo','Demo',2026,'2028-01-01')",
      [truck, org, truck.slice(0, 8)],
    );
    await role("authenticated", async () => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        owner,
      ]);
      await db.query("select public.approve_company_invoice($1,$2,$3::jsonb)", [
        org,
        invoice_id,
        JSON.stringify({
          truck_id: truck,
          concept: "Gasto confirmado manualmente",
          date: "2026-11-01",
          net_cents: 20000,
          tax_cents: 4200,
          total_cents: 24200,
          category: "maintenance",
        }),
      ]);
    });
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    expect(await applyInvoice(invoice_id)).toBe(false);
    const rows = (
      await db.query<{ amount_cents: number }>(
        "select amount_cents from public.finance_entries where organization_id=$1",
        [org],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_cents).toBe(20000);
    expect(
      (
        await db.query<{ total_cents: number }>(
          "select total_cents from private.invoice_documents where id=$1",
          [invoice_id],
        )
      ).rows[0].total_cents,
    ).toBe(24200);
  });
});

async function savedState(action: string, data: Record<string, unknown>) {
  return role(
    "service_role",
    async () =>
      (
        await db.query<{ v: unknown }>(
          "select public.company_invoice_ai_server($1,$2::jsonb) v",
          [
            action,
            JSON.stringify({ organization_id: org, user_id: owner, ...data }),
          ],
        )
      ).rows[0].v,
  );
}
describe("preparación de facturas guardadas para una primera lectura IA", () => {
  it("las funciones son invoker, privadas para el backend y no amplían permisos de clientes", async () => {
    const functions = (
      await db.query<{
        definer: boolean;
        anon: boolean;
        client: boolean;
        server: boolean;
      }>(
        "select prosecdef definer,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') client,has_function_privilege('service_role',oid,'execute') server from pg_proc where oid in ('public.company_invoice_ai_server(text,jsonb)'::regprocedure,'private.tc_invoice_ai_server(text,jsonb)'::regprocedure)",
      )
    ).rows;
    expect(functions).toHaveLength(2);
    expect(
      functions.every((f) => !f.definer && !f.anon && !f.client && f.server),
    ).toBe(true);
    for (const name of ["anon", "authenticated"])
      await role(name, async () => {
        await expect(
          db.query("select public.company_invoice_ai_server('prepare','{}')"),
        ).rejects.toThrow(/permission denied/);
      });
  });
  it("solo prepara el original de su empresa sin consumir, modificar ni contabilizar", async () => {
    const invoice_id = await newInvoice();
    const before = (
      await db.query(
        "select to_jsonb(i) v from private.invoice_documents i where id=$1",
        [invoice_id],
      )
    ).rows;
    const financeBefore = (
      await db.query(
        "select to_jsonb(e) v from public.finance_entries e order by id",
      )
    ).rows;
    const prepared = (await savedState("prepare", { invoice_id })) as {
      state: string;
      invoice_id: string;
      document: { object_path: string };
    };
    expect(prepared.state).toBe("available");
    expect(prepared.invoice_id).toBe(invoice_id);
    expect(prepared.document.object_path.startsWith(org + "/")).toBe(true);
    expect(
      (await db.query("select id from private.tc_ai_calls")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select to_jsonb(i) v from private.invoice_documents i where id=$1",
          [invoice_id],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await db.query(
          "select to_jsonb(e) v from public.finance_entries e order by id",
        )
      ).rows,
    ).toEqual(financeBefore);
  });
  it("el estado solo devuelve facturas de su empresa, sin rutas ni contabilidad del proveedor", async () => {
    const invoice_id = await newInvoice();
    const states = await savedState("status", {
      invoice_ids: [invoice_id, crypto.randomUUID()],
    });
    expect(states).toEqual([
      { invoice_id, state: "available", can_analyze: true },
    ]);
    expect(
      await savedState("prepare", { invoice_id: crypto.randomUUID() }),
    ).toBeNull();
    await expect(
      savedState("prepare", { invoice_id, user_id: other }),
    ).rejects.toThrow(/no autorizada/);
    await expect(
      savedState("status", {
        organization_id: foreign,
        invoice_ids: [invoice_id],
      }),
    ).rejects.toThrow(/no autorizada/);
    expect(
      await savedState("status", {
        organization_id: foreign,
        user_id: other,
        invoice_ids: [invoice_id],
      }),
    ).toEqual([]);
  });
  it("un intento reservado o liquidado impide nuevas lecturas y mantiene la reserva incierta", async () => {
    const invoice_id = await newInvoice();
    const args = {
      organization_id: org,
      user_id: owner,
      invoice_id,
      kind: "invoice",
      model: "gpt-6-luna",
    };
    const call = await role(
      "service_role",
      async () =>
        (
          await db.query<{ v: { id: string } }>(
            "select public.company_ai_budget_server('reserve',$1::jsonb) v",
            [JSON.stringify(args)],
          )
        ).rows[0].v,
    );
    expect(call).toBeTruthy();
    expect(await savedState("prepare", { invoice_id })).toEqual({
      state: "attempted",
    });
    expect(await savedState("status", { invoice_ids: [invoice_id] })).toEqual([
      { invoice_id, state: "attempted", can_analyze: false },
    ]);
    await settle(call.id, 1000, 100);
    expect(await savedState("prepare", { invoice_id })).toEqual({
      state: "attempted",
    });
    const repeat = await role(
      "service_role",
      async () =>
        (
          await db.query<{ v: unknown }>(
            "select public.company_ai_budget_server('reserve',$1::jsonb) v",
            [JSON.stringify(args)],
          )
        ).rows[0].v,
    );
    expect(repeat).toBeNull();
    expect(
      (
        await db.query(
          "select id from private.tc_ai_calls where invoice_id=$1",
          [invoice_id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("desactivar consentimiento o el módulo deniega la preparación sin perder el original", async () => {
    const invoice_id = await newInvoice();
    await db.query(
      "update private.tc_customers set ai_opt_in=false where user_id=$1",
      [owner],
    );
    await expect(savedState("prepare", { invoice_id })).rejects.toThrow(
      /no autorizada/,
    );
    expect(await savedState("status", { invoice_ids: [invoice_id] })).toEqual([
      { invoice_id, state: "available", can_analyze: false },
    ]);
    await db.query(
      "update private.tc_customers set ai_opt_in=true where user_id=$1",
      [owner],
    );
    await db.exec(
      "update private.tc_modules set enabled=false where id='gmail'",
    );
    await expect(
      savedState("status", { invoice_ids: [invoice_id] }),
    ).rejects.toThrow(/no autorizada/);
    expect(
      (
        await db.query(
          "select document_id from private.invoice_documents where id=$1",
          [invoice_id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("un usuario de consulta puede ver estados pero no preparar una lectura", async () => {
    const invoice_id = await newInvoice();
    await db.query(
      "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'viewer','active',$3)",
      [org, other, owner],
    );
    try {
      expect(
        await savedState("status", {
          user_id: other,
          invoice_ids: [invoice_id],
        }),
      ).toEqual([{ invoice_id, state: "available", can_analyze: false }]);
      await expect(
        savedState("prepare", { user_id: other, invoice_id }),
      ).rejects.toThrow(/no autorizada/);
    } finally {
      await db.query(
        "delete from private.tc_memberships where organization_id=$1 and user_id=$2",
        [org, other],
      );
    }
  });
  it("limita el lote y distingue archivos de más de 6 MB sin cambiar el límite de subida", async () => {
    const invoice_id = await newInvoice();
    await db.query(
      "update private.company_documents set size_bytes=7*1024*1024 where id=(select document_id from private.invoice_documents where id=$1)",
      [invoice_id],
    );
    expect(await savedState("prepare", { invoice_id })).toEqual({
      state: "too_large",
    });
    expect(await savedState("status", { invoice_ids: [invoice_id] })).toEqual([
      { invoice_id, state: "too_large", can_analyze: false },
    ]);
    await expect(savedState("status", { invoice_ids: [] })).rejects.toThrow(
      /no valida/,
    );
    await expect(
      savedState("status", { invoice_ids: Array(201).fill(invoice_id) }),
    ).rejects.toThrow(/no valida/);
  });
});

describe("factura registrada: protección de la lectura posterior", () => {
  it("la confirmación humana bloquea la lectura y conserva su gasto e importes", async () => {
    const invoice_id = await newInvoice(),
      truck = crypto.randomUUID();
    await db.query(
      "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on) values($1,$2,$3,'Marca ficticia','Modelo de prueba',2026,'2028-01-01')",
      [truck, org, "AI" + truck.slice(0, 8)],
    );
    await role("authenticated", async () => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        owner,
      ]);
      await db.query("select public.approve_company_invoice($1,$2,$3::jsonb)", [
        org,
        invoice_id,
        JSON.stringify({
          truck_id: truck,
          concept: "Factura manual ficticia",
          date: "2026-11-02",
          category: "other",
          net_cents: 10000,
          tax_cents: 2100,
          total_cents: 12100,
        }),
      ]);
    });
    const before = (
      await db.query(
        "select to_jsonb(i) v from private.invoice_documents i where id=$1",
        [invoice_id],
      )
    ).rows;
    expect(await savedState("prepare", { invoice_id })).toEqual({
      state: "approved",
    });
    expect(await savedState("status", { invoice_ids: [invoice_id] })).toEqual([
      { invoice_id, state: "approved", can_analyze: false },
    ]);
    expect(
      (
        await db.query(
          "select to_jsonb(i) v from private.invoice_documents i where id=$1",
          [invoice_id],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await db.query(
          "select amount_cents,payment_status from public.finance_entries where truck_id=$1",
          [truck],
        )
      ).rows,
    ).toEqual([{ amount_cents: 10000, payment_status: "pending" }]);
    expect(
      (
        await db.query(
          "select id from private.tc_ai_calls where invoice_id=$1",
          [invoice_id],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
