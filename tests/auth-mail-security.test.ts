import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const source = readFileSync(
  "supabase/migrations/20261101214649_client_auth_mail.sql",
  "utf8",
);
const data = (
  n = 1,
  email = "a".repeat(64),
  ip = "b".repeat(64),
  action = "recovery",
  version: string | null = null,
) => ({
  request_id: `d4000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  email_hash: email,
  ip_hash: ip,
  action,
  legal_version: version,
});
async function reserve(value: object) {
  return (
    await db.query<{ id: string | null }>(
      "select public.company_auth_mail_reserve($1::jsonb) id",
      [JSON.stringify(value)],
    )
  ).rows[0].id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema private;create schema vault;create schema extensions;grant usage on schema private to anon,authenticated,service_role;
 create table private.tc_settings(id boolean,registration_open boolean,owner_email text,payments_enabled boolean);
 insert into private.tc_settings values(true,false,'owner@test.invalid',false);grant select on private.tc_settings to service_role;
 create table vault.secrets(name text,secret text);insert into vault.secrets values('truckcontrol_auth_mail_signing_key','existing-key-preserved'),('truckcontrol_resend_api_key','existing-provider-key');
 create view vault.decrypted_secrets as select name,secret decrypted_secret from vault.secrets;`);
  await db.exec(source);
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate private.tc_auth_mail_attempts;update private.tc_auth_mail_settings set enabled=true,legal_ready=false,acceptance_enabled=false,daily_limit=40,monthly_limit=1000;update private.tc_settings set registration_open=false;",
  );
});
afterAll(async () => {
  await db.close();
});
describe("Auth mail SQL: ACL, presupuesto de correo y consentimiento", () => {
  it.each(["anon", "authenticated"])(
    "%s no lee claves ni reserva envíos",
    async (role) => {
      await db.exec(`set role ${role}`);
      try {
        await expect(
          db.query("select public.company_auth_mail_config()"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("select public.company_auth_mail_reserve('{}')"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("select * from private.tc_auth_mail_attempts"),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("reset role");
      }
    },
  );
  it("solo el backend recibe la configuración acotada", async () => {
    await db.exec("set role service_role");
    const r = await db.query<{ c: Record<string, unknown> }>(
      "select public.company_auth_mail_config() c",
    );
    expect(r.rows[0].c).toMatchObject({
      registration_open: false,
      api_key: "existing-provider-key",
      signing_key: "existing-key-preserved",
    });
    await db.exec("reset role");
  });
  it("respeta el cierre del proveedor", async () => {
    await db.exec(
      "update private.tc_auth_mail_settings set enabled=false;set role service_role",
    );
    expect(await reserve(data())).toBeNull();
  });
  it("no abre altas ni pagos al instalar o consultar", async () => {
    const r = await db.query<{
      registration_open: boolean;
      payments_enabled: boolean;
    }>("select registration_open,payments_enabled from private.tc_settings");
    expect(r.rows[0]).toEqual({
      registration_open: false,
      payments_enabled: false,
    });
  });
  it("dos envíos por correo y quince minutos, aunque cambie la IP", async () => {
    await db.exec("set role service_role");
    expect(await reserve(data(1))).toBeTruthy();
    expect(await reserve(data(2))).toBeTruthy();
    expect(await reserve(data(3, "a".repeat(64), "c".repeat(64)))).toBeNull();
  });
  it("el reintento con misma identidad no crea otra reserva", async () => {
    await db.exec("set role service_role");
    expect(await reserve(data())).toBeTruthy();
    expect(await reserve(data())).toBeNull();
    const r = await db.query<{ count: number }>(
      "select count(*)::int count from private.tc_auth_mail_attempts",
    );
    expect(r.rows[0].count).toBe(1);
  });
  it("aplica un límite global diario compartido", async () => {
    await db.exec(
      "update private.tc_auth_mail_settings set daily_limit=2;set role service_role",
    );
    expect(await reserve(data(1))).toBeTruthy();
    expect(await reserve(data(2, "c".repeat(64)))).toBeTruthy();
    expect(await reserve(data(3, "d".repeat(64)))).toBeNull();
  });
  it("aplica un límite mensual compartido", async () => {
    await db.exec(
      "update private.tc_auth_mail_settings set monthly_limit=1;set role service_role",
    );
    expect(await reserve(data(1))).toBeTruthy();
    expect(await reserve(data(2, "c".repeat(64)))).toBeNull();
  });
  it("limita también la IP entre correos distintos", async () => {
    await db.exec("set role service_role");
    for (let i = 1; i <= 8; i++)
      expect(await reserve(data(i, i.toString(16).repeat(64)))).toBeTruthy();
    expect(await reserve(data(9, "f".repeat(64)))).toBeNull();
  });
  it("con registro cerrado permite recuperar pero no crear clientes", async () => {
    await db.exec("set role service_role");
    expect(
      await reserve(
        data(1, "a".repeat(64), "b".repeat(64), "signup", "2026-11-01"),
      ),
    ).toBeNull();
    expect(await reserve(data(2))).toBeTruthy();
  });
  it("requiere aviso legal listo, registro abierto y versión vigente", async () => {
    await db.exec(
      "update private.tc_settings set registration_open=true;set role service_role",
    );
    expect(
      await reserve(
        data(1, "a".repeat(64), "b".repeat(64), "signup", "2026-11-01"),
      ),
    ).toBeNull();
    await db.exec(
      "reset role;update private.tc_auth_mail_settings set legal_ready=true;set role service_role",
    );
    expect(
      await reserve(data(2, "a".repeat(64), "b".repeat(64), "signup", "old")),
    ).toBeNull();
    expect(
      await reserve(
        data(3, "a".repeat(64), "b".repeat(64), "signup", "2026-11-01"),
      ),
    ).toBeTruthy();
  });
  it("fixtures apagados por defecto y sin activar el registro", async () => {
    await db.exec("set role service_role");
    expect(
      await reserve(data(1, "a".repeat(64), "b".repeat(64), "acceptance")),
    ).toBeNull();
    await db.exec(
      "reset role;update private.tc_auth_mail_settings set acceptance_enabled=true;set role service_role",
    );
    expect(
      await reserve(data(2, "a".repeat(64), "b".repeat(64), "acceptance")),
    ).toBeTruthy();
  });
  it("no permite reservar con hashes inválidos", async () => {
    await db.exec("set role service_role");
    await expect(reserve(data(1, "not-a-hash"))).rejects.toThrow(
      /Invalid mail reservation/,
    );
  });
  it("conserva las credenciales existentes", async () => {
    const r = await db.query<{ secret: string }>(
      "select secret from vault.secrets order by name",
    );
    expect(r.rows.map((x) => x.secret)).toEqual([
      "existing-key-preserved",
      "existing-provider-key",
    ]);
  });
});
