import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  decryptCompanyBackup,
  encryptCompanyBackup,
} from "../../src/data/company-backup";
import type {
  CompanyDocument,
  CompanyInvoice,
} from "../../src/integrations/supabase/database.types";
import type { ProviderStatus } from "../../src/integrations/supabase/provider-setup";
import AxeBuilder from "@axe-core/playwright";
import type { RecurringStatus } from "../../src/components/RecurringSubscription";
import type { TyreRecord, TyreHistory } from "../../src/domain/tyres";
import { emptyTyreData } from "../../src/domain/tyres";
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
// Existing Full-trial customers remain a distinct, preserved cohort.
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
    trial_plan_id: "full",
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
  const controls = {
    providerDenied: false,
    providerStatus: {
      google: {
        client_id: null,
        id_valid: false,
        secret_valid: false,
        configured: false,
        vault_available: true,
        connections: 0,
      },
      auth_mail: { enabled: true, legal_ready: true },
      ai: { enabled: true, monthly_budget_cents: 1000 },
      receiving: { enabled: true, domain: "facturas.truckcontrolai.com" },
      payments_enabled: false,
      sms_enabled: false,
    } as ProviderStatus,
    companyRole: "owner" as "owner" | "admin" | "operator" | "viewer",
    companyPlan: "full" as "full" | "limited",
    backupDocuments: [] as CompanyDocument[],
    invoiceRows: [] as CompanyInvoice[],
    tyreRows: [] as TyreRecord[],
    tyreHistory: [] as TyreHistory[],
    tyreDenied: false,
    invoiceFailure: false,
    invoiceAiEnabled: true,
    invoiceAiAttempted: new Set<string>(),
    invoiceAiUncertain: false,
    conflict: false,
    recurring: {
      configured: false,
      management_available: false,
      terms_version: null,
      terms_url: null,
      subscription: null,
      invoices: [],
    } as RecurringStatus,
    recurringFailure: false,
    checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic",
  };
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
    const features = {
      ...exampleCatalog.plans.find((plan) => plan.id === controls.companyPlan)!
        .modules,
    };
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
      plan: controls.companyPlan,
      max_trucks: 50,
      requires_phone_verification: smsReady && !verified,
      company_role: controls.companyRole,
      can_write:
        (!smsReady || verified) && active && controls.companyRole !== "viewer",
      can_manage:
        (!smsReady || verified) &&
        active &&
        ["owner", "admin"].includes(controls.companyRole),
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
    else if (url.pathname === "/rest/v1/rpc/tc_provider_control") {
      if (identity !== admin || controls.providerDenied) {
        status = 403;
        data = { code: "42501", message: "Global operator required" };
      } else {
        if (body?.p_action === "set_google") {
          const values = body.p_data as Record<string, unknown>;
          if (
            !/^468881730124-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
              String(values.client_id),
            ) ||
            !/^GOCSPX[-_][A-Za-z0-9_-]{16,240}$/.test(
              String(values.client_secret),
            )
          ) {
            status = 400;
            data = { code: "23514", message: "Invalid synthetic credentials" };
          } else {
            Object.assign(controls.providerStatus.google, {
              client_id: values.client_id,
              id_valid: true,
              secret_valid: true,
              configured: true,
            });
            data = structuredClone(controls.providerStatus);
          }
        } else data = structuredClone(controls.providerStatus);
      }
    } else if (url.pathname === "/rest/v1/rpc/tc_admin_control") {
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
    } else if (url.pathname === "/rest/v1/rpc/tc_invoice_page") {
      if (body?.p_org !== org || controls.invoiceFailure) {
        status = 403;
        data = { message: "Synthetic access denied" };
      } else
        data = controls.invoiceRows
          .filter(
            (i) =>
              i.organization_id === body.p_org &&
              (!body.p_after || i.id > body.p_after),
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, 200);
    } else if (url.pathname === "/rest/v1/rpc/tc_tyre_page") {
      const a = access(identity!);
      if (
        controls.tyreDenied ||
        !a.active ||
        !a.features.maintenance ||
        body?.p_org !== org
      ) {
        status = 403;
        data = { code: "42501" };
      } else
        data = (
          body?.p_kind === "history"
            ? controls.tyreHistory.filter(
                (h) => !body.p_tyre || h.tyreId === body.p_tyre,
              )
            : controls.tyreRows
        )
          .filter(
            (r) =>
              r.organizationId === org &&
              (!body.p_after || r.id > String(body.p_after)),
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, 200);
    } else if (url.pathname === "/rest/v1/rpc/tc_save_tyre") {
      const a = access(identity!),
        old = controls.tyreRows.find((r) => r.id === body?.p_id);
      if (
        !a.active ||
        !a.can_write ||
        !a.features.maintenance ||
        body?.p_org !== org
      ) {
        status = 403;
        data = { code: "42501" };
      } else if (
        controls.conflict ||
        (old && old.version !== body?.p_expected)
      ) {
        status = 409;
        data = { code: "40001" };
      } else {
        const row: TyreRecord = {
          id: String(body?.p_id),
          organizationId: org,
          data: body?.p_data as TyreRecord["data"],
          version: (old?.version ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        };
        controls.tyreRows = controls.tyreRows
          .filter((r) => r.id !== row.id)
          .concat(row);
        controls.tyreHistory.push({
          id: crypto.randomUUID(),
          organizationId: org,
          tyreId: row.id,
          data: structuredClone(row.data),
          version: row.version,
          changedAt: row.updatedAt,
        });
        data = row;
      }
    } else if (url.pathname === "/rest/v1/rpc/tc_document_page") data = [];
    else if (url.pathname === "/rest/v1/rpc/tc_backup_page_v2")
      data = body?.p_kind === "documents" ? controls.backupDocuments : [];
    else if (
      /^\/storage\/v1\/object\/(?:authenticated\/)?truckcontrol-documents\//.test(
        url.pathname,
      )
    ) {
      await route.fulfill({
        status: 200,
        headers: { ...headers, "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.7\nOriginal ficticio de recuperacion\n%%EOF"),
      });
      return;
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
    else if (url.pathname === "/functions/v1/company-mail") {
      const a = access(identity!);
      if (!a.active || !a.features.gmail || body?.organization_id !== org) {
        status = 403;
        data = { error: "company_access_denied" };
      } else if (body.action === "status")
        data = {
          upload_ready: true,
          forwarding_ready: false,
          ai_enabled: a.features.invoice_ai && controls.invoiceAiEnabled,
          inbox: null,
        };
      else if (body.action === "invoice_ai_status")
        data = {
          enabled: controls.invoiceAiEnabled,
          states: controls.invoiceRows
            .filter((i) => (body.invoice_ids as string[]).includes(i.id))
            .map((i) => ({
              invoice_id: i.id,
              state:
                i.status === "approved"
                  ? "approved"
                  : controls.invoiceAiAttempted.has(i.id)
                    ? "attempted"
                    : "available",
              can_analyze:
                a.can_write &&
                a.features.invoice_ai &&
                i.status !== "approved" &&
                !controls.invoiceAiAttempted.has(i.id),
            })),
        };
      else if (body.action === "analyze_invoice") {
        const invoice = controls.invoiceRows.find(
          (i) => i.id === body.invoice_id,
        );
        if (!a.can_write || !a.features.invoice_ai || body.confirmed !== true) {
          status = 403;
          data = { error: "company_access_denied" };
        } else if (!controls.invoiceAiEnabled) {
          status = 503;
          data = { error: "invoice_ai_unavailable" };
        } else if (
          !invoice ||
          invoice.status === "approved" ||
          controls.invoiceAiAttempted.has(invoice.id)
        ) {
          status = 409;
          data = { error: "invoice_ai_already_attempted" };
        } else {
          controls.invoiceAiAttempted.add(invoice.id);
          if (controls.invoiceAiUncertain) {
            status = 502;
            data = { error: "invoice_ai_not_completed" };
          } else {
            Object.assign(invoice, {
              supplier: "Proveedor extraído ficticio",
              invoice_date: "2026-11-02",
              net_cents: 10000,
              tax_cents: 2100,
              total_cents: 12100,
              review_note:
                "Extracción ficticia de prueba. Revisa con el original.",
            });
            data = { analyzed: true };
          }
        }
      } else {
        status = 400;
        data = { error: "invalid_request" };
      }
    } else if (url.pathname === "/functions/v1/company-gmail")
      data = { oauth_ready: false, ai_enabled: false };
    else if (url.pathname === "/functions/v1/truckcontrol-subscriptions") {
      if (body?.action === "status") data = controls.recurring;
      else if (controls.recurringFailure) {
        status = 503;
        data = { error: "synthetic_provider_unavailable" };
      } else if (
        body?.action === "checkout" &&
        controls.recurring.configured &&
        body.terms_accepted === true &&
        body.terms_version === controls.recurring.terms_version &&
        catalog.payments_enabled &&
        !catalog.prices_are_examples
      )
        data = { url: controls.checkoutUrl };
      else if (body?.action === "cancel" || body?.action === "resume")
        data = { requested: true };
      else {
        status = 400;
        data = { error: "synthetic_request_rejected" };
      }
    } else {
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

async function personalMailFixture(
  page: Page,
  options: { delayed?: boolean; uncertain?: boolean } = {},
) {
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:4194",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
  const f = await fixtures(page);
  f.controls.companyRole = "viewer";
  f.controls.companyPlan = "limited";
  f.snapshot.customers[0].trial_plan_id = "limited";
  f.snapshot.customers[0].module_overrides = {
    gmail: false,
    invoice_ai: false,
  };
  const apiCalls: { path: string; method: string; body: unknown }[] = [];
  let sent = false;
  await page.route(
    "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-gmail/browser-config",
    (route) =>
      route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          client_id: "468881730124-synthetic.apps.googleusercontent.com",
          provider: "google",
          mode: "personal_browser",
        }),
      }),
  );
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__personalMailOptions=null;window.google={accounts:{oauth2:{initTokenClient(options){window.__personalMailOptions=options;return {requestAccessToken(){${options.delayed ? "" : "options.callback({access_token:'synthetic-personal-mail-token',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.modify'});"}}};},revoke(){throw new Error('Unexpected automatic revoke');}}}};`,
    }),
  );
  const message = (id = "abc001") => ({
    id,
    threadId: "thread001",
    labelIds: id === "sent001" ? ["SENT"] : ["INBOX", "UNREAD"],
    snippet: "Mensaje ficticio de correo personal",
    payload: {
      mimeType: "text/html",
      headers: [
        { name: "From", value: "sender@example.invalid" },
        { name: "To", value: "mailbox@example.invalid" },
        {
          name: "Subject",
          value:
            id === "sent001"
              ? "Mensaje de prueba personal"
              : "Correo personal ficticio",
        },
        { name: "Date", value: "Mon, 02 Nov 2026 08:00:00 +0100" },
        { name: "Message-ID", value: "<mail001@example.invalid>" },
      ],
      body: {
        data: Buffer.from(
          '<p>Contenido ficticio seguro</p><img src="https://mail-tracker.invalid/pixel"><script>window.mailInjected=true</script>',
        ).toString("base64url"),
      },
    },
  });
  await page.route(
    "https://gmail.googleapis.com/gmail/v1/users/me/**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors, body: "" });
        return;
      }
      apiCalls.push({
        path: url.pathname,
        method: request.method(),
        body: request.postDataJSON(),
      });
      let data: unknown;
      expect(request.headers().authorization).toBe(
        "Bearer synthetic-personal-mail-token",
      );
      expect(request.headers().apikey).toBeUndefined();
      if (url.pathname.endsWith("/profile"))
        data = { emailAddress: "mailbox@example.invalid" };
      else if (url.pathname.endsWith("/messages/send")) {
        sent = true;
        if (options.uncertain) {
          await route.fulfill({
            status: 503,
            headers: cors,
            contentType: "application/json",
            body: JSON.stringify({ error: "uncertain_synthetic" }),
          });
          return;
        }
        data = { id: "sent001" };
      } else if (url.pathname.endsWith("/messages"))
        data = {
          messages:
            url.searchParams.get("labelIds") === "SENT"
              ? sent
                ? [{ id: "sent001" }]
                : []
              : [{ id: "abc001" }],
        };
      else if (
        url.pathname.endsWith("/modify") ||
        url.pathname.endsWith("/trash") ||
        url.pathname.endsWith("/untrash")
      )
        data = { id: "abc001" };
      else data = message(url.pathname.split("/").at(-1));
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  return { ...f, apiCalls };
}

async function openPersonalMail(page: Page) {
  await login(page, "customer@example.com");
  await expect(page).toHaveURL(/#\/dashboard/);
  await page.evaluate(() => {
    location.hash = "/mailbox";
  });
  await page
    .getByRole("button", { name: "Preparar conexión con Google", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Entrar con Google", exact: true })
    .click();
}

async function openRecovery(page: Page) {
  await login(page, "customer@example.com");
  await expect(page).toHaveURL(/#\/dashboard/);
  await page.goto("/#/settings");
  await expect(
    page.getByRole("heading", {
      name: "Conserva registros y originales",
      exact: true,
    }),
  ).toBeVisible();
}

async function openProviders(page: Page) {
  await login(page, "pedidos@smartscaneuskadi.com");
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Servicios", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Servicios y conexiones", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Guardar Google de forma segura",
      exact: true,
    }),
  ).toBeEnabled();
}
test("el propietario importa Google en el panel sin guardar ni devolver el secreto al navegador", async ({
  page,
}) => {
  const f = await fixtures(page),
    secret = "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00000",
    clientId = "468881730124-synthetic-browser.apps.googleusercontent.com";
  await openProviders(page);
  await page.getByLabel("Importar JSON del cliente web Google").setInputFiles({
    name: "google.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        web: {
          project_id: "truckcontrolai",
          client_id: clientId,
          client_secret: secret,
          redirect_uris: ["https://truckcontrolai.com/gmail-callback"],
        },
      }),
    ),
  });
  await expect(
    page.getByLabel("ID del cliente web de TruckControl"),
  ).toHaveValue(clientId);
  await page
    .getByRole("button", {
      name: "Guardar Google de forma segura",
      exact: true,
    })
    .click();
  expect(
    f.calls.filter(
      (c) =>
        c.path.endsWith("tc_provider_control") &&
        c.body?.p_action === "set_google",
    ),
  ).toHaveLength(0);
  await page
    .getByLabel("Confirmo que guardaré la configuración de TruckControl")
    .check();
  await page
    .getByRole("button", {
      name: "Guardar Google de forma segura",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Credenciales guardadas" }),
  ).toBeVisible();
  await expect(page.getByLabel("Secreto nuevo de Google")).toHaveValue("");
  expect(JSON.stringify(f.controls.providerStatus)).not.toContain(secret);
  expect(
    await page.evaluate(
      (p) =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }).includes(p),
      secret,
    ),
  ).toBe(false);
  expect(
    f.calls.filter(
      (c) =>
        c.path.endsWith("tc_provider_control") &&
        c.body?.p_action === "set_google",
    ),
  ).toHaveLength(1);
  expect(f.calls.filter((c) => c.path.includes("functions/v1"))).toEqual([]);
});
test("el panel rechaza archivos ajenos y soporta ambos temas sin desbordarse", async ({
  page,
}, info) => {
  const f = await fixtures(page);
  await openProviders(page);
  await page.getByLabel("Importar JSON del cliente web Google").setInputFiles({
    name: "otro.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        web: {
          project_id: "fixpilot",
          client_id: "123-wrong.apps.googleusercontent.com",
          client_secret: "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000",
        },
      }),
    ),
  });
  await expect(page.locator(".provider-setup [role=alert]")).toContainText(
    "no corresponde",
  );
  expect(f.calls.some((c) => c.body?.p_action === "set_google")).toBe(false);
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await dialog.getByRole("radio", { name: theme, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    expect(
      (await new AxeBuilder({ page }).include(".provider-setup").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        `provider-${theme === "Fleet Light" ? "light" : "cockpit"}.png`,
      ),
    });
  }
});
test("el servidor rechaza a quien pierde administración y el cliente no ve este panel", async ({
  page,
}) => {
  const f = await fixtures(page);
  await openProviders(page);
  f.controls.providerDenied = true;
  await page
    .getByLabel("ID del cliente web de TruckControl")
    .fill("468881730124-synthetic-browser.apps.googleusercontent.com");
  await page
    .getByLabel("Secreto nuevo de Google")
    .fill("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00000");
  await page
    .getByLabel("Confirmo que guardaré la configuración de TruckControl")
    .check();
  await page
    .getByRole("button", {
      name: "Guardar Google de forma segura",
      exact: true,
    })
    .click();
  await expect(page.locator(".provider-setup [role=alert]")).toContainText(
    "No se ha guardado",
  );
  expect(f.controls.providerStatus.google.configured).toBe(false);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await login(page, "customer@example.com");
  await expect(page).toHaveURL(/#\/dashboard/);
  await expect(
    page.getByRole("button", { name: "Servicios", exact: true }),
  ).toHaveCount(0);
});

test("correo personal autoservicio: consulta sin Gmail/IA de empresa y envío confirmado", async ({
  page,
}, info) => {
  const f = await personalMailFixture(page);
  const trackers: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("mail-tracker.invalid"))
      trackers.push(request.url());
  });
  await openPersonalMail(page);
  await expect(
    page.getByRole("heading", { name: "mailbox@example.invalid", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button")
    .filter({ hasText: "Correo personal ficticio" })
    .click();
  await expect(page.locator(".personal-mail-text")).toContainText(
    "Contenido ficticio seguro",
  );
  expect(trackers).toEqual([]);
  expect(
    await page.evaluate(() =>
      Boolean((window as unknown as { mailInjected?: boolean }).mailInjected),
    ),
  ).toBe(false);
  expect(f.apiCalls.some((c) => c.path.endsWith("/modify"))).toBe(false);
  for (const [name, theme] of [
    ["Fleet Light", "light"],
    ["Fleet Cockpit", "cockpit"],
  ]) {
    await page
      .getByRole("button", { name: "Cambiar apariencia", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await dialog.getByRole("radio", { name, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    expect(
      (await new AxeBuilder({ page }).include(".personal-mail-page").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`personal-mail-${theme}.png`),
    });
  }
  await page.getByRole("button", { name: "Redactar", exact: true }).click();
  const composer = page.getByRole("dialog", { name: "Redactar correo" });
  await composer
    .getByLabel("Para", { exact: true })
    .fill("recipient@example.invalid");
  await composer
    .getByLabel("Asunto", { exact: true })
    .fill("Mensaje de prueba personal");
  await composer
    .getByLabel("Mensaje", { exact: true })
    .fill("Texto privado ficticio para el envío confirmado.");
  await composer.getByRole("button", { name: "Revisar envío" }).click();
  expect(
    f.apiCalls.filter((c) => c.path.endsWith("/messages/send")),
  ).toHaveLength(0);
  const confirmation = page.getByRole("dialog", { name: "Confirmar envío" });
  await confirmation.getByRole("button", { name: "Enviar ahora" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Google ha confirmado el envío." }),
  ).toBeVisible();
  expect(
    f.apiCalls.filter((c) => c.path.endsWith("/messages/send")),
  ).toHaveLength(1);
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(storage).not.toMatch(
    /synthetic-personal-mail-token|Texto privado ficticio|mailbox@example.invalid|recipient@example.invalid/,
  );
  expect(
    f.calls.some(
      (c) =>
        c.path.includes("company-assistant") ||
        c.path.includes("company-mail") ||
        c.path.includes("confirm_company_invoice"),
    ),
  ).toBe(false);
});

test("correo personal: un consentimiento tardío después de cerrar sesión no abre el buzón", async ({
  page,
}) => {
  const f = await personalMailFixture(page, { delayed: true });
  await openPersonalMail(page);
  await page.evaluate(() => {
    location.hash = "/settings";
  });
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.evaluate(() => {
    const w = window as unknown as {
      __personalMailOptions: { callback(response: unknown): void };
    };
    w.__personalMailOptions.callback({
      access_token: "synthetic-personal-mail-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/gmail.modify",
    });
  });
  await expect(
    page.getByRole("heading", { name: "mailbox@example.invalid", exact: true }),
  ).toHaveCount(0);
  expect(f.apiCalls).toHaveLength(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("synthetic-personal-mail-token");
});

test("correo personal: envío incierto bloqueado y recarga sin tokens ni mensajes privados", async ({
  page,
}) => {
  const f = await personalMailFixture(page, { uncertain: true });
  await openPersonalMail(page);
  await expect(
    page.getByRole("heading", { name: "mailbox@example.invalid", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redactar", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Redactar correo" });
  await dialog
    .getByLabel("Para", { exact: true })
    .fill("recipient@example.invalid");
  await dialog
    .getByLabel("Asunto", { exact: true })
    .fill("Envío incierto ficticio");
  await dialog
    .getByLabel("Mensaje", { exact: true })
    .fill("No repetir esta solicitud ficticia.");
  await dialog.getByRole("button", { name: "Revisar envío" }).click();
  await page
    .getByRole("dialog", { name: "Confirmar envío" })
    .getByRole("button", { name: "Enviar ahora" })
    .click();
  dialog = page.getByRole("dialog", { name: "Redactar correo" });
  await expect(
    dialog.getByText("Envío incierto.", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Revisar envío" }),
  ).toBeDisabled();
  expect(
    f.apiCalls.filter((c) => c.path.endsWith("/messages/send")),
  ).toHaveLength(1);
  page.on("dialog", (dialog) => dialog.accept());
  await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mi correo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "mailbox@example.invalid", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preparar conexión con Google" }),
  ).toBeVisible();
  expect(
    f.apiCalls.filter((c) => c.path.endsWith("/messages/send")),
  ).toHaveLength(1);
});

test("correo personal demo: enviar responder y papelera son ficticios y no alteran la empresa", async ({
  page,
}) => {
  const f = await fixtures(page);
  const external: string[] = [];
  page.on("request", (request) => {
    if (/googleapis\.com|accounts\.google\.com/.test(request.url()))
      external.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await page.evaluate(() => {
    location.hash = "/mailbox";
  });
  await page
    .getByRole("button", { name: "Abrir buzón ficticio", exact: true })
    .click();
  const before = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await page
    .getByRole("button")
    .filter({ hasText: "Revisión de mantenimiento · ejemplo ficticio" })
    .click();
  await page.getByRole("button", { name: "Responder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Redactar correo" });
  await expect(dialog.getByLabel("Para", { exact: true })).toHaveValue(
    "taller@example.invalid",
  );
  await dialog
    .getByLabel("Mensaje", { exact: true })
    .fill("Respuesta de demostración.");
  await dialog.getByRole("button", { name: "Revisar envío" }).click();
  await page
    .getByRole("button", { name: "Simular envío", exact: true })
    .click();
  await page.getByLabel("Carpeta", { exact: true }).selectOption("sent");
  await expect(page.locator(".personal-mail-list")).toContainText(
    "Re: Revisión de mantenimiento",
  );
  await page.getByLabel("Carpeta", { exact: true }).selectOption("inbox");
  await page
    .getByRole("button")
    .filter({ hasText: "Revisión de mantenimiento · ejemplo ficticio" })
    .click();
  await page.getByRole("button", { name: "Papelera", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Mover a papelera", exact: true })
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(page.locator(".personal-mail-reader")).toContainText(
    "Revisión de mantenimiento",
  );
  await page.getByRole("button", { name: "Papelera", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Mover a papelera", exact: true })
    .getByRole("button", { name: "Confirmar papelera", exact: true })
    .click();
  await page.getByLabel("Carpeta", { exact: true }).selectOption("trash");
  await page
    .getByRole("button")
    .filter({ hasText: "Revisión de mantenimiento · ejemplo ficticio" })
    .click();
  await page
    .getByRole("button", { name: "Sacar de papelera", exact: true })
    .click();
  await page.getByLabel("Carpeta", { exact: true }).selectOption("inbox");
  await expect(page.locator(".personal-mail-list")).toContainText(
    "Revisión de mantenimiento",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
  expect(
    f.calls.filter((call) => call.path !== "/rest/v1/rpc/tc_public_catalog"),
  ).toHaveLength(0);
  expect(external).toEqual([]);
});
async function downloadRecovery(page: Page) {
  const phrase = "Frase-ficticia-copia-2026";
  await page
    .getByLabel("Frase para cifrar la copia", { exact: true })
    .fill(phrase);
  await page
    .getByLabel("Repite la frase de la copia", { exact: true })
    .fill(phrase);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar copia cifrada", exact: true })
    .click();
  const downloaded = await pending;
  const text = await readFile((await downloaded.path())!, "utf8");
  return { text, phrase };
}
async function reviewRecovery(page: Page, text: string, phrase: string) {
  await page
    .getByLabel("Copia cifrada de esta empresa", { exact: true })
    .setInputFiles({
      name: "copia.truckcontrol",
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
  await page
    .getByLabel("Frase para abrir la copia", { exact: true })
    .fill(phrase);
  await page
    .getByRole("button", { name: "Comprobar recuperación", exact: true })
    .click();
}

test("recupera un original cifrado y verifica ambos temas sin escribir datos ni llamar proveedores", async ({
  page,
}, info) => {
  const f = await fixtures(page),
    original = Buffer.from(
      "%PDF-1.7\nOriginal ficticio de recuperacion\n%%EOF",
    ),
    id = "50000000-0000-4000-8000-000000000082";
  f.controls.backupDocuments.push({
    id,
    organization_id: org,
    name: "Original ficticio.pdf",
    object_path: `${org}/${id}/document.pdf`,
    content_type: "application/pdf",
    size_bytes: original.length,
    truck_id: "40000000-0000-4000-8000-000000000082",
    driver_id: null,
    created_at: stamp,
  });
  await openRecovery(page);
  const { text, phrase } = await downloadRecovery(page);
  expect(text).not.toContain("Empresa ficticia");
  expect(text).not.toContain(phrase);
  await reviewRecovery(page, text, phrase);
  const modal = page.getByRole("dialog", {
    name: "Comprobación de recuperación",
  });
  await expect(modal).toContainText("1 originales");
  await expect(
    modal.getByRole("button", { name: "Recuperar original", exact: true }),
  ).toBeDisabled();
  await modal
    .getByLabel("Confirmo que guardaré los originales en un lugar privado")
    .check();
  const pending = page.waitForEvent("download");
  await modal
    .getByRole("button", { name: "Recuperar original", exact: true })
    .click();
  const recovered = await pending;
  expect(
    createHash("sha256")
      .update(await readFile((await recovered.path())!))
      .digest("hex"),
  ).toBe(createHash("sha256").update(original).digest("hex"));
  await modal.getByRole("button", { name: "Cerrar comprobación" }).click();
  expect(
    await page.evaluate(
      (p) =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }).includes(p),
      phrase,
    ),
  ).toBe(false);
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page
      .getByRole("button", { name: "Cambiar apariencia", exact: true })
      .click();
    const appearance = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await appearance.getByRole("radio", { name: theme, exact: true }).check();
    await appearance
      .getByRole("button", { name: "Aplicar apariencia" })
      .click();
    await appearance.getByRole("button", { name: "Cerrar ventana" }).click();
    await expect(page.locator(".company-backup-card")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include(".company-backup-card").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        `company-backup-${theme === "Fleet Light" ? "light" : "cockpit"}.png`,
      ),
    });
  }
  expect(
    f.calls.filter((c) =>
      /tc_save_record|tc_book_record|approve_company_invoice|functions\/v1/.test(
        c.path,
      ),
    ),
  ).toEqual([]);
});

test("rechaza frases y empresas distintas sin restaurar sobre la cuenta actual", async ({
  page,
}) => {
  await fixtures(page);
  await openRecovery(page);
  const { text, phrase } = await downloadRecovery(page);
  await reviewRecovery(page, text, "Otra-frase-ficticia-2026");
  await expect(page.locator(".company-backup-card [role=alert]")).toContainText(
    "incorrecta",
  );
  const backup = await decryptCompanyBackup(text, phrase, org);
  backup.fleet.organization.id = "20000000-0000-4000-8000-000000000099";
  const foreign = await encryptCompanyBackup(backup, phrase);
  await reviewRecovery(page, foreign, phrase);
  await expect(page.locator(".company-backup-card [role=alert]")).toContainText(
    "otra empresa",
  );
  await expect(
    page.getByRole("dialog", { name: "Comprobación de recuperación" }),
  ).toHaveCount(0);
});

test("revocar administración impide exportar y un operador no muestra controles de recuperación", async ({
  page,
}) => {
  const f = await fixtures(page);
  await openRecovery(page);
  f.controls.companyRole = "operator";
  await page
    .getByLabel("Frase para cifrar la copia", { exact: true })
    .fill("Frase-ficticia-copia-2026");
  await page
    .getByLabel("Repite la frase de la copia", { exact: true })
    .fill("Frase-ficticia-copia-2026");
  await page
    .getByRole("button", { name: "Descargar copia cifrada", exact: true })
    .click();
  await expect(page.locator(".company-backup-card [role=alert]")).toContainText(
    "administradora activa",
  );
  expect(f.calls.some((c) => c.path.endsWith("tc_backup_page_v2"))).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".company-backup-card")).toHaveCount(0);
});

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

test("muestra los planes antes del registro y solicita acceso Básico sin cobrar", async ({
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
    .getByRole("button", { name: "Pedir acceso Básico", exact: true })
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
      name: "Solicitar acceso Básico",
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
  await page.getByRole("button", { name: "Editar plan Básico" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Precio mensual sin IVA (€)")
    .fill("345,67");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar plan" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(/345,67/).first()).toBeVisible();
  expect(f.snapshot.plans[0].monthly_cents).toBe(34567);
  await page.getByRole("checkbox", { name: /Precios de ejemplo/ }).check();
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
    .getByRole("button", { name: "Elegir Básico", exact: true })
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

test("los dos temas cubren todas las pestañas y formularios de administración", async ({
  page,
}) => {
  test.setTimeout(90000);
  await fixtures(page);
  await login(page, "pedidos@smartscaneuskadi.com");
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    const appearance = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await appearance.getByRole("radio", { name: theme, exact: true }).check();
    await appearance
      .getByLabel("Animaciones", { exact: true })
      .selectOption("off");
    await appearance
      .getByRole("button", { name: "Aplicar apariencia" })
      .click();
    await appearance.getByRole("button", { name: "Cerrar ventana" }).click();
    for (const tab of ["Clientes", "Módulos", "Planes y cobros", "Actividad"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      expect(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
        `${theme}: ${tab}`,
      ).toEqual([]);
    }
    await page.getByRole("button", { name: "Clientes", exact: true }).click();
    await page
      .getByRole("button", { name: "Gestionar Empresa ficticia SaaS" })
      .click();
    const dialog = page.getByRole("dialog");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
  }
});

test.describe("contratación y renovación mensual", () => {
  async function ready(page: Page, subscription = false) {
    const f = await fixtures(page);
    f.catalog.registration_open = false;
    f.catalog.payments_enabled = true;
    f.catalog.prices_are_examples = false;
    f.controls.recurring = {
      configured: true,
      management_available: true,
      terms_version: "synthetic-approved-v1",
      terms_url: "http://127.0.0.1:4194/legal/subscription",
      subscription: subscription
        ? {
            state: "active",
            plan_id: "limited",
            monthly_cents: 1000,
            currency: "EUR",
            period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
            cancel_at_period_end: false,
          }
        : null,
      invoices: [],
    };
    await login(page, "expired@example.com");
    await expect(
      page.getByRole("heading", { name: "Elige cómo quieres continuar" }),
    ).toBeVisible();
    return f;
  }
  test("exige aceptar la versión vigente y permite contratar con el registro público cerrado", async ({
    page,
  }) => {
    const f = await ready(page);
    const choose = page.getByRole("button", {
      name: "Elegir Básico",
      exact: true,
    });
    const terms = page.getByRole("checkbox", {
      name: /Acepto la renovación mensual/,
    });
    await expect(choose).toBeDisabled();
    await terms.check();
    await expect(choose).toBeEnabled();
    f.controls.recurring.terms_version = "synthetic-approved-v2";
    await page
      .getByRole("button", {
        name: "Comprobar estado de mi cuenta",
        exact: true,
      })
      .click();
    await expect(terms).not.toBeChecked();
    await expect(choose).toBeDisabled();
    expect(
      f.calls.filter(
        (c) =>
          c.path.endsWith("truckcontrol-subscriptions") &&
          c.body?.action === "checkout",
      ),
    ).toHaveLength(0);
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Pago simulado sin proveedor</h1>",
      }),
    );
    await terms.check();
    await choose.click();
    await expect(page).toHaveURL(
      /^https:\/\/checkout\.stripe\.com\/c\/pay\/synthetic/,
    );
    const checkout = f.calls.find(
      (c) =>
        c.path.endsWith("truckcontrol-subscriptions") &&
        c.body?.action === "checkout",
    );
    expect(checkout?.body).toMatchObject({
      terms_accepted: true,
      terms_version: "synthetic-approved-v2",
    });
    expect(checkout?.body).not.toHaveProperty("user_id");
    expect(checkout?.body).not.toHaveProperty("amount_cents");
  });
  test("mantiene la contratación bloqueada si la pasarela no está configurada", async ({
    page,
  }) => {
    const f = await ready(page);
    f.controls.recurring.configured = false;
    await page
      .getByRole("button", {
        name: "Comprobar estado de mi cuenta",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("La contratación mensual todavía no está disponible.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Elegir Básico", exact: true }),
    ).toBeDisabled();
    expect(f.calls.filter((c) => c.body?.action === "checkout")).toHaveLength(
      0,
    );
  });
  test("cancelar solicita confirmación y espera el estado del servidor sin activar acceso", async ({
    page,
  }) => {
    const f = await ready(page, true);
    await page
      .getByRole("button", { name: "Cancelar renovación", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Cancelar la renovación mensual",
    });
    await expect(dialog).toBeVisible();
    expect(f.calls.filter((c) => c.body?.action === "cancel")).toHaveLength(0);
    await dialog
      .getByRole("button", { name: "Confirmar cambio", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancelar renovación", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Elige cómo quieres continuar" }),
    ).toBeVisible();
    expect(f.calls.filter((c) => c.body?.action === "cancel")).toHaveLength(1);
    expect(
      f.calls.find((c) => c.body?.action === "cancel")?.body?.operation_id,
    ).toMatch(/^[0-9a-f-]{36}$/);
    f.controls.recurring.subscription!.cancel_at_period_end = true;
    await page
      .getByRole("button", { name: "Actualizar suscripción", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reactivar renovación", exact: true }),
    ).toBeVisible();
  });
  test("un fallo de cancelación se explica dentro del diálogo y conserva los datos", async ({
    page,
  }) => {
    const f = await ready(page, true);
    f.controls.recurringFailure = true;
    await page
      .getByRole("button", { name: "Cancelar renovación", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Cancelar la renovación mensual",
    });
    await dialog
      .getByRole("button", { name: "Confirmar cambio", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "No se ha podido confirmar el cambio",
    );
    await dialog.getByRole("button", { name: "Volver", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Cancelar renovación", exact: true }),
    ).toBeVisible();
    expect(f.controls.recurring.subscription!.cancel_at_period_end).toBe(false);
    expect(f.calls.some((c) => c.path.includes("delete"))).toBe(false);
  });
  test("rechaza un destino de pago ajeno y mantiene al usuario dentro de su cuenta", async ({
    page,
  }) => {
    const f = await ready(page);
    f.controls.checkoutUrl = "https://foreign.invalid/pay";
    await page
      .getByRole("checkbox", { name: /Acepto la renovación mensual/ })
      .check();
    await page
      .getByRole("button", { name: "Elegir Básico", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "No se ha recibido una página de pago válida",
    );
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:4194\//);
  });
  test("la nueva gestión mensual es accesible y se adapta a ambas pantallas", async ({
    page,
  }, testInfo) => {
    await ready(page, true);
    await expect(
      page.getByRole("region", { name: "Suscripción mensual" }),
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
    await page.screenshot({
      path: testInfo.outputPath("monthly-subscription.png"),
    });
  });
});

test("bandeja completa: más de 200 facturas, filtros, CSV y permiso de consulta", async ({
  page,
}) => {
  const f = await fixtures(page);
  f.controls.companyRole = "viewer";
  f.controls.invoiceRows = Array.from({ length: 205 }, (_, n) => ({
    id: `f6000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
    organization_id: org,
    message_id: `fictitious-${n}`,
    attachment_id: String(n),
    content_hash: (n + 1).toString(16).padStart(64, "0"),
    document_id: `f7000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
    supplier:
      n === 204 ? "Tálleres últimos · ficticio" : `Proveedor ficticio ${n}`,
    invoice_number: `TEST-${n}`,
    invoice_date: n === 204 ? "2026-10-31" : "2026-10-01",
    net_cents: n === 204 ? 10000 : null,
    tax_cents: n === 204 ? 2100 : null,
    total_cents: n === 204 ? 12100 : null,
    currency: "EUR",
    status: "needs_review",
    review_note: "",
    finance_entry_id: null,
    created_at: "2026-11-02T00:00:00Z",
    import_source: n === 204 ? "forwarded_email" : "file_upload",
  }));
  await login(page, "customer@example.com");
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/invoices";
  });
  const register = page.getByRole("region", {
    name: "Bandeja de facturas",
    exact: true,
  });
  await expect(register).toContainText("205 facturas en el filtro");
  await expect(register.locator("article.document-card")).toHaveCount(12);
  expect(
    f.calls
      .filter((c) => c.path === "/rest/v1/rpc/tc_invoice_page")
      .some((c) => Boolean(c.body?.p_after)),
  ).toBe(true);
  await register
    .getByLabel("Buscar factura", { exact: true })
    .fill("talleres ultimos");
  await expect(register.locator("article.document-card")).toHaveCount(1);
  await register
    .getByLabel("Filtrar origen de factura")
    .selectOption("forwarded_email");
  await register.getByLabel("Fecha de factura desde").fill("2026-10-31");
  await register.getByLabel("Fecha de factura hasta").fill("2026-10-31");
  await expect(
    register.getByRole("button", { name: "Revisar factura", exact: true }),
  ).toBeDisabled();
  const pending = page.waitForEvent("download");
  await register
    .getByRole("button", { name: "Exportar facturas", exact: true })
    .click();
  const download = await pending,
    stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  if (!stream) throw Error("Missing CSV download");
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2);
  expect(csv).toContain('"TEST-204"');
  expect(csv).toContain('"100,00";"21,00";"121,00"');
  expect(csv).not.toContain('"TEST-203"');
  await register.getByLabel("Fecha de factura desde").fill("2026-11-01");
  await expect(register.getByRole("alert")).toHaveText(
    "La fecha inicial no puede ser posterior a la final.",
  );
  await expect(
    register.getByRole("button", { name: "Exportar facturas", exact: true }),
  ).toBeDisabled();
  await register
    .getByRole("button", { name: "Restablecer filtros de facturas" })
    .click();
  await register.getByRole("button", { name: "Página siguiente" }).click();
  await expect(register).toContainText("Página 2 de 18");
  for (const theme of ["light", "cockpit"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
  }
  expect(f.calls.some((c) => c.path.includes("approve_company_invoice"))).toBe(
    false,
  );
  f.controls.invoiceFailure = true;
  await register.getByRole("button", { name: "Actualizar facturas" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /bandeja autorizada/ }),
  ).toBeVisible();
  await expect(register.locator("article.document-card")).toHaveCount(0);
});

function storedInvoiceForAi(n: number): CompanyInvoice {
  return {
    id: `e9000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    organization_id: org,
    message_id: `stored-ai-${n}`,
    attachment_id: String(n),
    content_hash: n.toString(16).padStart(64, "0"),
    document_id: `e9100000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    supplier: `Original guardado ficticio ${n}`,
    invoice_number: `GUARDADA-${n}`,
    invoice_date: null,
    net_cents: null,
    tax_cents: null,
    total_cents: null,
    currency: "EUR",
    status: "needs_review",
    review_note: "Sin extracción previa",
    finance_entry_id: null,
    created_at: stamp,
    import_source: "forwarded_email",
  };
}
test("lectura IA de factura guardada sin Gmail: permiso, confirmación, estado y sin gasto automático", async ({
  page,
}, testInfo) => {
  const f = await fixtures(page);
  Object.assign(f.snapshot.customers[0], { ai_allowed: true, ai_opt_in: true });
  f.snapshot.modules.find((m) => m.id === "invoice_ai")!.enabled = true;
  f.controls.invoiceRows = [storedInvoiceForAi(1)];
  await login(page, "customer@example.com");
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/invoices";
  });
  await expect(
    page.getByText(
      "La conexión Gmail está pendiente de activación por el administrador.",
      { exact: true },
    ),
  ).toBeVisible();
  const register = page.getByRole("region", {
    name: "Bandeja de facturas",
    exact: true,
  });
  const request = register.getByRole("button", {
    name: "Solicitar lectura IA",
    exact: true,
  });
  await expect(request).toBeEnabled();
  const stateRequests = f.calls.filter(
    (c) => c.body?.action === "invoice_ai_status",
  );
  expect(stateRequests.length).toBeGreaterThan(0);
  expect(
    stateRequests.every(
      (c) =>
        JSON.stringify(c.body?.invoice_ids) ===
        JSON.stringify([f.controls.invoiceRows[0].id]),
    ),
  ).toBe(true);
  await request.click();
  const modal = page.getByRole("dialog", {
    name: "Solicitar lectura IA del original",
  });
  await expect(modal).toContainText("no se registrará ningún gasto");
  expect(f.calls.some((c) => c.body?.action === "analyze_invoice")).toBe(false);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(f.calls.some((c) => c.body?.action === "analyze_invoice")).toBe(false);
  await request.click();
  await modal
    .getByRole("button", { name: "Confirmar lectura IA", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Lectura IA guardada" }),
  ).toBeVisible();
  await expect(
    register.getByRole("heading", {
      name: "Proveedor extraído ficticio",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    register.getByRole("button", { name: "Solicitar lectura IA", exact: true }),
  ).toBeDisabled();
  await expect(register).toContainText("Lectura IA ya solicitada");
  expect(
    f.calls.filter((c) => c.body?.action === "analyze_invoice"),
  ).toHaveLength(1);
  expect(f.calls.some((c) => c.path.includes("approve_company_invoice"))).toBe(
    false,
  );
  expect(f.controls.invoiceRows[0].finance_entry_id).toBeNull();
  expect(f.controls.invoiceRows[0].status).toBe("needs_review");
  expect(
    f.calls.find((c) => c.body?.action === "analyze_invoice")?.body,
  ).toEqual({
    action: "analyze_invoice",
    organization_id: org,
    invoice_id: f.controls.invoiceRows[0].id,
    confirmed: true,
  });
  await register
    .getByRole("button", { name: "Revisar factura", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Revisar y registrar factura",
  });
  await expect(review.getByLabel("Base sin IVA (€)")).toHaveValue("100,00");
  await review.getByRole("button", { name: "Cancelar", exact: true }).click();
  for (const theme of ["light", "cockpit"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`invoice-ai-${theme}.png`),
      fullPage: true,
    });
  }
});
test("lectura IA incierta no se repite; desactivar el consentimiento retira la acción", async ({
  page,
}) => {
  const f = await fixtures(page);
  Object.assign(f.snapshot.customers[0], { ai_allowed: true, ai_opt_in: true });
  f.snapshot.modules.find((m) => m.id === "invoice_ai")!.enabled = true;
  f.controls.invoiceRows = [storedInvoiceForAi(2)];
  f.controls.invoiceAiUncertain = true;
  await login(page, "customer@example.com");
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/invoices";
  });
  const register = page.getByRole("region", {
    name: "Bandeja de facturas",
    exact: true,
  });
  await expect(
    register.getByRole("button", { name: "Solicitar lectura IA", exact: true }),
  ).toBeEnabled();
  await register
    .getByRole("button", { name: "Solicitar lectura IA", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar lectura IA", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "No se ha podido confirmar el resultado" }),
  ).toBeVisible();
  await expect(
    register.getByRole("button", { name: "Solicitar lectura IA", exact: true }),
  ).toBeDisabled();
  expect(
    f.calls.filter((c) => c.body?.action === "analyze_invoice"),
  ).toHaveLength(1);
  await page
    .getByRole("checkbox", { name: /Usar lectura IA para mis facturas/ })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /Usar lectura IA para mis facturas/ }),
  ).not.toBeChecked();
  await expect(
    register.getByRole("button", { name: "Solicitar lectura IA", exact: true }),
  ).toHaveCount(0);
  await register.getByRole("button", { name: "Actualizar facturas" }).click();
  await expect(
    register.getByRole("button", { name: "Solicitar lectura IA", exact: true }),
  ).toHaveCount(0);
  expect(
    f.calls.filter((c) => c.body?.action === "analyze_invoice"),
  ).toHaveLength(1);
  expect(f.calls.some((c) => c.path.includes("approve_company_invoice"))).toBe(
    false,
  );
});

function storedTyre(n: number): TyreRecord {
  return {
    id: `ee100000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    organizationId: org,
    data: { ...emptyTyreData, code: `CUBIERTA-FICTICIA-${n}` },
    version: 1,
    updatedAt: stamp,
  };
}
test("neumáticos: montaje, mediciones, avisos, historial y retirada sin gastos", async ({
  page,
}, testInfo) => {
  const f = await fixtures(page);
  await login(page, "customer@example.com");
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/tyres";
  });
  await page
    .getByRole("button", { name: "Añadir neumático", exact: true })
    .click();
  let modal = page.getByRole("dialog", { name: "Añadir neumático" });
  await modal.getByLabel("Código o número de serie").fill("CUBIERTA-DEMO-1");
  await modal.getByLabel("Estado del neumático").selectOption("mounted");
  await modal
    .getByLabel("Camión del montaje")
    .selectOption("40000000-0000-4000-8000-000000000082");
  await modal.getByLabel("Posición del neumático").fill("Eje 1 izquierda");
  await modal.getByLabel("Fecha de medición").fill("2000-01-02");
  await modal.getByLabel("Dibujo medido (mm)").fill("1,5");
  await modal.getByLabel("Presión medida (bar)").fill("8,5");
  await modal.getByLabel("Umbral de dibujo (mm)").fill("2,0");
  await modal.getByLabel("Presión mínima configurada (bar)").fill("9,0");
  await modal.getByLabel("Presión máxima configurada (bar)").fill("10,0");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await modal
    .getByRole("button", { name: "Guardar neumático", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  let card = page.locator("article.tyre-card").filter({
    has: page.getByRole("heading", { name: "CUBIERTA-DEMO-1", exact: true }),
  });
  await expect(card).toContainText("8,5 bar");
  await expect(card).toContainText("1,5 mm");
  await expect(card).toContainText("Dibujo en el umbral");
  const save = f.calls.find((c) => c.path.endsWith("tc_save_tyre"));
  expect(save?.body?.p_org).toBe(org);
  expect((save?.body?.p_data as Record<string, unknown>).pressureKpa).toBe(850);
  expect((save?.body?.p_data as Record<string, unknown>).treadTenthsMm).toBe(
    15,
  );
  await page.evaluate(() => {
    location.hash = "/alerts";
  });
  const alert = page
    .locator(".operation-alert")
    .filter({ hasText: "Dibujo en el umbral" });
  await expect(alert).toContainText("Medición manual");
  await alert.getByRole("button", { name: "Revisado", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "/tyres";
  });
  await card
    .getByRole("button", { name: "Editar neumático", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Editar neumático" });
  await modal.getByLabel("Presión medida (bar)").fill("9,5");
  await modal
    .getByRole("button", { name: "Guardar neumático", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  for (const theme of ["light", "cockpit"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`tyres-${theme}.png`) });
  }
  await card
    .getByRole("button", { name: "Ver historial", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Historial de CUBIERTA-DEMO-1" });
  await expect(modal).toContainText("Versión 2");
  await expect(modal).toContainText("Versión 1");
  await expect(modal).toContainText("8,5 bar");
  await expect(modal).toContainText("9,5 bar");
  await modal.getByRole("button", { name: "Cerrar ventana" }).click();
  await card
    .getByRole("button", { name: "Editar neumático", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Editar neumático" });
  await modal.getByLabel("Estado del neumático").selectOption("retired");
  await modal
    .getByRole("button", { name: "Guardar neumático", exact: true })
    .click();
  await expect(card).toContainText("Retirado");
  expect(f.controls.tyreRows[0].data.truckId).toBeNull();
  expect(f.controls.tyreHistory).toHaveLength(3);
  await page
    .getByRole("combobox", { name: "Filtrar estado de neumáticos" })
    .selectOption("retired");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar neumáticos", exact: true })
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("truckcontrol-neumaticos.csv");
  expect(await readFile((await file.path())!, "utf8")).toContain(
    "CUBIERTA-DEMO-1",
  );
  expect(f.calls.some((c) => c.path.endsWith("tc_book_record"))).toBe(false);
});
test("neumáticos: consulta sin edición y módulo revocado no muestra datos", async ({
  page,
}) => {
  const f = await fixtures(page);
  f.controls.companyRole = "viewer";
  f.controls.tyreRows = [storedTyre(1)];
  f.controls.tyreHistory = [
    {
      id: crypto.randomUUID(),
      organizationId: org,
      tyreId: storedTyre(1).id,
      data: storedTyre(1).data,
      version: 1,
      changedAt: stamp,
    },
  ];
  await login(page, "customer@example.com");
  await page.evaluate(() => {
    location.hash = "/tyres";
  });
  await expect(
    page.getByRole("heading", { name: "CUBIERTA-FICTICIA-1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Añadir neumático", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Editar neumático", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ver historial", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Versión 1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar ventana" })
    .click();
  f.snapshot.modules.find((m) => m.id === "maintenance")!.enabled = false;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "CUBIERTA-FICTICIA-1", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Neumáticos", exact: true }),
  ).toHaveCount(0);
  expect(f.calls.some((c) => c.path.endsWith("tc_save_tyre"))).toBe(false);
});
test("neumáticos: conflicto conserva el formulario y una revocación retira la lista", async ({
  page,
}) => {
  const f = await fixtures(page);
  f.controls.tyreRows = [storedTyre(2)];
  f.controls.conflict = true;
  await login(page, "customer@example.com");
  await page.evaluate(() => {
    location.hash = "/tyres";
  });
  await page
    .getByRole("button", { name: "Editar neumático", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Editar neumático" });
  await modal
    .getByLabel("Notas del neumático")
    .fill("Conservar este borrador ficticio");
  await modal
    .getByRole("button", { name: "Guardar neumático", exact: true })
    .click();
  await expect(modal.getByRole("alert")).toContainText("Otro dispositivo");
  await expect(modal.getByLabel("Notas del neumático")).toHaveValue(
    "Conservar este borrador ficticio",
  );
  expect(f.calls.filter((c) => c.path.endsWith("tc_save_tyre"))).toHaveLength(
    1,
  );
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  f.controls.tyreDenied = true;
  await page
    .getByRole("button", { name: "Actualizar neumáticos", exact: true })
    .click();
  await expect(page.locator("article.tyre-card")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("No tienes acceso");
});
test("neumáticos demo: copia con historial y recarga sin peticiones de empresa", async ({
  page,
}) => {
  const f = await fixtures(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await page.evaluate(() => {
    location.hash = "/tyres";
  });
  await page
    .getByRole("button", { name: "Añadir neumático", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Añadir neumático" });
  await modal
    .getByLabel("Código o número de serie")
    .fill("DEMO-STOCK-SIN-MEDICIONES");
  await modal
    .getByRole("button", { name: "Guardar neumático", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "DEMO-STOCK-SIN-MEDICIONES",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await page.evaluate(() => {
    location.hash = "/tyres";
  });
  await expect(
    page.getByRole("heading", {
      name: "DEMO-STOCK-SIN-MEDICIONES",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!).demoTyresV1
          .history.length,
    ),
  ).toBe(1);
  expect(
    f.calls.some(
      (c) => c.path.includes("tc_tyre_") || c.path.endsWith("tc_save_tyre"),
    ),
  ).toBe(false);
  await page.evaluate(() => {
    location.hash = "/settings";
  });
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar copia de registros", exact: true })
    .click();
  const file = await pending;
  const backup = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(backup.version).toBe(2);
  expect(backup.tyres.rows[0].data.code).toBe("DEMO-STOCK-SIN-MEDICIONES");
  expect(backup.tyres.history).toHaveLength(1);
  await page
    .getByRole("button", { name: "Restablecer demostración", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sí, restablecer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "/tyres";
  });
  await expect(
    page.getByRole("heading", {
      name: "DEMO-STOCK-SIN-MEDICIONES",
      exact: true,
    }),
  ).toHaveCount(0);
});
