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
import { readFileSync, readdirSync } from "node:fs";
import { z } from "zod";
import {
  bindFixtureActor,
  installAuthSessionFixture,
  seedFixtureSessions,
} from "./helpers/auth-session-fixture";

let db: PGlite, org: string, otherOrg: string;
const uid = (n: number) =>
  `ba210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = (kind: number, n: number) =>
  `ba${kind}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tracking = {
  category: "other",
  status: "active",
  expires_on: null,
  remind_days: 30,
};
async function actor<T>(
  n: number | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec("savepoint billing_actor");
  try {
    await db.exec(`set role ${role}`);
    await bindFixtureActor(db, n === null ? null : uid(n));
    return await fn();
  } catch (error) {
    await db.exec("rollback to savepoint billing_actor");
    throw error;
  } finally {
    await db.exec("reset role;release savepoint billing_actor");
  }
}
async function value<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<{ v: T }>(sql, args)).rows[0].v;
}
async function page(n = 1, legacy = false) {
  return actor(n, () =>
    value<Record<string, any>[]>(
      `select public.${legacy ? "tc_document_page" : "tc_document_page_v2"}($1) v`,
      [org],
    ),
  );
}
async function update(
  doc: number,
  data: Record<string, unknown>,
  expected = 1,
  n = 1,
  legacy = false,
) {
  return actor(n, () =>
    value(
      `select public.${legacy ? "tc_update_document_metadata" : "tc_update_document_metadata_v2"}($1,$2,$3,$4) v`,
      [org, id(26, doc), data, expected],
    ),
  );
}
async function register(
  data: Record<string, unknown>,
  parents: Record<string, unknown> = {},
  n = 1,
) {
  const doc = crypto.randomUUID();
  await actor(n, () =>
    value("select public.tc_register_document_v2($1,$2,$3) v", [
      org,
      {
        id: doc,
        name: "Documento adicional.pdf",
        object_path: `${org}/${doc}/document.pdf`,
        content_type: "application/pdf",
        size_bytes: 100,
        ...parents,
      },
      data,
    ]),
  );
  return doc;
}
async function overrides(data: Record<string, boolean>) {
  await db.query(
    "update private.tc_customers set module_overrides=$1 where user_id=$2",
    [data, uid(1)],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated,service_role;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
   alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  await installAuthSessionFixture(db);
  for (const name of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  await db.exec(
    readFileSync("tests/fixtures/billing-document-records.sql", "utf8"),
  );
  org = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [uid(1)],
    )
  ).rows[0].id;
  otherOrg = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [uid(2)],
    )
  ).rows[0].id;
  await seedFixtureSessions(db);
}, 30000);
beforeEach(() => db.exec("begin"));
afterEach(async () => {
  await db.exec("rollback;reset role");
});
afterAll(() => db?.close());

