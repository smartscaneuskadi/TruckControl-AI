import { installAuthSessionFixture, bindFixtureActor, seedFixtureSessions } from "./helpers/auth-session-fixture";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite, org: string, otherOrg: string;
const owner = "d1100000-0000-4000-8000-000000000001",
  other = "d1100000-0000-4000-8000-000000000002",
  operator = "d1100000-0000-4000-8000-000000000003";
const docId = (n: number) =>
  `d1200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function as<T>(
  user: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await bindFixtureActor(db, user);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function page(
  user: string,
  company: string,
  kind = "documents",
  after: string | null = null,
) {
  return as(
    user,
    async () =>
      (
        await db.query<{ data: { id: string; organization_id: string }[] }>(
          "select public.tc_backup_page($1,$2,$3) as data",
          [company, kind, after],
        )
      ).rows[0].data,
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
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [i, user] of [owner, other, operator].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        user,
        `backup${i}@example.com`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Empresa ficticia ${i}`,
            tax_id: `DEMO-BACKUP-${i}`,
            address: "Dirección ficticia 10",
            phone: `+3460000090${i}`,
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
  otherOrg = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [other],
    )
  ).rows[0].id;
  await db.query(
    "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'operator','active',$3)",
    [org, operator, owner],
  );
  for (let n = 1; n <= 205; n++) {
    await db.query(
      "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values($1,$2,'Prueba.pdf',$3,'application/pdf',100)",
      [docId(n), org, `${org}/${docId(n)}/document.pdf`],
    );
    await db.query(
      "insert into private.invoice_documents(organization_id,message_id,attachment_id,content_hash,document_id) values($1,$2,'test',$3,$4)",
      [org, `message-${n}`, n.toString(16).padStart(64, "0"), docId(n)],
    );
  }
  await db.query(
    "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values($1,$2,'Privado.pdf',$3,'application/pdf',100)",
    [docId(300), otherOrg, `${otherOrg}/${docId(300)}/document.pdf`],
  );
  await seedFixtureSessions(db);
}, 30000);
afterAll(async () => {
  await db?.close();
});

