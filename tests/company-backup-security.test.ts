import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite, org: string, otherOrg: string;
const owner = "f1000000-0000-4000-8000-000000000001",
  other = "f1000000-0000-4000-8000-000000000002",
  operator = "f1000000-0000-4000-8000-000000000003";
const docId = (n: number) =>
  `f2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("paginación segura de copias", () => {
  it("recupera más de doscientas filas sin truncar ni repetir", async () => {
    for (const kind of ["documents", "invoices"]) {
      const first = await page(owner, org, kind),
        second = await page(owner, org, kind, first.at(-1)!.id);
      expect(first).toHaveLength(200);
      expect(second).toHaveLength(5);
      expect(new Set([...first, ...second].map((d) => d.id)).size).toBe(205);
      expect(
        [...first, ...second].every((d) => d.organization_id === org),
      ).toBe(true);
    }
  });
  it("otro propietario no puede pedir la copia de una empresa ajena", async () => {
    await expect(page(other, org)).rejects.toThrow();
    expect(await page(other, otherOrg)).toHaveLength(1);
  });
  it("un operador no recibe una copia administrativa aunque pueda consultar fichas", async () => {
    await expect(page(operator, org)).rejects.toThrow();
  });
  it("un anónimo no puede ejecutar el RPC", async () => {
    await expect(
      as(
        null,
        () =>
          db.query("select public.tc_backup_page($1,'documents',null)", [org]),
        "anon",
      ),
    ).rejects.toThrow();
  });
  it("no acepta una colección privada arbitraria", async () => {
    await expect(page(owner, org, "gmail_tokens")).rejects.toThrow();
  });
  it("no usa SECURITY DEFINER ni concede lectura nueva de tablas", async () => {
    const r = await db.query<{ prosecdef: boolean }>(
      "select prosecdef from pg_proc where oid='public.tc_backup_page(uuid,text,uuid)'::regprocedure",
    );
    expect(r.rows[0].prosecdef).toBe(false);
  });
  it("un administrador de empresa sí puede preparar su copia autorizada", async () => {
    await db.query(
      "update private.tc_memberships set role='admin' where organization_id=$1 and user_id=$2",
      [org, operator],
    );
    expect(await page(operator, org)).toHaveLength(200);
    await db.query(
      "update private.tc_memberships set role='operator' where organization_id=$1 and user_id=$2",
      [org, operator],
    );
  });
  it("suspender la empresa impide continuar la paginación", async () => {
    await db.query(
      "update private.tc_customers set status='suspended' where user_id=$1",
      [owner],
    );
    await expect(page(owner, org)).rejects.toThrow();
    await db.query(
      "update private.tc_customers set status='trial' where user_id=$1",
      [owner],
    );
  });
  it("respeta la desactivación del archivo y correo", async () => {
    await db.query(
      "update private.tc_customers set module_overrides='{" +
        '"documents":false,"gmail":false' +
        "}' where user_id=$1",
      [owner],
    );
    await expect(page(owner, org)).rejects.toThrow();
    await expect(page(owner, org, "invoices")).rejects.toThrow();
    await db.query(
      "update private.tc_customers set module_overrides='{}' where user_id=$1",
      [owner],
    );
  });
  it("la revocación de membresía elimina el acceso a copias", async () => {
    await db.query(
      "update private.tc_memberships set role='admin',status='revoked' where organization_id=$1 and user_id=$2",
      [org, operator],
    );
    await expect(page(operator, org)).rejects.toThrow();
  });
});
