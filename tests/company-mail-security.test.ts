import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const id = (i: number) =>
  "da000000-0000-4000-8000-" + String(i).padStart(12, "0");
const owner = id(1),
  other = id(2),
  operator = id(3),
  viewer = id(4);
let org: string, foreignOrg: string;
const recipient = "a".repeat(43) + "@facturas.example.com";
async function as<T>(role: string, action: () => Promise<T>) {
  await db.exec("set role " + role);
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc<T = Record<string, unknown>>(action: string, data: object) {
  const result = await db.query<{ result: T }>(
    "select public.company_mail_server($1,$2::jsonb) result",
    [action, JSON.stringify(data)],
  );
  return result.rows[0].result;
}
const server = <T = Record<string, unknown>>(action: string, data: object) =>
  as("service_role", () => rpc<T>(action, data));
function invoice(hash: string, actor = owner, company = org) {
  const document = crypto.randomUUID();
  return {
    organization_id: company,
    user_id: actor,
    import_source: "email_upload",
    content_hash: hash,
    message_id: "eml:" + hash,
    attachment_id: "part:" + hash,
    document: {
      id: document,
      name: "Factura ficticia.pdf",
      object_path: company + "/" + document + "/document.pdf",
      content_type: "application/pdf",
      size_bytes: 100,
    },
  };
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
  // Local database only. Remote verification keeps all live controls untouched.
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [index, user] of [owner, other, operator, viewer].entries()) {
    const meta = {
      truckcontrol_registration: {
        contact_name: "Persona ficticia",
        company_name: "Empresa de prueba " + index,
        tax_id: "DEMO-" + index,
        address: "Dirección ficticia 10",
        phone: "+3460000000" + index,
        requested_plan: "full",
      },
    };
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [user, "mail" + index + "@example.com", meta],
    );
  }
  org = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [owner],
    )
  ).rows[0].id;
  foreignOrg = (
    await db.query<{ id: string }>(
      "select id from public.organizations where owner_id=$1",
      [other],
    )
  ).rows[0].id;
  await db.query(
    "insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values($1,$2,'operator','active',$4),($1,$3,'viewer','active',$4)",
    [org, operator, viewer, owner],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("correo general: aislamiento y control en PostgreSQL", () => {
  it("mantiene RLS y las tablas internas fuera de los roles de clientes", async () => {
    for (const role of ["anon", "authenticated"])
      await as(role, async () => {
        await expect(
          db.query("select * from private.company_mail_inboxes"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.query("select * from private.company_mail_receipts"),
        ).rejects.toThrow("permission denied");
        await expect(
          rpc("get_inbox", { organization_id: org, user_id: owner }),
        ).rejects.toThrow("permission denied");
      });
    const flags = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid in ('private.company_mail_inboxes'::regclass,'private.company_mail_receipts'::regclass)",
    );
    expect(flags.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it("el propietario puede habilitar el mismo buzón sin duplicarlo; un operador no puede administrarlo", async () => {
    const data = {
      organization_id: org,
      user_id: owner,
      recipient,
      domain: "facturas.example.com",
    };
    expect(await server("enable_inbox", data)).toEqual({
      recipient,
      enabled: true,
    });
    expect(
      await server("enable_inbox", {
        ...data,
        recipient: "b".repeat(43) + "@facturas.example.com",
      }),
    ).toEqual({ recipient, enabled: true });
    await expect(
      server("enable_inbox", { ...data, user_id: operator }),
    ).rejects.toThrow("administración");
    await expect(
      server("get_inbox", { organization_id: org, user_id: other }),
    ).rejects.toThrow("no disponible");
  });
  it("un operador importa documentos de su empresa, sin aceptar importes ni contabilizar gastos", async () => {
    const data = invoice("a".repeat(64), operator);
    const result = await server("record_invoice", {
      ...data,
      supplier: "Inventado",
      total_cents: 12100,
      net_cents: 10000,
      tax_cents: 2100,
    });
    expect(result).toMatchObject({
      organization_id: org,
      import_source: "email_upload",
      total_cents: null,
      net_cents: null,
      supplier: "",
      status: "needs_review",
    });
    expect(
      (await db.query("select * from public.finance_entries")).rows,
    ).toHaveLength(0);
    expect(
      await server("record_invoice", invoice("a".repeat(64), operator)),
    ).toEqual({ duplicate: true });
  });
  it("deniega consulta, empresa ajena y rutas de archivos cruzadas", async () => {
    await expect(
      server("record_invoice", invoice("b".repeat(64), viewer)),
    ).rejects.toThrow("escritura");
    await expect(
      server("record_invoice", invoice("b".repeat(64), owner, foreignOrg)),
    ).rejects.toThrow("no disponible");
    const crossed = invoice("b".repeat(64));
    crossed.document.object_path =
      foreignOrg + "/" + crossed.document.id + "/document.pdf";
    await expect(server("record_invoice", crossed)).rejects.toThrow(
      "Documento inválido",
    );
  });
  it("revalida suspensión y módulo antes del registro", async () => {
    await db.query(
      "update private.tc_customers set status='suspended' where user_id=$1",
      [owner],
    );
    try {
      await expect(
        server("record_invoice", invoice("c".repeat(64))),
      ).rejects.toThrow("no disponible");
    } finally {
      await db.query(
        "update private.tc_customers set status='trial' where user_id=$1",
        [owner],
      );
    }
    await db.query(
      "update private.tc_modules set enabled=false where id='gmail'",
    );
    try {
      await expect(
        server("record_invoice", invoice("c".repeat(64))),
      ).rejects.toThrow("no disponible");
    } finally {
      await db.query(
        "update private.tc_modules set enabled=true where id='gmail'",
      );
    }
  });
  it("reserva cada entrega una vez, rechaza identidad reutilizada y bloquea una finalización ajena", async () => {
    const body = {
      recipient,
      delivery_id: "delivery-1",
      body_hash: "d".repeat(64),
    };
    const first = await server("delivery_begin", body);
    expect(first).toMatchObject({
      state: "ready",
      organization_id: org,
      user_id: owner,
    });
    expect(await server("delivery_begin", body)).toEqual({ state: "busy" });
    await expect(
      server("delivery_begin", { ...body, body_hash: "e".repeat(64) }),
    ).rejects.toThrow("reutilizada");
    await expect(
      server("delivery_finish", {
        organization_id: org,
        user_id: owner,
        delivery_id: body.delivery_id,
        lease_token: id(99),
        imported: 0,
        succeeded: true,
      }),
    ).rejects.toThrow("no disponible");
    const record = await server("record_invoice", {
      ...invoice("d".repeat(64)),
      import_source: "forwarded_email",
      delivery_id: body.delivery_id,
      lease_token: first.lease_token,
    });
    expect(record).toMatchObject({
      import_source: "forwarded_email",
      status: "needs_review",
    });
    await server("delivery_finish", {
      organization_id: org,
      user_id: owner,
      delivery_id: body.delivery_id,
      lease_token: first.lease_token,
      imported: 1,
      succeeded: true,
    });
    expect(await server("delivery_begin", body)).toEqual({
      state: "complete",
      imported: 1,
    });
  });
  it("una entrega caducada obtiene un permiso nuevo y no acepta el anterior", async () => {
    const body = {
      recipient,
      delivery_id: "delivery-2",
      body_hash: "f".repeat(64),
    };
    const first = await server("delivery_begin", body);
    await db.query(
      "update private.company_mail_receipts set lease_until=now()-interval '1 second' where organization_id=$1 and delivery_id=$2",
      [org, body.delivery_id],
    );
    const second = await server("delivery_begin", body);
    expect(second.lease_token).not.toBe(first.lease_token);
    await expect(
      server("record_invoice", {
        ...invoice("f".repeat(64)),
        import_source: "forwarded_email",
        delivery_id: body.delivery_id,
        lease_token: first.lease_token,
      }),
    ).rejects.toThrow("no disponible");
  });
  it("desactivar el buzón bloquea entregas nuevas y también permisos anteriores sin borrar documentos", async () => {
    expect(
      await server("disable_inbox", { organization_id: org, user_id: owner }),
    ).toEqual({ recipient, enabled: false });
    await expect(
      server("delivery_begin", {
        recipient,
        delivery_id: "delivery-3",
        body_hash: "1".repeat(64),
      }),
    ).rejects.toThrow("no disponible");
    const old = (
      await db.query<{ lease_token: string }>(
        "select lease_token from private.company_mail_receipts where organization_id=$1 and delivery_id='delivery-2'",
        [org],
      )
    ).rows[0];
    await expect(
      server("record_invoice", {
        ...invoice("f".repeat(64)),
        import_source: "forwarded_email",
        delivery_id: "delivery-2",
        lease_token: old.lease_token,
      }),
    ).rejects.toThrow("no disponible");
    expect(
      (
        await db.query(
          "select * from private.invoice_documents where organization_id=$1",
          [org],
        )
      ).rows,
    ).toHaveLength(2);
    await server("enable_inbox", {
      organization_id: org,
      user_id: owner,
      recipient,
      domain: "facturas.example.com",
    });
  });
  it("la prueba remota se ensaya con rollback y conserva todos los controles", async () => {
    await db.exec("update private.tc_settings set registration_open=false");
    const before = await db.query(
      "select to_jsonb(s) value from private.tc_settings s",
    );
    const result = await db.exec(
      readFileSync("docs/verification/company-mail-rollback.sql", "utf8"),
    );
    expect(result.at(-1)?.rows[0]).toMatchObject({
      verification: "company_mail_passed_and_rolled_back",
      synthetic_users_remaining: 0,
      synthetic_companies_remaining: 0,
      enforce_access: true,
      registration_open: false,
      payments_enabled: false,
    });
    expect(
      (await db.query("select to_jsonb(s) value from private.tc_settings s"))
        .rows,
    ).toEqual(before.rows);
  });
});