const tracking = {
  category: "insurance",
  status: "active",
  expires_on: "2026-12-01",
  remind_days: 30,
};
async function update(
  user: string,
  company: string,
  id: string,
  data: unknown = tracking,
  version = 0,
) {
  return as(
    user,
    async () =>
      (
        await db.query<{ v: Record<string, unknown> }>(
          "select public.tc_update_document_metadata($1,$2,$3,$4) v",
          [company, id, data, version],
        )
      ).rows[0].v,
  );
}
describe("documentos: metadatos con RLS y originales conservados", () => {
  it("crea metadatos sin modificar el original y rechaza una edición obsoleta", async () => {
    const before = (
      await db.query(
        "select to_jsonb(d) v from private.company_documents d where id=$1",
        [docId(1)],
      )
    ).rows;
    expect(await update(owner, org, docId(1))).toMatchObject({
      ...tracking,
      row_version: 1,
    });
    await expect(update(owner, org, docId(1))).rejects.toThrow(/ha cambiado/);
    expect(
      await update(
        owner,
        org,
        docId(1),
        { ...tracking, status: "archived" },
        1,
      ),
    ).toMatchObject({ row_version: 2, status: "archived" });
    expect(
      (
        await db.query(
          "select to_jsonb(d) v from private.company_documents d where id=$1",
          [docId(1)],
        )
      ).rows,
    ).toEqual(before);
  });
  it("pagina más de 200 documentos con sus metadatos", async () => {
    const first = await as(
      owner,
      async () =>
        (
          await db.query<{
            v: { id: string; tracking: { row_version: number } }[];
          }>("select public.tc_document_page($1) v", [org])
        ).rows[0].v,
    );
    const second = await as(
      owner,
      async () =>
        (
          await db.query<{ v: unknown[] }>(
            "select public.tc_document_page($1,$2) v",
            [org, first.at(-1)!.id],
          )
        ).rows[0].v,
    );
    expect(first).toHaveLength(200);
    expect(second).toHaveLength(5);
    expect(first[0].tracking.row_version).toBe(2);
    expect(first[1].tracking.row_version).toBe(0);
  });
  it("rechaza otra empresa tanto en lectura como en escritura", async () => {
    await expect(update(other, org, docId(2))).rejects.toThrow(/no autorizado/);
    await expect(update(owner, org, docId(300))).rejects.toThrow(
      /no disponible/,
    );
    await expect(
      as(other, () => db.query("select public.tc_document_page($1)", [org])),
    ).rejects.toThrow(/no autorizado/);
    expect(
      (
        await as(other, () =>
          db.query(
            "select * from private.tc_document_details where organization_id=$1",
            [org],
          ),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("el operador puede gestionar fichas; un lector no puede modificarlas", async () => {
    expect(await update(operator, org, docId(3))).toMatchObject({
      row_version: 1,
    });
    await db.query(
      "update private.tc_memberships set role='viewer' where organization_id=$1 and user_id=$2",
      [org, operator],
    );
    try {
      await expect(update(operator, org, docId(4))).rejects.toThrow(
        /no autorizado/,
      );
      expect(
        (
          await as(operator, () =>
            db.query("select public.tc_document_page($1) v", [org]),
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      await db.query(
        "update private.tc_memberships set role='operator' where organization_id=$1 and user_id=$2",
        [org, operator],
      );
    }
  });
  it("anónimos no acceden a metadatos ni RPC", async () => {
    await expect(
      as(
        null,
        () => db.query("select public.tc_document_page($1)", [org]),
        "anon",
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(
        null,
        () => db.query("select * from private.tc_document_details"),
        "anon",
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it.each([
    { ...tracking, expires_on: "2026-02-30" },
    { ...tracking, remind_days: -1 },
    { ...tracking, remind_days: 366 },
    { ...tracking, category: "untrusted" },
    { ...tracking, object_path: "other/file" },
  ])("rechaza metadatos inválidos sin crear una ficha: %j", async (data) => {
    await expect(update(owner, org, docId(5), data)).rejects.toThrow();
    expect(
      (
        await db.query(
          "select * from private.tc_document_details where document_id=$1",
          [docId(5)],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("el cliente no puede falsificar versiones ni reasignar metadatos", async () => {
    await expect(
      as(owner, () =>
        db.query(
          "update private.tc_document_details set row_version=999 where organization_id=$1",
          [org],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(owner, () =>
        db.query(
          "update private.tc_document_details set organization_id=$1 where organization_id=$2",
          [otherOrg, org],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("bloquear el módulo revoca de inmediato lectura y escritura", async () => {
    await db.query(
      "update private.tc_customers set module_overrides='{\"documents\":false}' where user_id=$1",
      [owner],
    );
    try {
      await expect(update(owner, org, docId(6))).rejects.toThrow(
        /no autorizado/,
      );
      expect(
        (
          await as(owner, () =>
            db.query(
              "select * from private.tc_document_details where organization_id=$1",
              [org],
            ),
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await db.query(
        "update private.tc_customers set module_overrides='{}' where user_id=$1",
        [owner],
      );
    }
  });
  it("conserva el contrato de copias anterior y enriquece solo el nuevo", async () => {
    const old = await as(
      owner,
      async () =>
        (
          await db.query<{ v: Record<string, unknown>[] }>(
            "select public.tc_backup_page($1,'documents') v",
            [org],
          )
        ).rows[0].v,
    );
    const fresh = await as(
      owner,
      async () =>
        (
          await db.query<{ v: Record<string, unknown>[] }>(
            "select public.tc_backup_page_v2($1,'documents') v",
            [org],
          )
        ).rows[0].v,
    );
    expect(old[0]).not.toHaveProperty("tracking");
    expect(fresh[0].tracking).toMatchObject({
      status: "archived",
      row_version: 2,
    });
    await expect(
      as(operator, () =>
        db.query("select public.tc_backup_page_v2($1,'documents')", [org]),
      ),
    ).rejects.toThrow(/administración/);
  });
  it("un alta documental inválida revierte también su ficha base", async () => {
    const id = docId(999),
      doc = {
        id,
        name: "Nuevo.pdf",
        object_path: `${org}/${id}/document.pdf`,
        content_type: "application/pdf",
        size_bytes: 100,
      };
    await expect(
      as(owner, () =>
        db.query("select public.tc_register_document($1,$2,$3)", [
          org,
          doc,
          { ...tracking, remind_days: 999 },
        ]),
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query("select id from private.company_documents where id=$1", [
          id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
