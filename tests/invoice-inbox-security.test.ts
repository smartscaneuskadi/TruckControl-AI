import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite, org: string, foreign: string;
const owner = "f5100000-0000-4000-8000-000000000001",
  other = "f5100000-0000-4000-8000-000000000002",
  viewer = "f5100000-0000-4000-8000-000000000003";
const id = (n: number) =>
  `f5200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function as<T>(
  actor: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec("set role " + role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor ?? "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function page(
  actor: string | null,
  company = org,
  after: string | null = null,
) {
  return as(
    actor,
    async () =>
      (
        await db.query<{ v: { id: string; organization_id: string }[] }>(
          "select public.tc_invoice_page($1,$2) v",
          [company, after],
        )
      ).rows[0].v,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [n, user] of [owner, other, viewer].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        user,
        `inbox${n}@example.com`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Empresa ficticia ${n}`,
            tax_id: `DEMO-INBOX-${n}`,
            address: "Dirección ficticia 10",
            phone: `+3460000090${n}`,
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
  await db.query(
    "update private.tc_customers set module_overrides='{\"gmail\":true}' where user_id=any($1::uuid[])",
    [[owner, other]],
  );
  for (let n = 1; n <= 206; n++) {
    const company = n === 206 ? foreign : org;
    await db.query(
      "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values($1,$2,'Ficticia.pdf',$3,'application/pdf',100)",
      [id(n), company, `${company}/${id(n)}/document.pdf`],
    );
    await db.query(
      "insert into private.invoice_documents(id,organization_id,message_id,attachment_id,content_hash,document_id) values($1,$2,$3,'synthetic',$4,$1)",
      [id(n), company, `message-${n}`, n.toString(16).padStart(64, "0")],
    );
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("bandeja completa en PostgreSQL", () => {
  it("solo lectura invoker con RLS y permiso explícito, sin acceso anónimo", async () => {
    const r = (
      await db.query<{
        definer: boolean;
        anon: boolean;
        client: boolean;
        rls: boolean;
      }>(
        `select p.prosecdef definer,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') client,(select relrowsecurity from pg_class where oid='private.invoice_documents'::regclass) rls from pg_proc p where p.oid='public.tc_invoice_page(uuid,uuid)'::regprocedure`,
      )
    ).rows[0];
    expect(r).toEqual({ definer: false, anon: false, client: true, rls: true });
    await expect(
      as(
        null,
        () => db.query("select public.tc_invoice_page($1)", [org]),
        "anon",
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(page(null)).rejects.toThrow(/no autorizada/);
  });
  it("pagina 205 facturas sin omitir ni repetir; mantiene el RPC antiguo de 200", async () => {
    const first = await page(owner),
      last = await page(owner, org, first.at(-1)!.id);
    expect(first).toHaveLength(200);
    expect(last).toHaveLength(5);
    expect(new Set([...first, ...last].map((i) => i.id)).size).toBe(205);
    expect([...first, ...last].every((i) => i.organization_id === org)).toBe(
      true,
    );
    expect(await page(owner, org, last.at(-1)!.id)).toEqual([]);
    expect(
      (
        await as(owner, () =>
          db.query("select * from public.list_company_invoices($1)", [org]),
        )
      ).rows,
    ).toHaveLength(200);
  });
  it("un cursor no concede acceso a otra empresa", async () => {
    await expect(page(owner, foreign, id(1))).rejects.toThrow(/no autorizada/);
    await expect(page(other, org, id(206))).rejects.toThrow(/no autorizada/);
    expect((await page(other, foreign)).map((i) => i.id)).toEqual([id(206)]);
  });
  it("un usuario de consulta puede leer la bandeja autorizada", async () =>
    expect(await page(viewer)).toHaveLength(200));
  it("retirar la membresía impide leer las páginas siguientes", async () => {
    await db.query(
      "update private.tc_memberships set status='revoked' where organization_id=$1 and user_id=$2",
      [org, viewer],
    );
    try {
      await expect(page(viewer, org, id(200))).rejects.toThrow(/no autorizada/);
    } finally {
      await db.query(
        "update private.tc_memberships set status='active' where organization_id=$1 and user_id=$2",
        [org, viewer],
      );
    }
  });
  it("desactivar Gmail o suspender al cliente retira el acceso sin cambiar facturas", async () => {
    await db.query(
      "update private.tc_customers set module_overrides='{\"gmail\":false}' where user_id=$1",
      [owner],
    );
    try {
      await expect(page(owner)).rejects.toThrow(/no autorizada/);
    } finally {
      await db.query(
        "update private.tc_customers set module_overrides='{\"gmail\":true}' where user_id=$1",
        [owner],
      );
    }
    await db.query(
      "update private.tc_customers set status='suspended' where user_id=$1",
      [owner],
    );
    try {
      await expect(page(owner)).rejects.toThrow(/no autorizada/);
    } finally {
      await db.query(
        "update private.tc_customers set status='trial' where user_id=$1",
        [owner],
      );
    }
  });
  it("leer y exportar no modifica originales, facturas ni contabilidad", async () => {
    const fingerprint = async () =>
      db.query(
        "select md5(string_agg(to_jsonb(i)::text,'' order by id)) v from private.invoice_documents i",
      );
    const before = await fingerprint();
    await page(owner);
    await page(viewer);
    expect(await fingerprint()).toEqual(before);
    expect(
      (await db.query("select id from public.finance_entries")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from private.company_documents")).rows,
    ).toHaveLength(206);
  });
});
