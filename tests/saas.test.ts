import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;
const admin = "10000000-0000-4000-8000-000000000051",
  clientA = "10000000-0000-4000-8000-000000000052",
  clientB = "10000000-0000-4000-8000-000000000053";
let orgA: string, orgB: string;
const metadata = (suffix: string) => ({
  truckcontrol_registration: {
    contact_name: `Persona ficticia ${suffix}`,
    company_name: `Transporte ficticio ${suffix}`,
    tax_id: `DEMO-${suffix}`,
    address: "Dirección ficticia 10",
    phone: `+3460000000${suffix}`,
    requested_plan: "limited",
  },
  role: "admin",
  trial_days: 9999,
  paid_plan: "full",
});
async function as<T>(
  id: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc<T = Record<string, unknown>>(
  name: string,
  args: unknown[] = [],
) {
  const r = await db.query<{ v: T }>(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as v`,
    args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
  );
  return r.rows[0].v;
}
const adminCall = (action: string, data: Record<string, unknown> = {}) =>
  rpc("tc_admin_control", [action, data]);
async function currentAccess(id = clientA) {
  return as(id, () =>
    rpc<{
      active: boolean;
      is_admin: boolean;
      plan: string;
      max_trucks: number | null;
      features: Record<string, boolean>;
      profile: {
        trial_started_at: string;
        trial_ends_at: string;
        status: string;
      };
    }>("tc_my_access"),
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
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,sms_ready=true",
  );
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'pedidos@smartscaneuskadi.com',now())",
    [admin],
  );
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,'client-a@example.com',$2),($3,'client-b@example.com',$4)",
    [clientA, metadata("1"), clientB, metadata("2")],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("plataforma SaaS, prueba y administración", () => {
  it("muestra ofertas sin exponer clientes ni permitir cobros de ejemplo", async () => {
    const catalog = await as(
      null,
      () =>
        rpc<{
          trial_days: number;
          prices_are_examples: boolean;
          payments_enabled: boolean;
          plans: { monthly_cents: number }[];
        }>("tc_public_catalog"),
      "anon",
    );
    expect(catalog.trial_days).toBe(10);
    expect(catalog.prices_are_examples).toBe(false);
    expect(catalog.payments_enabled).toBe(false);
    expect(catalog.plans.map((p) => p.monthly_cents)).toEqual([30000, 70000]);
    await as(
      null,
      () =>
        expect(db.query("select * from private.tc_customers")).rejects.toThrow(
          "permission denied",
        ),
      "anon",
    );
  });
  it("no activa una empresa con correo sin confirmar ni solo con correo confirmado", async () => {
    expect(
      (await db.query("select * from private.tc_customers")).rows,
    ).toHaveLength(0);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [clientA],
    );
    expect(
      (await db.query("select * from public.organizations")).rows,
    ).toHaveLength(0);
    const access = await currentAccess();
    expect(access.active).toBe(false);
    expect(access.is_admin).toBe(false);
  });
  it("crea automáticamente empresa y diez días Full tras confirmar ambos canales", async () => {
    await db.query(
      "update auth.users set phone='34600000001',phone_confirmed_at=now() where id=$1",
      [clientA],
    );
    await db.query(
      "update auth.users set email_confirmed_at=now(),phone='34600000002',phone_confirmed_at=now() where id=$1",
      [clientB],
    );
    orgA = (
      await db.query<{ id: string }>(
        "select id from public.organizations where owner_id=$1",
        [clientA],
      )
    ).rows[0].id;
    orgB = (
      await db.query<{ id: string }>(
        "select id from public.organizations where owner_id=$1",
        [clientB],
      )
    ).rows[0].id;
    const access = await currentAccess();
    expect(access.active).toBe(true);
    expect(access.plan).toBe("full");
    expect(access.features.gmail).toBe(true);
    expect(access.features.documents).toBe(true);
    expect(access.features.invoice_ai).toBe(false);
    expect(
      Date.parse(access.profile.trial_ends_at) -
        Date.parse(access.profile.trial_started_at),
    ).toBe(10 * 86400000);
  });
  it("reserva administración al correo confirmado y no a metadatos de registro", async () => {
    expect((await currentAccess(admin)).is_admin).toBe(true);
    expect((await currentAccess()).is_admin).toBe(false);
    await as(clientA, () =>
      expect(adminCall("snapshot")).rejects.toThrow(
        "Solo la cuenta administradora",
      ),
    );
    await as(clientA, () =>
      expect(db.query("select * from private.tc_admins")).rejects.toThrow(
        "permission denied",
      ),
    );
    await as(clientA, () =>
      expect(
        db.query("select private.tc_user_access($1)", [clientB]),
      ).rejects.toThrow("permission denied"),
    );
  });
  it("no reinicia la prueba al editar metadatos, repetir registro o crear otra empresa", async () => {
    const before = await currentAccess();
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
      {
        ...metadata("1"),
        trial_started_at: "2099-01-01",
        paid_until: "2099-01-01",
        is_admin: true,
      },
      clientA,
    ]);
    await as(clientA, () => rpc("tc_finish_registration"));
    await as(clientA, () =>
      db.query(
        "insert into public.organizations(owner_id,name) values($1,'Otra empresa ficticia')",
        [clientA],
      ),
    );
    const after = await currentAccess();
    expect(after.profile.trial_ends_at).toBe(before.profile.trial_ends_at);
    expect(after.is_admin).toBe(false);
  });
  it("aplica permiso IA global, por usuario y consentimiento de forma conjunta", async () => {
    await as(admin, () =>
      adminCall("customer", { user_id: clientA, ai_allowed: true }),
    );
    await as(clientA, () => rpc("tc_set_ai_opt_in", [true]));
    expect((await currentAccess()).features.invoice_ai).toBe(false);
    await as(admin, () =>
      adminCall("module", { id: "invoice_ai", enabled: true }),
    );
    expect((await currentAccess()).features.invoice_ai).toBe(true);
    expect((await currentAccess(clientB)).features.invoice_ai).toBe(false);
    await as(clientA, () => rpc("tc_set_ai_opt_in", [false]));
    expect((await currentAccess()).features.invoice_ai).toBe(false);
    await as(clientA, () => rpc("tc_set_ai_opt_in", [true]));
    await as(admin, () =>
      adminCall("customer", { user_id: clientA, ai_allowed: false }),
    );
    expect((await currentAccess()).features.invoice_ai).toBe(false);
  });
  it("bloquea módulos en escrituras SQL y conserva el aislamiento entre empresas", async () => {
    await as(admin, () =>
      adminCall("customer", {
        user_id: clientA,
        module_overrides: { trucks: false },
      }),
    );
    const insert = (org: string, plate: string) =>
      db.query(
        "insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on) values($1,$2,'Demo','Demo',2026,'2028-01-01')",
        [org, plate],
      );
    await as(clientA, () =>
      expect(insert(orgA, "1111 TST")).rejects.toThrow("módulo"),
    );
    await as(clientB, async () => {
      await insert(orgB, "2222 TST");
      await expect(insert(orgA, "3333 TST")).rejects.toThrow(
        "row-level security",
      );
    });
    await as(admin, () =>
      adminCall("customer", { user_id: clientA, module_overrides: {} }),
    );
    await as(clientA, () => insert(orgA, "1111 TST"));
    await as(clientA, () =>
      expect(db.query("select * from public.trucks")).resolves.toMatchObject({
        rows: [{ plate: "1111 TST" }],
      }),
    );
  });
  it("desactiva globalmente un módulo incluso con permiso individual habilitado", async () => {
    await as(admin, () =>
      adminCall("customer", {
        user_id: clientA,
        module_overrides: { documents: true },
      }),
    );
    await as(admin, () =>
      adminCall("module", { id: "documents", enabled: false }),
    );
    expect((await currentAccess()).features.documents).toBe(false);
    await as(admin, () =>
      adminCall("module", { id: "documents", enabled: true }),
    );
    expect((await currentAccess()).features.documents).toBe(true);
  });
  it("suspende y reactiva sin modificar la fecha de prueba", async () => {
    const before = await currentAccess();
    await as(admin, () =>
      adminCall("customer", { user_id: clientA, suspended: true }),
    );
    expect((await currentAccess()).active).toBe(false);
    await as(clientA, () =>
      expect(db.query("select * from public.trucks")).resolves.toMatchObject({
        rows: [],
      }),
    );
    await as(admin, () =>
      adminCall("customer", { user_id: clientA, suspended: false }),
    );
    const after = await currentAccess();
    expect(after.active).toBe(true);
    expect(after.profile.trial_ends_at).toBe(before.profile.trial_ends_at);
  });
  it("impide acceder al finalizar diez días aunque el cliente manipule sus metadatos", async () => {
    await db.query(
      "update private.tc_customers set trial_started_at=now()-interval '11 days',trial_ends_at=now()-interval '1 day' where user_id=$1",
      [clientA],
    );
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
      { ...metadata("1"), trial_ends_at: "2099-01-01" },
      clientA,
    ]);
    expect((await currentAccess()).active).toBe(false);
    await as(clientA, () =>
      expect(db.query("select * from public.trucks")).resolves.toMatchObject({
        rows: [],
      }),
    );
  });
  it("permite elegir plan tras expirar, congela precio y no activa por una solicitud", async () => {
    const id = await as(clientA, () =>
      rpc<string>("tc_request_plan", ["limited"]),
    );
    expect(
      await as(clientA, () => rpc<string>("tc_request_plan", ["limited"])),
    ).toBe(id);
    const row = (
      await db.query<{ quoted_cents: number }>(
        "select quoted_cents,net_cents,vat_rate_bps,vat_cents from private.tc_payment_requests where id=$1",
        [id],
      )
    ).rows[0];
    expect(row.quoted_cents).toBe(36300);
    expect(row).toMatchObject({
      net_cents: 30000,
      vat_rate_bps: 2100,
      vat_cents: 6300,
    });
    expect((await currentAccess()).active).toBe(false);
    await as(clientA, () =>
      expect(
        rpc("tc_platform_server", ["payment_event", { user_id: clientA }]),
      ).rejects.toThrow("permission denied"),
    );
  });
  it("edita precios solo con el administrador y evita habilitar cobros de ejemplo", async () => {
    await as(clientA, () =>
      expect(
        adminCall("plan", { id: "full", monthly_cents: 1 }),
      ).rejects.toThrow("Solo"),
    );
    await as(admin, () => adminCall("settings", { prices_are_examples: true }));
    await as(admin, () =>
      expect(adminCall("settings", { payments_enabled: true })).rejects.toThrow(
        "Confirma los precios",
      ),
    );
    await as(admin, () =>
      adminCall("plan", {
        id: "limited",
        name: "Limitado Demo",
        monthly_cents: 35000,
        max_trucks: 1,
        modules: {
          dashboard: true,
          trucks: true,
          drivers: true,
          income: true,
          expenses: true,
          profitability: true,
          documents: false,
          gmail: false,
          assistant: false,
          invoice_ai: false,
        },
        published: true,
      }),
    );
    const catalog = await as(
      null,
      () => rpc<{ plans: { monthly_cents: number }[] }>("tc_public_catalog"),
      "anon",
    );
    expect(catalog.plans[0].monthly_cents).toBe(35000);
  });
  it("confirma un pago una sola vez y aplica las restricciones del plan elegido", async () => {
    const requestId = await as(clientA, () =>
      rpc<string>("tc_request_plan", ["limited"]),
    );
    await as(admin, () =>
      adminCall("settings", { prices_are_examples: false }),
    );
    await as(admin, () =>
      adminCall("manual_payment", {
        request_id: requestId,
        receipt: "Transferencia ficticia TEST-1",
      }),
    );
    const before = (
      await db.query<{ paid_until: string }>(
        "select paid_until from private.tc_customers where user_id=$1",
        [clientA],
      )
    ).rows[0].paid_until;
    await as(admin, () =>
      adminCall("manual_payment", {
        request_id: requestId,
        receipt: "Transferencia ficticia TEST-1",
      }),
    );
    expect(
      (
        await db.query<{ paid_until: string }>(
          "select paid_until from private.tc_customers where user_id=$1",
          [clientA],
        )
      ).rows[0].paid_until,
    ).toEqual(before);
    const access = await currentAccess();
    expect(access.active).toBe(true);
    expect(access.plan).toBe("limited");
    expect(access.features.gmail).toBe(false);
    expect(access.max_trucks).toBe(1);
    await as(clientA, () =>
      expect(
        db.query(
          "insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on) values($1,'9999 TST','Demo','Demo',2026,'2028-01-01')",
          [orgA],
        ),
      ).rejects.toThrow("límite"),
    );
  });
  it("registra actividad administrativa y no expone auditoría a los clientes", async () => {
    const snapshot = await as(admin, () => adminCall("snapshot"));
    expect(Array.isArray(snapshot.audit)).toBe(true);
    expect((snapshot.audit as unknown[]).length).toBeGreaterThan(0);
    await as(clientB, () =>
      expect(db.query("select * from private.tc_admin_audit")).rejects.toThrow(
        "permission denied",
      ),
    );
  });
});
