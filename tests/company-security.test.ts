import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;
const ownerA = "10000000-0000-4000-8000-000000000011",
  ownerB = "10000000-0000-4000-8000-000000000012";
const orgA = "20000000-0000-4000-8000-000000000011",
  orgB = "20000000-0000-4000-8000-000000000012";
const truckA = "30000000-0000-4000-8000-000000000011",
  truckB = "30000000-0000-4000-8000-000000000012";
const documentA = "50000000-0000-4000-8000-000000000011",
  documentB = "50000000-0000-4000-8000-000000000012";
const invoiceA = "60000000-0000-4000-8000-000000000011",
  invoiceB = "60000000-0000-4000-8000-000000000012";
async function role<T>(
  name: string,
  owner: string | null,
  fn: () => Promise<T>,
) {
  await db.exec(`set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner ?? "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function server<T = unknown>(
  action: string,
  data: Record<string, unknown>,
) {
  const result = await db.query<{ result: T }>(
    "select public.gmail_server($1,$2::jsonb) as result",
    [action, JSON.stringify(data)],
  );
  return result.rows[0].result;
}
const approval = (truck = truckA) => ({
  truck_id: truck,
  concept: "Factura ficticia",
  date: "2026-10-12",
  net_cents: 10000,
  tax_cents: 2100,
  total_cents: 12100,
  category: "maintenance",
});
async function approve(org: string, id: string, entry = approval()) {
  const result = await db.query<{ id: string }>(
    "select public.approve_company_invoice($1,$2,$3::jsonb) as id",
    [org, id, JSON.stringify(entry)],
  );
  return result.rows[0].id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
  `);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1),($2)", [ownerA, ownerB]);
  await db.query(
    "insert into public.organizations(id,owner_id,name) values($1,$2,'Empresa ficticia A'),($3,$4,'Empresa ficticia B')",
    [orgA, ownerA, orgB, ownerB],
  );
  await db.query(
    "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on) values($1,$2,'1111 TST','Demo','Demo',2026,'2028-01-01'),($3,$4,'2222 TST','Demo','Demo',2026,'2028-01-01')",
    [truckA, orgA, truckB, orgB],
  );
  for (const [org, user, doc, inv, subject] of [
    [orgA, ownerA, documentA, invoiceA, "google-demo-a"],
    [orgB, ownerB, documentB, invoiceB, "google-demo-b"],
  ]) {
    await role("service_role", null, () =>
      server("connect", {
        organization_id: org,
        user_id: user,
        google_subject: subject,
        email: `${subject}@example.com`,
        refresh_token_cipher: "v1." + "x".repeat(70),
      }),
    );
    await db.query(
      "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values($1,$2,'Factura ficticia.pdf',$3,'application/pdf',100)",
      [doc, org, `${org}/${doc}/document.pdf`],
    );
    await db.query(
      "insert into private.invoice_documents(id,organization_id,message_id,attachment_id,content_hash,document_id,supplier,net_cents,tax_cents,total_cents) values($1,$2,'message-demo','attachment-demo',$3,$4,'Proveedor ficticio',10000,2100,12100)",
      [inv, org, "a".repeat(64), doc],
    );
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("permisos de empresas, documentos y Gmail", () => {
  it("activa RLS también en tablas privadas y mantiene el bucket privado", async () => {
    const tables = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relnamespace='private'::regnamespace and relkind='r'",
    );
    expect(tables.rows.length).toBeGreaterThanOrEqual(7);
    expect(tables.rows.every((r) => r.relrowsecurity)).toBe(true);
    const result = await db.query<{ public: boolean; file_size_limit: number }>(
      "select public,file_size_limit from storage.buckets where id='truckcontrol-documents'",
    );
    expect(result.rows[0].public).toBe(false);
    expect(Number(result.rows[0].file_size_limit)).toBe(10485760);
  });
  it("solo devuelve documentos, facturas y correo de la propia empresa", async () => {
    await role("authenticated", ownerA, async () => {
      expect(
        (
          await db.query("select * from public.get_company_document($1,$2)", [
            orgA,
            documentA,
          ])
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query("select * from public.get_company_document($1,$2)", [
            orgB,
            documentB,
          ])
        ).rows,
      ).toHaveLength(0);
    });
    await role("authenticated", ownerA, async () => {
      expect(
        (
          await db.query("select * from public.list_company_documents($1)", [
            orgA,
          ])
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query("select * from public.list_company_documents($1)", [
            orgB,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query("select * from public.list_company_invoices($1)", [
            orgB,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from public.get_company_gmail($1)", [orgB]))
          .rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query<{ email: string }>(
            "select * from public.get_company_gmail($1)",
            [orgA],
          )
        ).rows[0].email,
      ).toBe("google-demo-a@example.com");
    });
  });
  it("rechaza usuarios anónimos incluso en los RPC de metadatos", async () => {
    await role("anon", null, async () => {
      await expect(
        db.query("select * from public.get_company_gmail($1)", [orgA]),
      ).rejects.toThrow("permission denied");
      expect(
        (await db.query("select * from storage.objects")).rows,
      ).toHaveLength(0);
    });
    await role("authenticated", null, async () =>
      expect(
        (
          await db.query("select * from public.list_company_documents($1)", [
            orgA,
          ])
        ).rows,
      ).toHaveLength(0),
    );
  });
  it("impide al navegador leer tokens/estados y ejecutar operaciones de servidor", async () => {
    await role("authenticated", ownerA, async () => {
      for (const table of [
        "gmail_tokens",
        "gmail_oauth_states",
        "gmail_oauth_pending",
        "invoice_ai_usage",
      ])
        await expect(
          db.query(`select * from private.${table}`),
        ).rejects.toThrow("permission denied");
      await expect(
        server("credentials", { organization_id: orgA }),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query(
          "update private.gmail_connections set email='intrusion@example.com' where organization_id=$1",
          [orgA],
        ),
      ).rejects.toThrow("permission denied");
    });
  });
  it("aísla lecturas y subidas de archivos e impide sobrescribirlos", async () => {
    await role("authenticated", ownerA, async () => {
      await db.query(
        "insert into storage.objects(bucket_id,name) values('truckcontrol-documents',$1)",
        [`${orgA}/test.pdf`],
      );
      await expect(
        db.query(
          "insert into storage.objects(bucket_id,name) values('truckcontrol-documents',$1)",
          [`${orgB}/test.pdf`],
        ),
      ).rejects.toThrow("row-level security");
      expect(
        (
          await db.query(
            "update storage.objects set name='overwrite.pdf' returning id",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("delete from storage.objects returning id")).rows,
      ).toHaveLength(0);
    });
    await role("authenticated", ownerB, async () =>
      expect(
        (await db.query("select * from storage.objects")).rows,
      ).toHaveLength(0),
    );
  });
  it("valida en SQL el propietario, la ruta y las fichas vinculadas a un documento", async () => {
    const document = {
      id: crypto.randomUUID(),
      name: "Prueba ficticia.pdf",
      object_path: `${orgA}/invalid/document.pdf`,
      content_type: "application/pdf",
      size_bytes: 100,
      truck_id: null,
      driver_id: null,
    };
    await role("authenticated", ownerA, async () => {
      await expect(
        db.query("select public.register_company_document($1,$2::jsonb)", [
          orgB,
          JSON.stringify(document),
        ]),
      ).rejects.toThrow("row-level security");
      await expect(
        db.query("select public.register_company_document($1,$2::jsonb)", [
          orgA,
          JSON.stringify(document),
        ]),
      ).rejects.toThrow("check constraint");
      document.object_path = `${orgA}/${document.id}/document.pdf`;
      await expect(
        db.query("select public.register_company_document($1,$2::jsonb)", [
          orgA,
          JSON.stringify({ ...document, truck_id: truckB }),
        ]),
      ).rejects.toThrow("foreign key");
    });
  });
  it("rechaza aprobación ajena, referencias cruzadas y totales incorrectos sin crear gastos", async () => {
    await role("authenticated", ownerB, () =>
      expect(approve(orgA, invoiceA)).rejects.toThrow("Factura no disponible"),
    );
    await role("authenticated", ownerA, async () => {
      await expect(approve(orgA, invoiceA, approval(truckB))).rejects.toThrow(
        "foreign key",
      );
      await expect(
        approve(orgA, invoiceA, { ...approval(), total_cents: 12000 }),
      ).rejects.toThrow("Revisa la moneda");
      expect(
        (await db.query("select * from public.finance_entries")).rows,
      ).toHaveLength(0);
    });
  });
  it("registra una sola vez la base sin IVA aunque se repita la confirmación", async () => {
    await role("authenticated", ownerA, async () => {
      const first = await approve(orgA, invoiceA);
      expect(await approve(orgA, invoiceA)).toBe(first);
      const entries = await db.query<{ amount_cents: number; kind: string }>(
        "select amount_cents,kind from public.finance_entries",
      );
      expect(entries.rows).toHaveLength(1);
      expect(Number(entries.rows[0].amount_cents)).toBe(10000);
      expect(entries.rows[0].kind).toBe("expense");
    });
  });
  it("detecta ediciones concurrentes aunque el cliente intente fijar la versión", async () => {
    await role("authenticated", ownerA, async () => {
      const before = await db.query<{ row_version: number }>(
        "select row_version from public.trucks where id=$1",
        [truckA],
      );
      const version = Number(before.rows[0].row_version);
      await db.query(
        "update public.trucks set route='Primera edición',row_version=999 where id=$1 and row_version=$2",
        [truckA, version],
      );
      expect(
        (
          await db.query(
            "update public.trucks set route='Edición obsoleta' where id=$1 and row_version=$2 returning id",
            [truckA, version],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        Number(
          (
            await db.query<{ row_version: number }>(
              "select row_version from public.trucks where id=$1",
              [truckA],
            )
          ).rows[0].row_version,
        ),
      ).toBe(version + 1);
    });
  });
  it("consume OAuth una sola vez, comprueba el usuario al finalizar y limita la IA", async () => {
    await role("service_role", null, async () => {
      await server("state_create", {
        organization_id: orgA,
        user_id: ownerA,
        state_hash: "b".repeat(64),
      });
      expect(
        await server("state_consume", { state_hash: "b".repeat(64) }),
      ).toMatchObject({ organization_id: orgA, user_id: ownerA });
      expect(
        await server("state_consume", { state_hash: "b".repeat(64) }),
      ).toBeNull();
      await server("pending_create", {
        organization_id: orgA,
        user_id: ownerA,
        ticket_hash: "c".repeat(64),
        google_subject: "pending-demo",
        email: "pending@example.com",
        refresh_token_cipher: "encrypted-demo",
      });
      expect(
        await server("pending_consume", {
          organization_id: orgA,
          user_id: ownerB,
          ticket_hash: "c".repeat(64),
        }),
      ).toBeNull();
      expect(
        await server("pending_consume", {
          organization_id: orgA,
          user_id: ownerA,
          ticket_hash: "c".repeat(64),
        }),
      ).toMatchObject({ user_id: ownerA });
      expect(
        await server("pending_consume", {
          organization_id: orgA,
          user_id: ownerA,
          ticket_hash: "c".repeat(64),
        }),
      ).toBeNull();
      for (let i = 0; i < 100; i++)
        expect(await server("reserve_ai", { organization_id: orgA })).toBe(
          true,
        );
      expect(await server("reserve_ai", { organization_id: orgA })).toBe(false);
      expect(await server("reserve_ai", { organization_id: orgB })).toBe(true);
    });
  });
  it("no permite compartir por accidente la misma cuenta Google entre empresas", async () => {
    await role("service_role", null, async () =>
      expect(
        server("connect", {
          organization_id: orgB,
          user_id: ownerB,
          google_subject: "google-demo-a",
          email: "google-demo-a@example.com",
          refresh_token_cipher: "v1." + "x".repeat(70),
        }),
      ).rejects.toThrow("duplicate key"),
    );
  });
});