describe("adjuntos de facturación: contratos reales SQL con empresas ficticias", () => {
  it("no clasifica históricos y conserva campos/importe con UPDATE legacy o null explícito", async () => {
    expect(
      (
        await db.query("select document_type from public.finance_entries")
      ).rows.every((r) => r.document_type === null),
    ).toBe(true);
    await actor(1, () =>
      db.query(
        "update public.finance_entries set document_type='ticket' where id=$1",
        [id(25, 2)],
      ),
    );
    await actor(1, () =>
      db.query(
        "update public.finance_entries set concept='Edición antigua' where id=$1",
        [id(25, 2)],
      ),
    );
    expect(
      await value(
        "select jsonb_build_object('type',document_type,'amount',amount_cents,'kind',kind) v from public.finance_entries where id=$1",
        [id(25, 2)],
      ),
    ).toEqual({ type: "ticket", amount: 10000, kind: "expense" });
    await actor(1, () =>
      db.query(
        "update public.finance_entries set document_type=null where id=$1",
        [id(25, 2)],
      ),
    );
    expect(
      await value(
        "select to_jsonb(document_type) v from public.finance_entries where id=$1",
        [id(25, 2)],
      ),
    ).toBeNull();
    await expect(
      actor(1, () =>
        db.query(
          "update public.finance_entries set document_type='invented' where id=$1",
          [id(25, 2)],
        ),
      ),
    ).rejects.toThrow();
  });
  it("proyecta el DTOestricto47 y entrega campos nuevos solo por RPCversionada", async () => {
    const old = (await page(1, true)).find((d) => d.id === id(26, 1))!;
    const schema = z.strictObject({
      category: z.enum([
        "insurance",
        "inspection",
        "permit",
        "invoice",
        "maintenance",
        "contract",
        "other",
      ]),
      status: z.enum(["active", "archived"]),
      expires_on: z.string().nullable(),
      remind_days: z.number(),
      row_version: z.number(),
      updated_at: z.string().nullable(),
    });
    expect(schema.parse(old.tracking).category).toBe("other");
    expect(
      (await page()).find((d) => d.id === id(26, 1))!.tracking,
    ).toMatchObject({
      category: "technical_card",
      label: "Ficha del vehículo",
    });
    expect(
      (await page()).find((d) => d.id === id(26, 5))!.tracking,
    ).not.toHaveProperty("label");
    const backup = await actor(1, () =>
      value<any[]>("select public.tc_backup_page_v2($1,'documents') v", [org]),
    );
    expect(
      schema.parse(backup.find((d) => d.id === id(26, 1))!.tracking).category,
    ).toBe("other");
    const current = await actor(1, () =>
      value<any[]>("select public.tc_backup_page_v3($1,'documents') v", [org]),
    );
    expect(
      current.find((d) => d.id === id(26, 2))!.tracking.finance_entry_id,
    ).toBe(id(25, 2));
  });
  it("el viejo editor other no degrada tipo/label/vínculo y CAS rechaza una copia obsoleta", async () => {
    await update(2, { ...tracking, expires_on: "2028-01-01" }, 1, 1, true);
    expect(
      (await page()).find((d) => d.id === id(26, 2))!.tracking,
    ).toMatchObject({
      category: "ticket",
      label: "Justificante del gasto",
      finance_entry_id: id(25, 2),
      row_version: 2,
    });
    await expect(update(2, tracking)).rejects.toThrow(/ha cambiado/);
    await update(
      2,
      { ...tracking, category: "ticket", label: "", finance_entry_id: null },
      2,
    );
    const current = (await page()).find((d) => d.id === id(26, 2))!.tracking;
    expect(current).not.toHaveProperty("label");
    expect(current).not.toHaveProperty("finance_entry_id");
  });
  it.each([
    "technical_card",
    "identity",
    "driving_license",
    "ticket",
    "delivery_note",
  ])(
    "registra varios %s sin crear movimientos económicos",
    async (category) => {
      const before = await value(
        "select jsonb_build_object('n',count(*),'total',sum(amount_cents)) v from public.finance_entries",
      );
      const first = await register({
        ...tracking,
        category,
        label: "Descripción propia",
      });
      const second = await register({
        ...tracking,
        category,
        label: "Otro archivo",
      });
      expect(first).not.toBe(second);
      expect(
        await value(
          "select jsonb_build_object('n',count(*),'total',sum(amount_cents)) v from public.finance_entries",
        ),
      ).toEqual(before);
    },
  );
  it.each([
    { label: "x".repeat(161) },
    { label: 4 },
    { label: null },
    { finance_entry_id: "no-uuid" },
    { finance_entry_id: true },
    { foreign_key: "untrusted" },
  ])("rechaza metadata inválida sin crear original: %j", async (patch) => {
    const before = await value(
      "select to_jsonb(count(*)) v from private.company_documents",
    );
    await expect(register({ ...tracking, ...patch })).rejects.toThrow();
    // Each failed request rolls back to its own savepoint; no half registration.
    expect(
      await value("select to_jsonb(count(*)) v from private.company_documents"),
    ).toEqual(before);
  });
  it("FK y RLS niegan otra empresa o un movimiento inexistente", async () => {
    await expect(
      register({ ...tracking, finance_entry_id: id(25, 9) }),
    ).rejects.toThrow();
  });
  it("una lectura ajena no revela documentos ni Storage", async () => {
    await expect(
      actor(2, () => value("select public.tc_document_page_v2($1) v", [org])),
    ).rejects.toThrow(/no autorizado/);
  });
  it.each(["income", "expenses"])(
    "requiere %s además de documentos para metadatos y descarga",
    async (module) => {
      await overrides({ [module]: false });
      const hidden = id(26, module === "income" ? 6 : 2),
        allowed = id(26, module === "income" ? 2 : 6);
      const rows = await page();
      expect(rows.some((d) => d.id === hidden)).toBe(false);
      expect(rows.some((d) => d.id === allowed)).toBe(true);
      const paths = await actor(1, () =>
        db.query<{ name: string }>("select name from storage.objects"),
      );
      expect(paths.rows.some((d) => d.name.includes(hidden))).toBe(false);
      expect(paths.rows.some((d) => d.name.includes(allowed))).toBe(true);
    },
  );
  it.each(["income", "expenses"])(
    "no reclasifica el movimiento oculto de %s para revelar su original",
    async (module) => {
      const entry = id(25, module === "income" ? 1 : 2),
        doc = id(26, module === "income" ? 6 : 2);
      const before = await value(
        "select to_jsonb(e) v from public.finance_entries e where id=$1",
        [entry],
      );
      await overrides({ [module]: false });
      const visible = async () => ({
        docs: (await page()).some((d) => d.id === doc),
        storage: (
          await actor(1, () =>
            db.query("select name from storage.objects where name like $1", [
              `${org}/${doc}/%`,
            ]),
          )
        ).rows.length,
      });
      expect(await visible()).toEqual({ docs: false, storage: 0 });
      await expect(
        actor(1, () =>
          db.query(
            "update public.finance_entries set kind=$1,category='other' where id=$2",
            [module === "income" ? "expense" : "income", entry],
          ),
        ),
      ).rejects.toThrow(/ambos módulos/);
      expect(
        await value(
          "select to_jsonb(e) v from public.finance_entries e where id=$1",
          [entry],
        ),
      ).toEqual(before);
      expect(await visible()).toEqual({ docs: false, storage: 0 });
    },
  );
  it("permite reclasificar con ambos módulos conservando original y céntimos", async () => {
    const original = await value(
      "select to_jsonb(d) v from private.company_documents d where id=$1",
      [id(26, 2)],
    );
    await actor(1, () =>
      db.query(
        "update public.finance_entries set kind='income',category='other' where id=$1",
        [id(25, 2)],
      ),
    );
    expect(
      await value(
        "select jsonb_build_object('kind',kind,'amount',amount_cents) v from public.finance_entries where id=$1",
        [id(25, 2)],
      ),
    ).toEqual({ kind: "income", amount: 10000 });
    expect(
      await value(
        "select to_jsonb(d) v from private.company_documents d where id=$1",
        [id(26, 2)],
      ),
    ).toEqual(original);
    expect((await page()).some((d) => d.id === id(26, 2))).toBe(true);
  });
  it("Gmail-only conserva sus originales de invoice_documents y no abre nuevas fichas/vínculosF", async () => {
    await overrides({ documents: false });
    const rows = await actor(1, () =>
      db.query<{ id: string }>("select id from private.company_documents"),
    );
    expect(rows.rows.map((d) => d.id)).toEqual([id(26, 3)]);
    const paths = await actor(1, () =>
      db.query<{ name: string }>("select name from storage.objects"),
    );
    expect(paths.rows).toHaveLength(1);
    expect(paths.rows[0].name).toContain(id(26, 3));
  });
  it("operator gestiona metadata; viewer y actor seleccionable no pueden modificarla", async () => {
    expect(
      await update(
        1,
        { ...tracking, category: "technical_card", label: "Operador" },
        1,
        3,
      ),
    ).toMatchObject({ label: "Operador" });
    await db.query(
      "update private.tc_memberships set role='viewer' where organization_id=$1 and user_id=$2",
      [org, uid(3)],
    );
    await expect(update(1, tracking, 2, 3)).rejects.toThrow(/no autorizado/);
  });
  it("los clientes no pueden invocar el helper que acepta p_user", async () => {
    await expect(
      actor(1, () =>
        value("select private.tc_document_visible_for($1,$2,$3) v", [
          otherOrg,
          id(26, 9),
          uid(2),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("el borrado autorizado desvincula el movimiento y conserva original/label/tipo con versión nueva", async () => {
    const before = await value(
      "select to_jsonb(d) v from private.company_documents d where id=$1",
      [id(26, 2)],
    );
    await actor(1, () =>
      db.query("delete from public.finance_entries where id=$1", [id(25, 2)]),
    );
    expect(
      await value(
        "select to_jsonb(d) v from private.company_documents d where id=$1",
        [id(26, 2)],
      ),
    ).toEqual(before);
    expect(
      (await page()).find((d) => d.id === id(26, 2))!.tracking,
    ).toMatchObject({
      category: "ticket",
      label: "Justificante del gasto",
      row_version: 2,
    });
    expect(
      (await page()).find((d) => d.id === id(26, 2))!.tracking,
    ).not.toHaveProperty("finance_entry_id");
  });
  it("docs-only no borra ni desvincula para recuperar una lectura financiera", async () => {
    await overrides({ expenses: false });
    await expect(
      actor(1, () =>
        db.query(
          "delete from public.finance_entries where id=$1 returning id",
          [id(25, 2)],
        ),
      ),
    ).rejects.toThrow(/módulo no está disponible/);
    await expect(
      update(2, { ...tracking, finance_entry_id: null }),
    ).rejects.toThrow(/no disponible/);
  });
  it("mixed parent exige coherencia al vincular pero reasignar camión no destruye historia", async () => {
    await actor(1, () =>
      db.query("update public.finance_entries set truck_id=$1 where id=$2", [
        id(24, 2),
        id(25, 2),
      ]),
    );
    expect(
      await update(2, {
        ...tracking,
        category: "ticket",
        finance_entry_id: id(25, 2),
      }),
    ).toMatchObject({ finance_entry_id: id(25, 2) });
    await expect(
      register(
        { ...tracking, finance_entry_id: id(25, 2) },
        { truck_id: id(24, 1) },
      ),
    ).rejects.toThrow(/camiones distintos/);
  });
  it("autoriza el vínculo antes de describir el padre de un movimiento oculto", async () => {
    await overrides({ expenses: false });
    await expect(
      register(
        { ...tracking, finance_entry_id: id(25, 2) },
        { truck_id: id(24, 2) },
      ),
    ).rejects.toThrow(/Vínculo financiero no autorizado/);
  });
  it("mantiene el desafío MFA por encima de los permisos documentales", async () => {
    await actor(1, async () => undefined);
    const claims = await value<Record<string, string>>(
      "select current_setting('request.jwt.claims')::jsonb v",
    );
    const factor = crypto.randomUUID();
    await db.query(
      "insert into auth.mfa_factors(id,user_id,factor_type,status) values($1,$2,'totp','verified')",
      [factor, uid(1)],
    );
    await db.query(
      "update auth.sessions set aal='aal2',factor_id=$1 where id=$2",
      [factor, claims.session_id],
    );
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ ...claims, aal: "aal1" }),
    ]);
    await expect(page()).rejects.toThrow(/no autorizado/);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ ...claims, aal: "aal2" }),
    ]);
    expect((await page()).some((d) => d.id === id(26, 2))).toBe(true);
  });
  it("FULL desactivado/vencido niega la lectura y permite reactivar sin borrar originales", async () => {
    const set = (
      enabled: boolean,
      expires_at: string | null,
      expected: number,
    ) =>
      actor(9, () =>
        value("select public.tc_admin_company_full('set',$1,$2,$3,$4,null) v", [
          org,
          expected,
          crypto.randomUUID(),
          { enabled, expires_at },
        ]),
      );
    const before = await value(
      "select jsonb_agg(to_jsonb(d) order by id) v from private.company_documents d",
    );
    await set(false, null, 0);
    await expect(page()).rejects.toThrow(/no autorizado/);
    await set(true, "2000-01-01T00:00:00Z", 1);
    await expect(page()).rejects.toThrow(/no autorizado/);
    await set(true, null, 2);
    expect((await page()).some((d) => d.id === id(26, 2))).toBe(true);
    expect(
      await value(
        "select jsonb_agg(to_jsonb(d) order by id) v from private.company_documents d",
      ),
    ).toEqual(before);
  });
  it("servicio invoiceAI conserva Gmail-only previo y filtra vínculo financiero con permisos de p_user", async () => {
    await db.exec(
      "update private.tc_modules set enabled=true;update private.tc_provider_settings set ai_enabled=true",
    );
    const request = {
      organization_id: org,
      user_id: uid(1),
      invoice_id: id(27, 3),
    };
    const service = (action: string, data = request) =>
      actor(
        null,
        () =>
          value<any>("select public.company_invoice_ai_server($1,$2) v", [
            action,
            data,
          ]),
        "service_role",
      );
    await overrides({ documents: false });
    expect(await service("prepare")).toMatchObject({
      state: "available",
      document: { id: id(26, 3) },
    });
    await overrides({});
    await update(3, {
      ...tracking,
      category: "invoice",
      finance_entry_id: id(25, 2),
    });
    await overrides({ expenses: false });
    expect(await service("prepare")).toBeNull();
    expect(
      await service("status", {
        organization_id: org,
        user_id: uid(1),
        invoice_ids: [id(27, 3)],
      } as any),
    ).toEqual([]);
  });
  it("perfiles IA filtran catálogo/preparación con permisos actuales sin llamar a modelos", async () => {
    await db.exec(
      "update private.tc_modules set enabled=true;update private.tc_provider_settings set ai_enabled=true",
    );
    await overrides({ expenses: false });
    const catalog = await actor(1, () =>
      value<any>(
        "select public.tc_company_specialists($1,'documents','{}') v",
        [org],
      ),
    );
    expect(catalog.documents.some((d: any) => d.id === id(26, 2))).toBe(false);
    expect(catalog.documents.some((d: any) => d.id === id(26, 6))).toBe(true);
    await expect(
      actor(1, () =>
        value("select public.tc_company_specialists($1,'prepare',$2) v", [
          org,
          {
            profile: "documents",
            query: "Consulta sintética",
            document_ids: [id(26, 2)],
          },
        ]),
      ),
    ).rejects.toThrow(/no disponible/);
  });
  it("niega reply guardada, replay y finish si el documento se vuelve financiero sin acceso", async () => {
    await db.exec(
      "update private.tc_modules set enabled=true;update private.tc_provider_settings set ai_enabled=true",
    );
    const context = await actor(1, () =>
      value<any>("select public.tc_company_specialists($1,'prepare',$2) v", [
        org,
        {
          profile: "documents",
          query: "Documento ficticio",
          document_ids: [id(26, 3)],
        },
      ]),
    );
    const service = (action: string, data: Record<string, unknown>) =>
      actor(
        null,
        () =>
          value<any>(
            "select public.company_specialists_server($1,$2,$3,$4) v",
            [org, uid(1), action, data],
          ),
        "service_role",
      );
    const completed = crypto.randomUUID(),
      pending = crypto.randomUUID();
    for (const request_id of [completed, pending])
      expect(
        await service("begin", { request_id, profile: "documents", context }),
      ).toMatchObject({ started: true });
    // An owned synthetic SQL reply, never represented as a provider response.
    const answer = {
      request_id: completed,
      reply: "Contenido documental sintético",
      items: [],
      citations: ["D1"],
      uncertainties: [],
    };
    expect(await service("finish", answer)).toMatchObject({
      reply: answer.reply,
    });
    await update(3, {
      ...tracking,
      category: "invoice",
      finance_entry_id: id(25, 2),
    });
    await overrides({ expenses: false });
    await expect(
      actor(1, () =>
        value("select public.tc_company_specialists($1,'result',$2) v", [
          org,
          { request_id: completed },
        ]),
      ),
    ).rejects.toThrow(/no autorizados/);
    await expect(
      service("begin", {
        request_id: completed,
        profile: "documents",
        context,
      }),
    ).rejects.toThrow(/no autorizados/);
    await expect(
      service("finish", { ...answer, request_id: pending }),
    ).rejects.toThrow(/no autorizados/);
    expect(
      await value(
        "select jsonb_build_object('state',state) v from private.tc_copilot_turns where id=$1",
        [pending],
      ),
    ).toEqual({ state: "pending" });
  });
  it("retirar UI conserva el esquema y no ofrece un rollback destructivo", async () => {
    await expect(
      db.exec(
        readFileSync(
          "docs/verification/billing-document-attachments-rollback.sql",
          "utf8",
        ),
      ),
    ).rejects.toThrow(/requires_forward_migration/);
  });
});
