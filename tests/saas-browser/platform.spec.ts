import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleCatalog, featureLabels } from "../../src/domain/subscriptions";
import type {
  AdminSnapshot,
  Customer,
  SubscriptionAccess,
} from "../../src/domain/subscriptions";
const admin = "10000000-0000-4000-8000-000000000081",
  customerId = "10000000-0000-4000-8000-000000000082",
  expiredId = "10000000-0000-4000-8000-000000000083";
const org = "20000000-0000-4000-8000-000000000082",
  stamp = new Date().toISOString();
const jwt = (id: string) =>
  `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString("base64url")}.synthetic`;
function profile(id = customerId): Customer {
  return {
    user_id: id,
    email: id === expiredId ? "expired@example.com" : "customer@example.com",
    contact_name: "Persona ficticia",
    company_name:
      id === expiredId ? "Empresa prueba finalizada" : "Empresa ficticia SaaS",
    tax_id: "DEMO-TEST",
    address: "Calle ficticia 10",
    phone: "+34600000001",
    requested_plan: "full",
    paid_plan: null,
    status: "trial",
    trial_started_at: new Date(
      Date.now() - (id === expiredId ? 11 : 0) * 86400000,
    ).toISOString(),
    trial_ends_at: new Date(
      Date.now() + (id === expiredId ? -1 : 10) * 86400000,
    ).toISOString(),
    paid_until: null,
    ai_allowed: false,
    ai_opt_in: false,
    module_overrides: {},
    created_at: stamp,
    updated_at: stamp,
  };
}
async function fixtures(page: Page, { smsReady = false } = {}) {
  const catalog = structuredClone(exampleCatalog);
  catalog.sms_ready = smsReady;
  const customers = [profile(), profile(expiredId)];
  let verified = true;
  let actor: string | null = null;
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const records = new Map<
    string,
    {
      id: string;
      kind: string;
      data: Record<string, unknown>;
      version: number;
      financeEntryId: null;
    }
  >();
  const controls = { conflict: false };
  const pending = {
    id: "10000000-0000-4000-8000-000000000084",
    email: "pending@example.com",
    company_name: "Empresa pendiente ficticia",
    email_confirmed: true,
    phone_confirmed: false,
  };
  const snapshot: AdminSnapshot = {
    settings: {
      prices_are_examples: true,
      payments_enabled: false,
      sms_ready: smsReady,
      registration_open: true,
    },
    plans: catalog.plans,
    modules: Object.entries(featureLabels).map(([id, label]) => ({
      id: id as keyof typeof featureLabels,
      label,
      enabled: id !== "invoice_ai",
    })),
    customers,
    pending_registrations: [pending],
    payment_requests: [],
    audit: [],
  };
  const getUser = (id: string) => ({
    id,
    aud: "authenticated",
    role: "authenticated",
    email:
      id === admin
        ? "pedidos@smartscaneuskadi.com"
        : id === expiredId
          ? "expired@example.com"
          : "customer@example.com",
    email_confirmed_at: stamp,
    phone: id === admin || !verified ? "" : "34600000001",
    phone_confirmed_at: id === admin || !verified ? undefined : stamp,
    created_at: stamp,
    updated_at: stamp,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {
      truckcontrol_registration: {
        contact_name: "Persona ficticia",
        company_name: "Empresa ficticia SaaS",
        tax_id: "DEMO-TEST",
        address: "Calle ficticia 10",
        phone: "+34600000001",
        requested_plan: "full",
      },
    },
  });
  const access = (id: string): SubscriptionAccess => {
    const c = customers.find((c) => c.user_id === id) ?? null;
    const active =
      id === admin ||
      (Boolean(c) &&
        c!.status !== "suspended" &&
        Date.parse(c!.trial_ends_at) > Date.now());
    const features = { ...exampleCatalog.plans[1].modules };
    for (const m of snapshot.modules)
      features[m.id] =
        active && m.enabled && (c?.module_overrides[m.id] ?? true);
    features.invoice_ai =
      features.invoice_ai && Boolean(c?.ai_allowed && c?.ai_opt_in);
    return {
      is_admin: id === admin,
      active: (!smsReady || verified) && active,
      features,
      profile: !smsReady || verified ? c : null,
      plan: "full",
      max_trucks: 50,
      requires_phone_verification: smsReady && !verified,
      company_role: "owner",
      can_write: (!smsReady || verified) && active,
      can_manage: (!smsReady || verified) && active,
      organization_id: org,
      sms_ready: smsReady,
      prices_are_examples: true,
      payments_enabled: false,
    };
  };
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4194",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,prefer",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers, body: "" });
      return;
    }
    const token = request.headers().authorization?.replace(/^Bearer /, "");
    let identity = actor;
    if (token?.startsWith("ey"))
      try {
        identity = JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString(),
        ).sub;
      } catch {
        /* Synthetic token only. */
      }
    const body = request.postDataJSON() as Record<string, unknown> | null;
    calls.push({ path: url.pathname, body });
    let data: unknown = [];
    let status = 200;
    if (url.pathname === "/auth/v1/token") {
      actor = String(body?.email).startsWith("pedidos@")
        ? admin
        : String(body?.email).startsWith("expired")
          ? expiredId
          : customerId;
      verified = body?.email !== "phone-pending@example.com";
      data = {
        access_token: jwt(actor),
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: getUser(actor),
      };
    } else if (url.pathname === "/auth/v1/signup")
      data = {
        user: { ...getUser(customerId), email_confirmed_at: null },
        session: null,
      };
    else if (url.pathname === "/auth/v1/user")
      data = getUser(identity ?? actor ?? customerId);
    else if (url.pathname === "/auth/v1/logout") {
      actor = null;
      data = {};
    } else if (url.pathname === "/auth/v1/verify") {
      verified = true;
      data = {
        access_token: jwt(customerId),
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: getUser(customerId),
      };
    } else if (url.pathname === "/rest/v1/rpc/tc_public_catalog")
      data = catalog;
    else if (
      url.pathname === "/rest/v1/rpc/tc_finish_registration" ||
      url.pathname === "/rest/v1/rpc/tc_my_access" ||
      url.pathname === "/rest/v1/rpc/tc_organization_access"
    )
      data = access(identity ?? customerId);
    else if (url.pathname === "/rest/v1/rpc/tc_admin_control") {
      if (identity !== admin) {
        status = 403;
        data = { code: "42501", message: "Administrator required" };
      } else {
        const action = body?.p_action,
          p = body?.p_data as Record<string, unknown>;
        if (action === "module") {
          const m = snapshot.modules.find((m) => m.id === p.id)!;
          m.enabled = Boolean(p.enabled);
        }
        if (action === "customer") {
          const c = customers.find((c) => c.user_id === p.user_id)!;
          c.ai_allowed = Boolean(p.ai_allowed);
          c.status = p.suspended ? "suspended" : "trial";
          c.module_overrides =
            p.module_overrides as Customer["module_overrides"];
        }
        if (action === "plan") {
          const plan = snapshot.plans.find((x) => x.id === p.id)!;
          Object.assign(plan, p);
          plan.revision++;
        }
        if (action !== "snapshot")
          snapshot.audit.push({
            id: crypto.randomUUID(),
            actor_id: admin,
            action: String(action),
            target_id: String(p?.user_id ?? p?.id ?? ""),
            created_at: stamp,
            details: {},
          });
        data = action === "snapshot" ? snapshot : {};
      }
    } else if (url.pathname === "/rest/v1/rpc/tc_set_ai_opt_in") {
      customers.find((c) => c.user_id === identity)!.ai_opt_in = Boolean(
        body?.p_enabled,
      );
      data = access(identity!);
    } else if (url.pathname === "/rest/v1/rpc/tc_request_plan")
      data = "30000000-0000-4000-8000-000000000082";
    else if (url.pathname === "/rest/v1/rpc/tc_save_record") {
      const id = String(body?.p_id),
        old = records.get(id);
      if (controls.conflict || (old && old.version !== body?.p_expected)) {
        status = 409;
        data = { code: "40001", message: "Synthetic concurrent change" };
      } else {
        const record = {
          id,
          kind: String(body?.p_kind),
          data: body?.p_payload as Record<string, unknown>,
          version: old ? old.version + 1 : 1,
          financeEntryId: null,
        };
        records.set(id, record);
        data = record;
      }
    } else if (url.pathname === "/rest/v1/rpc/tc_list_records")
      data = [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
    else if (url.pathname === "/rest/v1/organizations")
      data =
        identity === admin || (smsReady && !verified)
          ? []
          : [
              {
                id: org,
                name:
                  customers.find((c) => c.user_id === identity)?.company_name ??
                  "Empresa ficticia SaaS",
              },
            ];
    else if (url.pathname === "/rest/v1/trucks")
      data = [
        {
          id: "40000000-0000-4000-8000-000000000082",
          organization_id: org,
          plate: "8888 TST",
          brand: "Demo",
          model: "Demo",
          year: 2026,
          odometer_km: 1200,
          status: "available",
          driver_id: null,
          inspection_due_on: "2028-01-01",
          route: "Ruta ficticia",
          row_version: 1,
          created_at: stamp,
        },
      ];
    else if (
      url.pathname === "/rest/v1/drivers" ||
      url.pathname === "/rest/v1/finance_entries" ||
      url.pathname.startsWith("/rest/v1/rpc/get_company_gmail") ||
      url.pathname.startsWith("/rest/v1/rpc/list_company_invoices") ||
      url.pathname === "/rest/v1/rpc/tc_list_records" ||
      url.pathname === "/rest/v1/rpc/tc_team_control"
    )
      data = [];
    else if (url.pathname === "/functions/v1/company-gmail")
      data = { oauth_ready: false, ai_enabled: false };
    else {
      status = 400;
      data = { message: "Unexpected synthetic request" };
    }
    await route.fulfill({ status, headers, body: JSON.stringify(data) });
  });
  return { calls, snapshot, catalog, records, controls };
}
async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test.describe("copia cifrada y sincronización", () => {
  test.use({ serviceWorkers: "allow" });
  async function prepare(page: Page) {
    const f = await fixtures(page);
    await login(page, "customer@example.com");
    await expect(page).toHaveURL(/#\/dashboard/);
    await expect(page.locator(".workspace-label")).toContainText(
      "Empresa ficticia SaaS",
    );
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const menu = page.getByRole("button", { name: "Abrir menú", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole("link", { name: "Configuración", exact: true })
      .click();
    const phrase = "copia-sintetica-para-pruebas-123";
    await page
      .getByLabel("Frase para proteger tu copia", { exact: true })
      .fill(phrase);
    await page
      .getByRole("button", { name: "Activar copia cifrada", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Copia cifrada habilitada" }),
    ).toBeVisible();
    return { ...f, phrase };
  }
  async function openAndEdit(page: Page, phrase: string) {
    await page
      .getByRole("button", { name: "Abrir copia sin conexión", exact: true })
      .click();
    await page.getByLabel("Frase de desbloqueo", { exact: true }).fill(phrase);
    await page
      .getByRole("button", { name: "Abrir copia cifrada", exact: true })
      .click();
    await expect(page.locator(".offline-workspace-banner")).toBeVisible();
    const menu = page.getByRole("button", { name: "Abrir menú", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page
      .getByRole("button", { name: "Añadir registro", exact: true })
      .click();
    await page
      .getByLabel("Nombre o razón social", { exact: true })
      .fill("Cliente offline ficticio");
    await page.getByLabel("NIF / CIF", { exact: true }).fill("DEMO-OFFLINE");
    await page
      .getByRole("button", { name: "Guardar registro", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: "Cliente offline ficticio", exact: true }),
    ).toBeVisible();
  }
  test("recarga sin red, protege datos y conserva cambios ante un conflicto", async ({
    page,
    context,
  }) => {
    const f = await prepare(page);
    const stored = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const r = indexedDB.open("truckcontrol-encrypted-offline-v1", 1);
          r.onsuccess = () => {
            const tx = r.result.transaction("vaults", "readonly"),
              q = tx.objectStore("vaults").getAll();
            tx.oncomplete = () => {
              resolve(JSON.stringify(q.result));
              r.result.close();
            };
          };
          r.onerror = () => reject(r.error);
        }),
    );
    expect(stored).not.toContain("customer@example.com");
    expect(stored).not.toContain("8888 TST");
    expect(stored).not.toContain(f.phrase);
    await context.setOffline(true);
    await page.reload();
    await openAndEdit(page, f.phrase);
    expect(f.records.size).toBe(0);
    await context.setOffline(false);
    f.controls.conflict = true;
    await page
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect(page.locator(".offline-sync-error")).toContainText(
      "Otro dispositivo",
    );
    expect(f.records.size).toBe(0);
    f.controls.conflict = false;
    await page
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sincronizar", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".offline-sync-error")).toHaveCount(0);
    expect(f.records.size).toBe(1);
    expect(
      f.calls.filter((c) => c.path.endsWith("/tc_save_record")),
    ).toHaveLength(2);
    await page
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sincronizar", exact: true }),
    ).toBeEnabled();
    expect(
      f.calls.filter((c) => c.path.endsWith("/tc_save_record")),
    ).toHaveLength(2);
    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(page.locator(".offline-workspace-banner")).toHaveCount(0);
  });
  test("revocar la cuenta bloquea la copia y evita publicar cambios pendientes", async ({
    page,
    context,
  }) => {
    const f = await prepare(page);
    await context.setOffline(true);
    await page.reload();
    await openAndEdit(page, f.phrase);
    await context.setOffline(false);
    f.snapshot.customers[0].status = "suspended";
    await page
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect(page.locator(".offline-workspace-banner")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText(
      "ya no permite el acceso",
    );
    expect(f.records.size).toBe(0);
    expect(f.calls.some((c) => c.path.endsWith("/tc_save_record"))).toBe(false);
  });
});

test("muestra los planes antes del registro y solicita la prueba Full sin cobrar", async ({
  page,
}) => {
  const f = await fixtures(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Cada kilómetro cuenta",
  );
  await expect(page.locator(".plan-grid")).toContainText("10");
  await expect(page.locator(".plan-grid")).not.toContainText("900");
  await page
    .getByRole("button", { name: "Probar Full gratis 30 días", exact: true })
    .click();
  for (const [label, value] of [
    ["Nombre y apellidos", "Persona ficticia"],
    ["Nombre de la empresa", "Empresa ficticia"],
    ["NIF / CIF de la empresa", "DEMO-1"],
    ["Dirección fiscal", "Calle ficticia 1"],
    ["Teléfono móvil con prefijo", "+34600000001"],
    ["Correo electrónico", "new@example.com"],
    ["Contraseña", "synthetic-password-123"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", {
      name: "Solicitar prueba Full de 30 días",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText("Confirma tu correo");
  const signup = f.calls.find((c) => c.path === "/auth/v1/signup")!;
  expect(signup.body?.data).toMatchObject({
    truckcontrol_registration: {
      company_name: "Empresa ficticia",
      requested_plan: "limited",
    },
  });
  expect(f.calls.some((c) => c.path.includes("billing"))).toBe(false);
});
test("confirma SMS y crea la empresa automáticamente sin duplicar el envío", async ({
  page,
}) => {
  const f = await fixtures(page, { smsReady: true });
  await login(page, "phone-pending@example.com");
  await expect(
    page.getByRole("heading", { name: "Verifica tu teléfono" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("enviado un código");
  await page
    .getByLabel("Código recibido por SMS", { exact: true })
    .fill("123456");
  await page
    .getByRole("button", { name: "Confirmar y activar mi empresa" })
    .click();
  await expect(page.locator(".workspace-label")).toContainText(
    "Empresa ficticia SaaS",
  );
  await expect(page.locator(".demo-pill")).toContainText("Prueba:");
  expect(
    f.calls.filter((c) => c.path === "/auth/v1/user" && c.body?.phone),
  ).toHaveLength(1);
});
test("sin proveedor SMS activa la prueba con el correo confirmado sin enviar mensajes", async ({
  page,
}) => {
  const f = await fixtures(page);
  await login(page, "phone-pending@example.com");
  await expect(page.locator(".workspace-label")).toContainText(
    "Empresa ficticia SaaS",
  );
  await expect(page.locator(".demo-pill")).toContainText("Prueba:");
  expect(
    f.calls.filter((c) => c.path === "/auth/v1/user" && c.body?.phone),
  ).toHaveLength(0);
  await expect(page.locator(".sidebar")).toHaveCount(1);
});
test("el administrador gestiona clientes, IA, módulos y precios desde su cuenta", async ({
  page,
}) => {
  const f = await fixtures(page);
  await login(page, "pedidos@smartscaneuskadi.com");
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Gestionar Empresa ficticia SaaS" })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("checkbox", {
      name: "Permitir lectura IA a este usuario",
      exact: true,
    })
    .check();
  await modal.getByRole("button", { name: "Guardar permisos" }).click();
  await expect(modal).not.toBeVisible();
  expect(f.snapshot.customers[0].ai_allowed).toBe(true);
  await page.getByRole("button", { name: "Módulos", exact: true }).click();
  await page.getByRole("checkbox", { name: /Lectura IA de facturas/ }).check();
  expect(f.snapshot.modules.find((m) => m.id === "invoice_ai")?.enabled).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Planes y cobros", exact: true })
    .click();
  await page.getByRole("button", { name: "Editar plan Inicial" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Precio mensual (€)")
    .fill("345,67");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar plan" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(/345,67/).first()).toBeVisible();
  expect(f.snapshot.plans[0].monthly_cents).toBe(34567);
  await expect(
    page.getByRole("checkbox", { name: /Cobros de suscripción/ }),
  ).toBeDisabled();
});
test("una prueba terminada solo permite elegir plan y no accede a la flota", async ({
  page,
}) => {
  const f = await fixtures(page);
  await login(page, "expired@example.com");
  await expect(
    page.getByRole("heading", { name: "Elige cómo quieres continuar" }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Elegir Inicial", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "no se ha realizado ningún cargo",
  );
  expect(f.calls.some((c) => c.path === "/rest/v1/trucks")).toBe(false);
});
test("el portal y la administración son accesibles en escritorio y Android", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await login(page, "pedidos@smartscaneuskadi.com");
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
});
