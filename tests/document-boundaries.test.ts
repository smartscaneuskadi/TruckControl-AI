import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;
const owner = "e0000000-0000-4000-8000-000000000001";
const other = "e0000000-0000-4000-8000-000000000002";
const documentId = (n: number) =>
  `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let org: string, otherOrg: string;
const personal = documentId(10),
  invoice = documentId(11),
  foreign = documentId(12);
async function as<T>(user: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function visible() {
  return as(owner, async () => ({
    docs: (
      await db.query<{ id: string }>(
        "select id from public.list_company_documents($1)",
        [org],
      )
    ).rows
      .map((r) => r.id)
      .sort(),
    paths: (
      await db.query<{ name: string }>("select name from storage.objects")
    ).rows
      .map((r) => r.name)
      .sort(),
  }));
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [i, user] of [owner, other].entries()) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        user,
        `boundary${i}@example.com`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Empresa ficticia ${i}`,
            tax_id: `DEMO-${i}`,
            address: "Dirección ficticia 10",
            phone: `+3460000010${i}`,
          },
        },
      ],
    );
  }
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
  for (const [id, company, name] of [
    [personal, org, "Permiso ficticio.pdf"],
    [invoice, org, "Factura ficticia.pdf"],
    [foreign, otherOrg, "Otro permiso.pdf"],
  ]) {
    const path = `${company}/${id}/document.pdf`;
    await db.query(
      "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values($1,$2,$3,$4,'application/pdf',100)",
      [id, company, name, path],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('truckcontrol-documents',$1)",
      [path],
    );
  }
  await db.query(
    "insert into private.invoice_documents(organization_id,message_id,attachment_id,content_hash,document_id) values($1,'demo-message','demo-attachment',$2,$3)",
    [org, "f".repeat(64), invoice],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name) values('truckcontrol-documents',$1)",
    [`${org}/${documentId(13)}/orphan.pdf`],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("permisos de biblioteca y adjuntos Gmail", () => {
  it("Gmail sin biblioteca solo permite metadatos y archivos de facturas autorizadas", async () => {
    await db.query(
      "update private.tc_customers set module_overrides=$1 where user_id=$2",
      [{ documents: false, gmail: true }, owner],
    );
    expect(await visible()).toEqual({
      docs: [invoice],
      paths: [`${org}/${invoice}/document.pdf`],
    });
    expect(
      (
        await as(other, () =>
          db.query("select * from public.get_company_document($1,$2)", [
            org,
            invoice,
          ]),
        )
      ).rows,
    ).toEqual([]);
  });
  it("la biblioteca permite los documentos propios registrados y excluye huérfanos y otras empresas", async () => {
    await db.query(
      "update private.tc_customers set module_overrides=$1 where user_id=$2",
      [{ documents: true, gmail: false }, owner],
    );
    expect(await visible()).toEqual({
      docs: [personal, invoice].sort(),
      paths: [
        `${org}/${personal}/document.pdf`,
        `${org}/${invoice}/document.pdf`,
      ].sort(),
    });
  });
  it("desactivar ambos módulos o suspender la empresa revoca también la descarga", async () => {
    await db.query(
      "update private.tc_customers set module_overrides=$1 where user_id=$2",
      [{ documents: false, gmail: false }, owner],
    );
    expect(await visible()).toEqual({ docs: [], paths: [] });
    await db.query(
      "update private.tc_customers set module_overrides='{}',status='suspended' where user_id=$1",
      [owner],
    );
    expect(await visible()).toEqual({ docs: [], paths: [] });
  });
});
