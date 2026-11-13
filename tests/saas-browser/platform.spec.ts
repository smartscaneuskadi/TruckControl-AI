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
import { disabledFiscalPolicy } from "../../src/domain/company-fiscal";
import type {
  CompanyFiscalState,
  FiscalPolicyInput,
  FiscalProfileInput,
} from "../../src/domain/company-fiscal";
import type { TyreRecord, TyreHistory } from "../../src/domain/tyres";
import { emptyTyreData } from "../../src/domain/tyres";
import type { CopilotAction, CopilotTurn } from "../../src/domain/copilot";
import { specialistProfiles } from "../../src/domain/ai-specialists";
import type {
  SpecialistTurn,
  SpecialistJobs,
} from "../../src/domain/ai-specialists";
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
function fiscalState(
  id = org,
  name = "Empresa ficticia SaaS",
): CompanyFiscalState {
  return {
    schema_version: 1,
    phase: "preparation",
    emission_available: false,
    organization_id: id,
    organization_name: name,
    policy: {
      ...structuredClone(disabledFiscalPolicy),
      version: null,
      updated_at: null,
    },
    profile: null,
    configured_option_allowed: false,
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
    googleCredentialResult: "accepted" as "accepted" | "rejected" | "unavailable",
    googleRuntimeCredentialResult: "accepted" as "accepted" | "rejected" | "unavailable",
    googleCompanyReady: false,
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
    commercialBackupFailure: false,
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
      invoice_delivery_ready: false,
      management_available: false,
      terms_version: null,
      terms_url: null,
      subscription: null,
      invoices: [],
    } as RecurringStatus,
    recurringFailure: false,
    checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic",
    fiscalDenied: false,
    fiscalConflict: false,
    fiscalInvalidEmission: false,
    fiscal: new Map<string, CompanyFiscalState>([[org, fiscalState()]]),
    additionalOrganizations: [] as { id: string; name: string }[],
    copilotConfigured: true,
    copilotDenied: false,
    copilotConflict: false,
    copilotChatUncertain: false,
    copilotExecuteUncertain: false,
    copilotWrongCompany: false,
    copilotReply: "He preparado una propuesta para revisar.",
    copilotDrafts: [] as CopilotAction[],
    copilotActions: new Map<string, CopilotAction>(),
    copilotTurns: new Map<string, CopilotTurn>(),
    copilotAppliedWrites: 0,
    specialistsAvailable: false,
    specialistWrongProfile: false,
    specialistTurns: new Map<string, SpecialistTurn>(),
    specialistPreferences: new Map<string, SpecialistJobs>(),
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
    ) {
      const current = access(identity ?? customerId);
      const selected = String(body?.p_org ?? org);
      data =
        url.pathname.endsWith("tc_organization_access") &&
        controls.additionalOrganizations.some((o) => o.id === selected)
          ? {
              ...current,
              organization_id: selected,
              profile: current.profile
                ? {
                    ...current.profile,
                    company_name: controls.additionalOrganizations.find(
                      (o) => o.id === selected,
                    )!.name,
                  }
                : null,
            }
          : current;
    } else if (url.pathname === "/rest/v1/rpc/tc_company_fiscal_control") {
      const action = body?.p_action,
        company = String(body?.p_org ?? ""),
        current = controls.fiscal.get(company);
      if (controls.fiscalDenied) {
        status = 403;
        data = { code: "42501" };
      } else if (action === "admin_list" && identity === admin) {
        const rows = [...controls.fiscal.values()]
          .sort((a, b) => a.organization_id.localeCompare(b.organization_id))
          .filter(
            (r) => !body?.p_after || r.organization_id > String(body.p_after),
          );
        data = {
          items: rows.slice(0, 50),
          next_cursor: rows.length > 50 ? rows[49].organization_id : null,
        };
      } else if (action === "admin_set" && identity === admin && current) {
        if (controls.fiscalConflict) {
          status = 409;
          data = { code: "40001" };
        } else {
          const input = body!.p_data as FiscalPolicyInput;
          current.policy = {
            ...structuredClone(input),
            version: (current.policy.version ?? 0) + 1,
            updated_at: stamp,
          };
          current.configured_option_allowed = Boolean(
            current.profile &&
            input.enabled &&
            input.options[current.profile.regime] &&
            (current.profile.document_format === "pdf" ||
              input.options.facturae),
          );
          data = structuredClone(current);
        }
      } else if (
        (action === "status" || action === "save") &&
        identity === customerId &&
        [org, ...controls.additionalOrganizations.map((o) => o.id)].includes(
          company,
        ) &&
        ["owner", "admin"].includes(controls.companyRole) &&
        current
      ) {
        if (action === "save") {
          const input = body!.p_data as FiscalProfileInput;
          if (controls.fiscalConflict) {
            status = 409;
            data = { code: "40001" };
          } else if (
            !current.policy.enabled ||
            !current.policy.options[input.regime] ||
            (input.document_format === "facturae" &&
              !current.policy.options.facturae)
          ) {
            status = 403;
            data = { code: "42501" };
          } else {
            current.profile = {
              ...input,
              version: (current.profile?.version ?? 0) + 1,
              updated_at: stamp,
            };
            current.configured_option_allowed = true;
            data = structuredClone(current);
          }
        } else
          data = {
            ...structuredClone(current),
            ...(controls.fiscalInvalidEmission
              ? { emission_available: true }
              : {}),
          };
      } else {
        status = 403;
        data = { code: "42501" };
      }
    } else if (url.pathname === "/rest/v1/rpc/tc_provider_control") {
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
    else if (url.pathname === "/rest/v1/rpc/tc_commercial_backup_page") {
      const a = access(identity!);
      const kind = body?.p_kind;
      if (controls.commercialBackupFailure) {
        status = 503;
        data = { code: "PGRST202" };
      } else if (
        !a.active ||
        !a.can_manage ||
        body?.p_org !== org ||
        (kind === "suppliers" ? !a.features.expenses :
          !a.features.trips || !a.features.profitability ||
          !a.features.income || !a.features.expenses)
      ) {
        status = 403;
        data = { code: "42501" };
      } else if (!["suppliers", "trip_links", "trip_reviews"].includes(String(kind))) {
        status = 400;
        data = { code: "23514" };
      } else data = {
        schema_version: 1, organization_id: org, kind, rows: [],
      };
    }
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
              ...controls.additionalOrganizations,
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
    } else if (url.pathname === "/rest/v1/rpc/tc_company_specialists") {
      const company = String(body?.p_org ?? ""),
        action = body?.p_action,
        input = body?.p_data as Record<string, unknown>,
        a = access(identity ?? customerId);
      const own =
        company === org ||
        controls.additionalOrganizations.some((o) => o.id === company);
      const allowed = Boolean(
        a.active &&
        a.features.assistant &&
        a.features.document_ai &&
        a.profile?.ai_allowed &&
        a.profile.ai_opt_in,
      );
      if (!controls.specialistsAvailable) data = null;
      else if (!own || !allowed || controls.copilotDenied) {
        status = 403;
        data = {
          code: "42501",
          message: "Synthetic specialist permission denied",
        };
      } else if (action === "status")
        data = {
          schema_version: 2,
          organization_id: company,
          profiles: specialistProfiles.map((p) => ({
            id: p.id,
            allowed:
              p.requiresAny.length === 0 ||
              p.requiresAny.some((k) => a.features[k]),
            connection_verified: true,
            verified_at: "2026-11-07T06:00:00Z",
          })),
        };
      else if (action === "documents")
        data = {
          organization_id: company,
          partial: false,
          documents: controls.backupDocuments.map((d) => ({
            id: d.id,
            name: d.name,
            content_type: d.content_type,
            size_bytes: d.size_bytes,
          })),
        };
      else if (action === "result")
        data = controls.specialistTurns.get(String(input.request_id)) ?? null;
      else if (
        ["jobs_status", "jobs_save", "jobs_run"].includes(String(action))
      ) {
        const profile = String(input.profile),
          key = company + ":" + profile;
        const previous =
          controls.specialistPreferences.get(key) ??
          ({
            organization_id: company,
            profile,
            paid_model_calls: 0,
            scheduler_ready: true,
            preference: {
              enabled: false,
              cadence: "daily",
              version: 0,
              next_run_at: null,
            },
            jobs: [],
          } as SpecialistJobs);
        if (action === "jobs_save") {
          if (input.expected_version !== previous.preference.version) {
            status = 409;
            data = { code: "40001", message: "Synthetic preference conflict" };
          } else {
            previous.preference = {
              enabled: Boolean(input.enabled),
              cadence: input.cadence === "weekly" ? "weekly" : "daily",
              version: previous.preference.version + 1,
              next_run_at: new Date().toISOString(),
            };
            controls.specialistPreferences.set(key, previous);
            data = previous;
          }
        } else if (action === "jobs_run") {
          if (!previous.preference.enabled) {
            status = 403;
            data = { code: "42501", message: "Not opted in" };
          } else {
            if (!previous.jobs.length)
              previous.jobs.push({
                id: crypto.randomUUID(),
                state: "complete",
                attempts: 1,
                scheduled_for: "2026-11-07",
                summary: {
                  kind: "database_rules",
                  paid_model_calls: 0,
                  statistics: {
                    values: { maintenance: { overdue: 2, open: 3 } },
                  },
                },
                created_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                error_code: null,
              });
            controls.specialistPreferences.set(key, previous);
            data = previous;
          }
        } else data = previous;
      } else {
        status = 400;
        data = {
          code: "23514",
          message: "Unknown synthetic specialist action",
        };
      }
    } else if (url.pathname === "/functions/v1/company-copilot/specialists") {
      const company = String(body?.organization_id ?? ""),
        profile = String(body?.profile ?? ""),
        a = access(identity ?? customerId);
      const allowed = Boolean(
        a.active &&
        a.features.assistant &&
        a.features.document_ai &&
        a.profile?.ai_allowed &&
        a.profile.ai_opt_in,
      );
      const own =
        company === org ||
        controls.additionalOrganizations.some((o) => o.id === company);
      if (
        !controls.specialistsAvailable ||
        !own ||
        !allowed ||
        controls.copilotDenied
      ) {
        status = 403;
        data = { error: "ai_permission_required" };
      } else {
        const id = String(body?.request_id),
          existing = controls.specialistTurns.get(id);
        if (existing) data = existing;
        else {
          const actions = controls.copilotDrafts.map((d) => ({
            ...structuredClone(d),
            id: crypto.randomUUID(),
            organization_id: company,
          }));
          for (const task of actions)
            controls.copilotActions.set(task.id, task);
          const isDocument =
            profile === "documents" &&
            Array.isArray(body?.document_ids) &&
            body.document_ids.length > 0;
          const turn = {
            request_id: id,
            organization_id: company,
            profile: controls.specialistWrongProfile ? "drivers" : profile,
            state: "complete",
            reply: controls.copilotReply,
            actions,
            sources: [
              {
                reference: isDocument ? "D1" : "R1",
                kind: isDocument ? "document" : "truck",
                id: isDocument
                  ? String((body!.document_ids as unknown[])[0])
                  : "30000000-0000-4000-8000-000000000091",
                version: isDocument ? null : 1,
                title: isDocument
                  ? "Documento seleccionado ficticio"
                  : "Camión de la empresa de prueba",
              },
            ],
            uncertainties: ["No hay telemetría GPS en estos registros."],
          } as SpecialistTurn;
          controls.specialistTurns.set(id, turn);
          data = turn;
          if (controls.copilotChatUncertain) {
            await route.abort("failed");
            return;
          }
        }
      }
    } else if (url.pathname === "/functions/v1/company-copilot") {
      const company = String(body?.organization_id ?? ""),
        a = access(identity ?? customerId);
      const own =
        company === org ||
        controls.additionalOrganizations.some((o) => o.id === company);
      const allowed = Boolean(
        a.active &&
        a.features.assistant &&
        a.features.document_ai &&
        a.profile?.ai_allowed &&
        a.profile.ai_opt_in,
      );
      if (!own || controls.copilotDenied) {
        status = 403;
        data = { error: "permission_changed" };
      } else if (body?.action === "status")
        data = {
          schema_version: 1,
          organization_id: company,
          allowed,
          can_write: a.can_write,
          configured: controls.copilotConfigured,
        };
      else if (!allowed) {
        status = 403;
        data = { error: "ai_permission_required" };
      } else if (body?.action === "chat") {
        const id = String(body.request_id),
          existing = controls.copilotTurns.get(id);
        if (existing) data = existing;
        else {
          const actions = controls.copilotDrafts.map((d) => ({
            ...structuredClone(d),
            id: crypto.randomUUID(),
            organization_id: controls.copilotWrongCompany
              ? "20000000-0000-4000-8000-000000000099"
              : company,
          }));
          for (const task of actions)
            controls.copilotActions.set(task.id, task);
          const turn: CopilotTurn = {
            request_id: id,
            organization_id: controls.copilotWrongCompany
              ? "20000000-0000-4000-8000-000000000099"
              : company,
            state: "complete",
            reply: controls.copilotReply,
            actions,
          };
          controls.copilotTurns.set(id, turn);
          data = turn;
          if (controls.copilotChatUncertain) {
            await route.abort("failed");
            return;
          }
        }
      } else {
        status = 400;
        data = { error: "invalid_request" };
      }
    } else if (url.pathname === "/rest/v1/rpc/tc_company_copilot") {
      const company = String(body?.p_org ?? ""),
        action = body?.p_action,
        input = body?.p_data as Record<string, unknown>,
        a = access(identity ?? customerId);
      const own =
        company === org ||
        controls.additionalOrganizations.some((o) => o.id === company);
      if (
        !own ||
        controls.copilotDenied ||
        !a.active ||
        !a.profile?.ai_allowed ||
        !a.profile.ai_opt_in
      ) {
        status = 403;
        data = { code: "42501", message: "Synthetic permission denied" };
      } else if (action === "list")
        data = {
          schema_version: 1,
          organization_id: company,
          actions: [...controls.copilotActions.values()].filter(
            (t) =>
              t.organization_id === company &&
              t.state === "pending" &&
              Date.parse(t.expires_at) > Date.now(),
          ),
        };
      else if (action === "result")
        data = controls.copilotTurns.get(String(input.request_id)) ?? null;
      else {
        const task = controls.copilotActions.get(String(input?.id));
        if (
          !task ||
          task.organization_id !== company ||
          (action !== "task" && !a.can_write)
        ) {
          status = 403;
          data = { code: "42501", message: "Synthetic action denied" };
        } else if (action === "task") data = task;
        else if (controls.copilotConflict) {
          status = 409;
          data = { code: "40001", message: "Synthetic stale record" };
        } else if (action === "execute") {
          if (task.state !== "applied") {
            controls.copilotAppliedWrites++;
            task.state = "applied";
            task.applied_at = new Date().toISOString();
            if (
              [
                "customers",
                "trailers",
                "trips",
                "maintenance",
                "fuel",
                "deadlines",
                "alerts",
              ].includes(task.entity)
            )
              records.set(task.record_id, {
                id: task.record_id,
                kind: task.entity,
                data: task.fields,
                version: (task.expected_version ?? 0) + 1,
                financeEntryId: null,
              });
          }
          data = task;
          if (controls.copilotExecuteUncertain) {
            await route.abort("failed");
            return;
          }
        } else if (action === "cancel") {
          task.state = "cancelled";
          data = task;
        } else {
          status = 400;
          data = { code: "23514" };
        }
      }
    } else if (url.pathname === "/functions/v1/company-gmail") {
      if (["validate_configuration", "check_configuration"].includes(String(body?.action))) {
        const result = body?.action === "validate_configuration" ? controls.googleCredentialResult : controls.googleRuntimeCredentialResult;
        if (identity !== admin || controls.providerDenied) {
          status = 403;
          data = { error: "admin_required" };
        } else if (result !== "accepted") {
          status = result === "rejected" ? 422 : 503;
          data = { error: result === "rejected" ? "google_client_rejected" : "google_validation_unavailable" };
        } else data = { credential_validation: 1, status: "accepted", scope: "client_authentication_only", mailbox_connected: false };
      } else if (body?.action === "start" && controls.googleCompanyReady) {
        status = 503;
        data = { error: "google_client_rejected" };
      } else data = { oauth_ready: controls.googleCompanyReady, ai_enabled: false };
    }
    else if (url.pathname === "/functions/v1/truckcontrol-subscriptions") {
      if (body?.action === "status") data = controls.recurring;
      else if (controls.recurringFailure) {
        status = 503;
        data = { error: "synthetic_provider_unavailable" };
      } else if (
        body?.action === "checkout" &&
        controls.recurring.configured &&
        controls.recurring.invoice_delivery_ready &&
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
  const mailControl = { denied: false };
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
      if (mailControl.denied) {
        await route.fulfill({
          status: 403,
          headers: cors,
          contentType: "application/json",
          body: JSON.stringify({ error: "permission_removed" }),
        });
        return;
      }
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
  return { ...f, apiCalls, mailControl };
}

async function openPersonalMail(page: Page) {
  await login(page, "customer@example.com");
  await expect(page).toHaveURL(/#\/dashboard/);
  await page.evaluate(() => {
    location.hash = "/mailbox/gmail";
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
test("Gmail: comprueba credenciales antes de guardar y conserva la configuración cuando Google rechaza la candidata", async ({ page }) => {
  const f = await fixtures(page);
  f.controls.googleCredentialResult = "rejected";
  await openProviders(page);
  await page.getByLabel("ID del cliente web de TruckControl").fill("468881730124-synthetic-browser.apps.googleusercontent.com");
  await page.getByLabel("Secreto nuevo de Google").fill("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00000");
  await page.getByLabel("Confirmo que guardaré la configuración de TruckControl").check();
  await page.getByRole("button", { name: "Guardar Google de forma segura", exact: true }).click();
  await expect(page.locator(".provider-setup [role=alert]")).toContainText("Google rechaza las credenciales");
  expect(f.calls.filter((c) => c.body?.p_action === "set_google")).toHaveLength(0);
  expect(f.controls.providerStatus.google.configured).toBe(false);
  expect(f.calls.filter((c) => c.body?.action === "validate_configuration")).toHaveLength(1);
});

test("Gmail: comprueba la configuración guardada y rellena el ID público sin pedir copiarlo otra vez", async ({ page }) => {
  const f = await fixtures(page);
  f.controls.providerStatus.google = { client_id: "468881730124-synthetic-browser.apps.googleusercontent.com", id_valid: true, secret_valid: false, configured: false, vault_available: true, connections: 0 };
  f.controls.googleRuntimeCredentialResult = "rejected";
  await openProviders(page);
  await expect(page.getByLabel("ID del cliente web de TruckControl")).toHaveValue(f.controls.providerStatus.google.client_id!);
  await expect(page.getByRole("button", { name: "Comprobar credenciales con Google", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Comprobar credenciales con Google", exact: true }).click();
  await expect(page.locator(".provider-setup [role=alert]")).toContainText("Google rechaza las credenciales");
  expect(f.calls.some((c) => c.body?.p_action === "set_google")).toBe(false);
  await expect(page.getByLabel("Secreto nuevo de Google")).toHaveValue("");
});

test("Gmail: no declara éxito si la configuración se guarda pero el runtime sigue rechazado", async ({ page }) => {
  const f = await fixtures(page);
  f.controls.googleRuntimeCredentialResult = "rejected";
  await openProviders(page);
  await page.getByLabel("ID del cliente web de TruckControl").fill("468881730124-synthetic-browser.apps.googleusercontent.com");
  await page.getByLabel("Secreto nuevo de Google").fill("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00000");
  await page.getByLabel("Confirmo que guardaré la configuración de TruckControl").check();
  await page.getByRole("button", { name: "Guardar Google de forma segura", exact: true }).click();
  await expect(page.locator(".provider-setup [role=alert]")).toContainText("se ha guardado, pero su comprobación ha fallado");
  await expect(page.getByLabel("Secreto nuevo de Google")).toHaveValue("");
  expect(f.calls.filter((c) => c.body?.p_action === "set_google")).toHaveLength(1);
  await expect(page.getByRole("status").filter({ hasText: "Credenciales guardadas" })).toHaveCount(0);
});

test("cuenta visible: cierra sesión desde la barra, impide volver con Atrás y permite entrar como administrador", async ({ page }, info) => {
  const f = await fixtures(page);
  await login(page, "customer@example.com");
  await expect(page).toHaveURL(/#\/dashboard/);
  const account = page.getByRole("button", { name: "Cuenta y acceso", exact: true });
  await expect(account).toBeInViewport();
  await account.click();
  const dialog = page.getByRole("dialog", { name: "Cuenta y acceso", exact: true });
  await expect(dialog).toContainText("customer@example.com");
  await dialog.getByRole("button", { name: "Cerrar sesión", exact: true }).evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(page.getByRole("heading", { name: "Bienvenido a TruckControl", exact: true })).toBeVisible();
  expect(f.calls.filter((c) => c.path.includes("/auth/v1/logout"))).toHaveLength(1);
  await page.goBack();
  await expect(page.locator(".sidebar, .data-table")).toHaveCount(0);
  await openProviders(page);
  await expect(page.getByRole("heading", { name: "Servicios y conexiones", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("account-to-provider-administration.png") });
});

test("cuenta visible: el administrador vuelve desde la demo a Servicios sin cerrar ni sustituir su sesión", async ({ page }) => {
  const f = await fixtures(page);
  await openProviders(page);
  await page.getByRole("button", { name: "Ver demo de flota", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveCount(1);
  await page.getByRole("button", { name: "Cuenta y acceso", exact: true }).click();
  const account = page.getByRole("dialog", { name: "Cuenta y acceso", exact: true });
  await expect(account).toContainText("pedidos@smartscaneuskadi.com");
  await account.getByRole("button", { name: "Acceso de empresas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tu centro de administración", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Servicios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Servicios y conexiones", exact: true })).toBeVisible();
  expect(f.calls.filter((c) => c.path.includes("/auth/v1/logout"))).toHaveLength(0);
});

test("cuenta visible: el acceso permanece dentro de 320 a 1440 píxeles y conserva los cuatro idiomas", async ({ page }, info) => {
  await fixtures(page);
  await login(page, "customer@example.com");
  await expect(page).toHaveURL(/#\/dashboard/);
  for (const width of [320, 393, 600, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const account = page.getByRole("button", { name: "Cuenta y acceso", exact: true });
    await expect(account).toBeInViewport();
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  for (const [language, title] of [["en", "Account and sign-in"], ["ro", "Cont și acces"], ["fr", "Compte et accès"], ["es", "Cuenta y acceso"]]) {
    await page.locator(".language-switcher select").selectOption(language);
    await page.getByRole("button", { name: title, exact: true }).click();
    const account = page.getByRole("dialog", { name: title, exact: true });
    await expect(account).toBeVisible();
    await expect(account).toContainText("customer@example.com");
    await page.keyboard.press("Escape");
    await expect(account).toHaveCount(0);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole("button", { name: "Cuenta y acceso", exact: true }).click();
  expect((await new AxeBuilder({ page }).include(".account-controls").analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("account-mobile.png") });
});

test("Gmail: salir del panel durante la comprobación no guarda credenciales con una respuesta tardía", async ({ page }) => {
  const f = await fixtures(page);
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const observed = new Promise<void>((resolve) => { started = resolve; });
  await page.route("http://127.0.0.1:9999/functions/v1/company-gmail", async (route) => {
    if (route.request().method() !== "POST" || route.request().postDataJSON()?.action !== "validate_configuration") { await route.fallback(); return; }
    started(); await blocked;
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4194" }, body: JSON.stringify({ credential_validation: 1, status: "accepted", scope: "client_authentication_only", mailbox_connected: false }) });
  });
  await openProviders(page);
  await page.getByLabel("ID del cliente web de TruckControl").fill("468881730124-synthetic-browser.apps.googleusercontent.com");
  await page.getByLabel("Secreto nuevo de Google").fill("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00000");
  await page.getByLabel("Confirmo que guardaré la configuración de TruckControl").check();
  await page.getByRole("button", { name: "Guardar Google de forma segura", exact: true }).click();
  await observed;
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  const response = page.waitForResponse((r) => r.url().includes("/functions/v1/company-gmail") && r.request().method() === "POST");
  release(); await (await response).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(f.calls.some((c) => c.body?.p_action === "set_google")).toBe(false);
});
test("la administración global explica el enlace de Gmail de empresa y limpia el retorno", async ({
  page,
}, info) => {
  const f = await fixtures(page);
  await openProviders(page);
  const notice = page.getByRole("alert", {
    name: "Acceso al correo de empresa",
  });
  await page.evaluate(() => {
    location.hash = "/invoices";
  });
  await expect(notice).toContainText("Estás en la administración global");
  await expect(notice).toContainText("misma cuenta y empresa");
  await expect(page).toHaveURL(/\/$/);
  await notice
    .getByRole("button", { name: "Cerrar aviso", exact: true })
    .click();
  const fakeTicket = "synthetic-capability-only-".padEnd(43, "x");
  await page.evaluate((value) => {
    location.hash = `/invoices?gmail_ticket=${value}`;
  }, fakeTicket);
  await expect(notice).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("body")).not.toContainText(fakeTicket);
  await notice
    .getByRole("button", { name: "Cerrar aviso", exact: true })
    .click();
  await page.goto(`/?return-test=1#/invoices?gmail_ticket=${fakeTicket}`);
  await expect(notice).toBeVisible();
  await expect(page).toHaveURL(/\?return-test=1$/);
  await expect(
    page.getByRole("heading", {
      name: "Tu centro de administración",
      exact: true,
    }),
  ).toBeVisible();
  for (const theme of ["light", "cockpit"]) {
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    const appearance = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await appearance
      .getByRole("radio", {
        name: theme === "light" ? "Fleet Light" : "Fleet Cockpit",
        exact: true,
      })
      .check();
    await appearance
      .getByRole("button", { name: "Aplicar apariencia" })
      .click();
    await appearance.getByRole("button", { name: "Cerrar ventana" }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .include('[aria-label="Acceso al correo de empresa"]')
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await notice.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`global-admin-gmail-${theme}.png`),
    });
  }
  expect(f.calls.some((c) => c.path === "/functions/v1/company-gmail")).toBe(
    false,
  );
  expect(
    f.calls.some(
      (c) =>
        c.path.endsWith("/tc_provider_control") &&
        c.body?.p_action !== "status",
    ),
  ).toBe(false);
});

test("las credenciales preparadas no se presentan como un buzón de empresa conectado", async ({
  page,
}, info) => {
  const f = await fixtures(page);
  Object.assign(f.controls.providerStatus.google, {
    client_id: "468881730124-synthetic-browser.apps.googleusercontent.com",
    id_valid: true,
    secret_valid: true,
    configured: true,
    connections: 0,
  });
  await openProviders(page);
  const card = page.locator(".settings-card").filter({
    has: page.getByRole("heading", {
      name: "Credenciales de Gmail empresarial",
      exact: true,
    }),
  });
  await expect(card).toContainText("Configuración guardada");
  await expect(card).toContainText("Vínculos de empresa registrados: 0");
  const readiness = page.getByRole("region", {
    name: "Vinculación de buzones de empresa",
  });
  await expect(readiness.getByRole("status")).toHaveText(
    "Ningún buzón de empresa vinculado.",
  );
  await readiness
    .getByText("Preparar la prueba de facturas", { exact: true })
    .click();
  await expect(readiness).toContainText("últimos 30 días");
  await expect(readiness).toContainText("últimos 12 meses");
  await expect(
    readiness.getByRole("link", {
      name: "Consultar revisión de permisos en Google",
    }),
  ).toHaveAttribute(
    "href",
    "https://console.cloud.google.com/auth/verification?project=468881730124",
  );
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await dialog.getByRole("radio", { name: theme, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    const contrast = await readiness
      .locator("details li")
      .first()
      .evaluate((element) => {
        const rgb = (text: string) => (text.match(/[\d.]+/g) ?? []).map(Number);
        const foreground = rgb(getComputedStyle(element).color);
        let background: number[] | undefined;
        for (
          let parent: Element | null = element;
          parent;
          parent = parent.parentElement
        ) {
          const color = rgb(getComputedStyle(parent).backgroundColor);
          if (color.length >= 3 && (color[3] ?? 1) >= 0.99) {
            background = color;
            break;
          }
        }
        if (!background) throw Error("Opaque card background not found");
        const luminance = (color: number[]) =>
          color
            .slice(0, 3)
            .map((v) => {
              const x = v / 255;
              return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
        const light = luminance(foreground),
          dark = luminance(background);
        return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(
      (await new AxeBuilder({ page }).include(".provider-setup").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await readiness.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(
        `gmail-readiness-${theme === "Fleet Light" ? "light" : "cockpit"}.png`,
      ),
    });
  }
  const pendingDownload = page.waitForEvent("download");
  await readiness
    .getByRole("link", { name: "Descargar factura ficticia", exact: true })
    .click();
  const download = await pendingDownload;
  const samplePath = info.outputPath("factura-ficticia.pdf");
  await download.saveAs(samplePath);
  const sample = await readFile(samplePath);
  expect(sample.subarray(0, 5).toString()).toBe("%PDF-");
  expect(sample.toString("ascii")).toContain("SIN VALIDEZ FISCAL");
  f.controls.providerStatus.google.connections = 1;
  await page
    .getByRole("button", { name: "Comprobar servicios", exact: true })
    .click();
  await expect(readiness.getByRole("status")).toContainText(
    "1 vínculo de empresa registrado",
  );
  await expect(readiness.getByRole("status")).toContainText(
    "Comprueba el estado individual",
  );
  await expect(
    page.getByLabel("Importar JSON del cliente web Google"),
  ).toBeDisabled();
  expect(f.calls.some((c) => c.body?.p_action === "set_google")).toBe(false);
});

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
  expect(f.calls.filter((c) => c.path.includes("functions/v1")).map((c) => c.body?.action)).toEqual([
    "validate_configuration", "check_configuration",
  ]);
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
  const afterSendRefresh = page.waitForResponse(
    (response) =>
      response
        .url()
        .startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        ) && response.request().method() === "GET",
  );
  await confirmation.getByRole("button", { name: "Enviar ahora" }).click();
  await afterSendRefresh;
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
  await expect(
    page.getByRole("button", { name: "Actualizar buzón", exact: true }),
  ).toBeEnabled();
  f.mailControl.denied = true;
  await page
    .getByRole("button", { name: "Actualizar buzón", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "mailbox@example.invalid", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".personal-mail-reader")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Entrar con Google", exact: true }),
  ).toBeVisible();
});

test("correo personal: un consentimiento tardío después de cerrar sesión no abre el buzón", async ({
  page,
}) => {
  const f = await personalMailFixture(page, { delayed: true });
  await openPersonalMail(page);
  let finishLogout: () => Promise<void> = async () => {};
  let signalLogout!: () => void;
  const logoutStarted = new Promise<void>((resolve) => {
    signalLogout = resolve;
  });
  await page.route("http://127.0.0.1:9999/auth/v1/logout**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    finishLogout = () =>
      route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:4194",
          "content-type": "application/json",
        },
        body: "{}",
      });
    signalLogout();
  });
  await page.evaluate(() => {
    const w = window as typeof window & { __personalProfileStarts: number };
    w.__personalProfileStarts = 0;
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.href;
      if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/"))
        w.__personalProfileStarts++;
      return original(input, options);
    };
  });
  await page.evaluate(() => {
    location.hash = "/settings";
  });
  await page
    .locator("main")
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await logoutStarted;
  const initiated = await page.evaluate(() => {
    const w = window as unknown as {
      __personalMailOptions: { callback(response: unknown): void };
      __personalProfileStarts: number;
    };
    w.__personalMailOptions.callback({
      access_token: "synthetic-personal-mail-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/gmail.modify",
    });
    return w.__personalProfileStarts;
  });
  expect(initiated).toBe(0);
  await finishLogout();
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
    location.hash = "/mailbox/gmail";
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
  const exported = await decryptCompanyBackup(text, phrase, org);
  expect(exported.version).toBe(4);
  expect(exported.coverage.suppliers).toBe(true);
  expect(exported.suppliers).toEqual([]);
  expect(exported.tripFinanceLinks).toEqual([]);
  expect(exported.tripFinanceReviews).toEqual([]);
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


test("la copia rechaza un backend comercial ausente antes de descargar originales", async ({ page }) => {
  const f = await fixtures(page);
  await openRecovery(page);
  f.controls.commercialBackupFailure = true;
  await page.getByLabel("Frase para cifrar la copia", { exact: true }).fill("Frase-ficticia-copia-2026");
  await page.getByLabel("Repite la frase de la copia", { exact: true }).fill("Frase-ficticia-copia-2026");
  await page.getByRole("button", { name: "Descargar copia cifrada", exact: true }).click();
  await expect(page.locator(".company-backup-card [role=alert]")).toContainText("No se ha generado una copia parcial");
  expect(f.calls.some((c) => c.path.startsWith("/storage/v1/object/"))).toBe(false);
  expect(f.calls.some((c) => /functions\/v1/.test(c.path))).toBe(false);
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
  test("cerrar sesión bloquea la clave offline y conserva únicamente la copia cifrada", async ({ page, context }) => {
    await prepare(page);
    const encryptedBefore = await page.evaluate(() => new Promise<string>((resolve, reject) => {
      const r = indexedDB.open("truckcontrol-encrypted-offline-v1", 1);
      r.onsuccess = () => {
        const tx = r.result.transaction("vaults", "readonly");
        const q = tx.objectStore("vaults").getAll();
        tx.oncomplete = () => { resolve(JSON.stringify(q.result)); r.result.close(); };
      };
      r.onerror = () => reject(r.error);
    }));
    const open = page.getByRole("button", { name: "Abrir menú", exact: true });
    if (await open.isVisible()) await open.click();
    await page.getByRole("complementary", { name: "Navegación principal" })
      .getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.locator(".offline-workspace-banner")).toHaveCount(0);
    await context.setOffline(true);
    await page.evaluate(() => { location.hash = "/trucks"; });
    await expect(page.locator("body")).not.toContainText("8888 TST");
    await page.getByRole("button", { name: "Abrir copia sin conexión", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Acceso sin conexión" });
    await expect(dialog.getByLabel("Frase de desbloqueo", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Copia guardada")).toHaveCount(1);
    await expect(page.locator(".offline-workspace-banner")).toHaveCount(0);
    const encryptedAfter = await page.evaluate(() => new Promise<string>((resolve, reject) => {
      const r = indexedDB.open("truckcontrol-encrypted-offline-v1", 1);
      r.onsuccess = () => {
        const tx = r.result.transaction("vaults", "readonly");
        const q = tx.objectStore("vaults").getAll();
        tx.oncomplete = () => { resolve(JSON.stringify(q.result)); r.result.close(); };
      };
      r.onerror = () => reject(r.error);
    }));
    expect(encryptedAfter).toBe(encryptedBefore);
    expect(encryptedAfter).not.toContain("customer@example.com");
    expect(encryptedAfter).not.toContain("8888 TST");
  });
  test("cerrar sesión desde otra pestaña bloquea una copia ya abierta sin perder su cola", async ({ page, context }) => {
    const f = await prepare(page);
    await context.setOffline(true);
    await page.reload();
    await openAndEdit(page, f.phrase);
    await context.setOffline(false);
    const other = await context.newPage();
    await fixtures(other);
    await other.goto("/");
    await other.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(other.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    // Restoring the same user's shared session must not lock an explicitly unlocked copy.
    await expect(page.locator(".offline-workspace-banner")).toBeVisible();
    const open = other.getByRole("button", { name: "Abrir menú", exact: true });
    if (await open.isVisible()) await open.click();
    await other.getByRole("complementary", { name: "Navegación principal" })
      .getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(other.getByLabel("Contraseña", { exact: true })).toBeVisible();
    // This notification is emitted by the real SDK through its browser channel.
    await expect(page.locator(".offline-workspace-banner")).toHaveCount(0);
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Cliente offline ficticio");
    expect(await page.evaluate(() => localStorage.getItem("truckcontrol-auth-v1"))).toBeNull();
    expect(f.records.size).toBe(0);
    expect(f.calls.some((call) => call.path.endsWith("/tc_save_record"))).toBe(false);
    const encrypted = await page.evaluate(() => new Promise<string>((resolve, reject) => {
      const r = indexedDB.open("truckcontrol-encrypted-offline-v1", 1);
      r.onsuccess = () => {
        const tx = r.result.transaction("vaults", "readonly");
        const q = tx.objectStore("vaults").getAll();
        tx.oncomplete = () => { resolve(JSON.stringify(q.result)); r.result.close(); };
      };
      r.onerror = () => reject(r.error);
    }));
    expect(JSON.parse(encrypted)).toHaveLength(1);
    expect(encrypted).not.toContain("Cliente offline ficticio");
    expect(encrypted).not.toContain(f.phrase);
    await other.close();
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

test("publica los datos fiscales completos del proveedor antes del alta y en el aviso legal", async ({
  page,
}, testInfo) => {
  const f = await fixtures(page);
  await page.goto("/");
  const details = page.getByRole("region", {
    name: "Datos de facturación del servicio",
  });
  await expect(details).toContainText("ELEVADANCOR S.L.");
  await expect(details).toContainText("B02993426");
  await expect(details).toContainText(
    "Polígono Arzabalza, n.º 50, 20400 Tolosa",
  );
  await expect(
    details.getByRole("link", { name: "pedidos@smartscaneuskadi.com" }),
  ).toHaveAttribute("href", "mailto:pedidos@smartscaneuskadi.com");
  await expect(details).not.toContainText("Empresa ficticia SaaS");
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
    await details.scrollIntoViewIfNeeded();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await details.screenshot({
      path: testInfo.outputPath(
        `billing-issuer-${theme.replace(" ", "-")}.png`,
      ),
    });
  }
  for (const document of ["notice", "privacy"]) {
    await page.goto(`/?legal=${document}`);
    await expect(page.locator("main")).toContainText("20400 Tolosa");
    await expect(page.locator("main")).toContainText("B02993426");
  }
  expect(
    f.calls.some(
      (c) =>
        c.body?.action === "checkout" || c.path.endsWith("/tc_request_plan"),
    ),
  ).toBe(false);
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
      invoice_delivery_ready: true,
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
  test("muestra emisor y comprador y bloquea compras sin proceso fiscal manual verificado", async ({
    page,
  }) => {
    const f = await ready(page);
    f.controls.recurring.invoice_delivery_ready = false;
    await page
      .getByRole("button", {
        name: "Comprobar estado de mi cuenta",
        exact: true,
      })
      .click();
    const details = page.getByRole("region", {
      name: "Datos de facturación del servicio",
    });
    await expect(details).toContainText("ELEVADANCOR S.L.");
    await expect(details).toContainText("20400 Tolosa");
    await expect(details).toContainText("Empresa prueba finalizada");
    await expect(details).toContainText("DEMO-TEST");
    await expect(details).toContainText("GDTaller");
    await expect(details).toContainText("TicketBAI");
    await expect(details).toContainText("expired@example.com");
    await expect(details).toContainText("proceso fiscal y el envío de facturas estén verificados");
    await expect(
      page.getByRole("button", { name: "Elegir Básico", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Elegir Full", exact: true }),
    ).toBeDisabled();
    expect(
      f.calls.some(
        (c) =>
          c.body?.action === "checkout" || c.path.endsWith("/tc_request_plan"),
      ),
    ).toBe(false);
  });
  test("no considera listo un backend anterior que omite el estado de facturación", async ({
    page,
  }) => {
    const f = await ready(page);
    Reflect.deleteProperty(f.controls.recurring, "invoice_delivery_ready");
    await page
      .getByRole("button", {
        name: "Comprobar estado de mi cuenta",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: "Datos de facturación del servicio" }),
    ).toContainText("proceso fiscal y el envío de facturas estén verificados");
    await expect(
      page.getByRole("button", { name: "Elegir Básico", exact: true }),
    ).toBeDisabled();
    expect(f.calls.some((c) => c.body?.action === "checkout")).toBe(false);
  });
  test("una factura pendiente de configurar no impide cancelar renovaciones existentes", async ({
    page,
  }) => {
    const f = await ready(page, true);
    f.controls.recurring.invoice_delivery_ready = false;
    await page
      .getByRole("button", {
        name: "Comprobar estado de mi cuenta",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Cancelar renovación", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Cancelar la renovación mensual" })
      .getByRole("button", { name: "Confirmar cambio", exact: true })
      .click();
    expect(f.calls.filter((c) => c.body?.action === "cancel")).toHaveLength(1);
    f.controls.recurring.subscription!.cancel_at_period_end = true;
    await page
      .getByRole("button", { name: "Actualizar suscripción", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reactivar renovación", exact: true }),
    ).toBeDisabled();
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

test.describe("configuración fiscal por empresa", () => {
  function enable(state: CompanyFiscalState) {
    state.policy = {
      enabled: true,
      options: {
        ticketbai: true,
        verifactu: true,
        no_verifactu: true,
        external: true,
        facturae: true,
      },
      version: 1,
      updated_at: stamp,
    };
  }
  async function settings(page: Page) {
    await login(page, "customer@example.com");
    await expect(page).toHaveURL(/#\/dashboard/);
    await page.evaluate(() => {
      location.hash = "/settings";
    });
    return page.getByRole("region", {
      name: "Opciones de facturación de la empresa",
    });
  }
  test("la administración habilita opciones para una empresa y conserva el perfil al revocar", async ({
    page,
  }) => {
    const f = await fixtures(page),
      state = f.controls.fiscal.get(org)!;
    state.policy.version = 1;
    state.policy.updated_at = stamp;
    state.profile = {
      regime: "ticketbai",
      territory: "gipuzkoa",
      document_format: "pdf",
      version: 1,
      updated_at: stamp,
    };
    const second = "20000000-0000-4000-8000-000000000099";
    f.controls.fiscal.set(
      second,
      fiscalState(second, "Otra empresa fiscal ficticia"),
    );
    await login(page, "pedidos@smartscaneuskadi.com");
    await page
      .getByRole("button", { name: "Facturación de empresas", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Permisos fiscales de Empresa ficticia SaaS",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Permisos fiscales de la empresa",
    });
    await dialog
      .getByRole("checkbox", {
        name: "Habilitar configuración fiscal para esta empresa",
        exact: true,
      })
      .check();
    await expect(
      dialog.getByRole("button", {
        name: "Guardar permisos fiscales",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog.getByRole("checkbox", { name: /^Permitir TicketBAI/ }).check();
    await dialog
      .getByRole("checkbox", { name: /^Permitir Formato Facturae/ })
      .check();
    await dialog
      .getByRole("button", { name: "Guardar permisos fiscales", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(state.policy).toMatchObject({
      enabled: true,
      options: {
        ticketbai: true,
        verifactu: false,
        no_verifactu: false,
        external: false,
        facturae: true,
      },
      version: 2,
    });
    expect(f.controls.fiscal.get(second)!.policy.enabled).toBe(false);
    expect(state.emission_available).toBe(false);
    await page
      .getByRole("button", {
        name: "Permisos fiscales de Empresa ficticia SaaS",
        exact: true,
      })
      .click();
    await dialog
      .getByRole("checkbox", {
        name: "Habilitar configuración fiscal para esta empresa",
        exact: true,
      })
      .uncheck();
    await dialog
      .getByRole("button", { name: "Guardar permisos fiscales", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(state.profile).toMatchObject({
      regime: "ticketbai",
      territory: "gipuzkoa",
      version: 1,
    });
    expect(state.policy.enabled).toBe(false);
    const calls = f.calls.filter(
      (c) =>
        c.path.endsWith("tc_company_fiscal_control") &&
        c.body?.p_action === "admin_set",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toMatchObject({ p_org: org, p_expected: 1 });
    expect(Object.keys(calls[0].body!.p_data as object).sort()).toEqual([
      "enabled",
      "options",
    ]);
  });
  test("la empresa guarda TicketBAI, las modalidades AEAT y programa externo sin emitir ni contabilizar", async ({
    page,
  }) => {
    const f = await fixtures(page);
    enable(f.controls.fiscal.get(org)!);
    const card = await settings(page);
    await expect(
      card.getByRole("button", {
        name: "Guardar configuración fiscal",
        exact: true,
      }),
    ).toBeDisabled();
    await card
      .getByLabel("Sistema de facturación", { exact: true })
      .selectOption("ticketbai");
    await card
      .getByLabel("Hacienda foral TicketBAI", { exact: true })
      .selectOption("gipuzkoa");
    await card
      .getByLabel("Formato previsto", { exact: true })
      .selectOption("facturae");
    await card
      .getByRole("button", {
        name: "Guardar configuración fiscal",
        exact: true,
      })
      .click();
    await expect(card.getByRole("status")).toContainText(
      "Configuración guardada",
    );
    await page.reload();
    await expect(
      card.getByLabel("Hacienda foral TicketBAI", { exact: true }),
    ).toHaveValue("gipuzkoa");
    await expect(
      card.getByLabel("Formato previsto", { exact: true }),
    ).toHaveValue("facturae");
    for (const regime of ["verifactu", "no_verifactu", "external"]) {
      await card
        .getByLabel("Sistema de facturación", { exact: true })
        .selectOption(regime);
      await expect(
        card.getByLabel("Hacienda foral TicketBAI", { exact: true }),
      ).toHaveCount(0);
      await card
        .getByRole("button", {
          name: "Guardar configuración fiscal",
          exact: true,
        })
        .click();
      await expect(card.getByRole("status")).toContainText(
        "Configuración guardada",
      );
    }
    expect(f.controls.fiscal.get(org)!.profile).toMatchObject({
      regime: "external",
      territory: null,
      version: 4,
    });
    expect(f.records.size).toBe(0);
    expect(
      f.calls.some(
        (c) =>
          c.body?.action === "checkout" ||
          c.path.includes("tc_approve_invoice"),
      ),
    ).toBe(false);
    const stored = await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].join(
        "\n",
      ),
    );
    expect(stored).not.toContain('"territory":"gipuzkoa"');
  });
  test("opciones sin habilitar, retirada de permisos y respuesta de emisión falsa mantienen el bloqueo", async ({
    page,
  }) => {
    const f = await fixtures(page),
      card = await settings(page);
    await expect(
      card.getByLabel("Sistema de facturación", { exact: true }),
    ).toBeDisabled();
    enable(f.controls.fiscal.get(org)!);
    f.controls.fiscal.get(org)!.policy.options.ticketbai = false;
    await card
      .getByRole("button", {
        name: "Actualizar configuración fiscal",
        exact: true,
      })
      .click();
    await expect(
      card.getByLabel("Sistema de facturación", { exact: true }),
    ).toBeEnabled();
    await expect(card.locator('option[value="ticketbai"]')).toBeDisabled();
    f.controls.fiscalInvalidEmission = true;
    await card
      .getByRole("button", {
        name: "Actualizar configuración fiscal",
        exact: true,
      })
      .click();
    await expect(card.getByRole("alert")).toContainText(
      "No se puede comprobar",
    );
    await expect(card).toContainText("Estado sin comprobar");
    await expect(
      card.getByLabel("Sistema de facturación", { exact: true }),
    ).toHaveCount(0);
    f.controls.fiscalInvalidEmission = false;
    f.controls.fiscalDenied = true;
    await card
      .getByRole("button", {
        name: "Actualizar configuración fiscal",
        exact: true,
      })
      .click();
    await expect(card.getByRole("alert")).toContainText(
      "No se puede comprobar",
    );
    expect(f.calls.some((c) => c.body?.p_action === "save")).toBe(false);
  });
  test("operador y consulta no muestran formularios ni consultan la configuración reservada", async ({
    page,
  }) => {
    const f = await fixtures(page);
    f.controls.companyRole = "operator";
    const card = await settings(page);
    await expect(card).toContainText("propietario o administrador");
    await expect(
      card.getByLabel("Sistema de facturación", { exact: true }),
    ).toHaveCount(0);
    f.controls.companyRole = "viewer";
    await page.reload();
    await expect(card).toContainText("propietario o administrador");
    expect(
      f.calls.some((c) => c.path.endsWith("tc_company_fiscal_control")),
    ).toBe(false);
  });
  test("un retorno tardío no mezcla la configuración al cambiar de empresa", async ({
    page,
  }) => {
    const f = await fixtures(page),
      second = "20000000-0000-4000-8000-000000000099";
    enable(f.controls.fiscal.get(org)!);
    f.controls.additionalOrganizations.push({
      id: second,
      name: "Segunda empresa fiscal ficticia",
    });
    const other = fiscalState(second, "Segunda empresa fiscal ficticia");
    enable(other);
    other.profile = {
      regime: "external",
      territory: null,
      document_format: "pdf",
      version: 1,
      updated_at: stamp,
    };
    other.configured_option_allowed = true;
    f.controls.fiscal.set(second, other);
    let release: (() => void) | undefined,
      started = false,
      hold = false,
      completed = false;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/rest/v1/rpc/tc_company_fiscal_control",
      async (route) => {
        const body = route.request().postDataJSON();
        if (
          body.p_action === "status" &&
          body.p_org === org &&
          hold &&
          !started
        ) {
          started = true;
          await delayed;
          try {
            await route.fulfill({
              contentType: "application/json",
              headers: {
                "Access-Control-Allow-Origin": "http://127.0.0.1:4194",
              },
              body: JSON.stringify(f.controls.fiscal.get(org)),
            });
          } catch {
            /* The old scoped request was aborted. */
          } finally {
            completed = true;
          }
        } else await route.fallback();
      },
    );
    const card = await settings(page);
    await expect(
      card.getByLabel("Sistema de facturación", { exact: true }),
    ).toBeEnabled();
    hold = true;
    await card
      .getByRole("button", {
        name: "Actualizar configuración fiscal",
        exact: true,
      })
      .click();
    await expect.poll(() => started).toBe(true);
    await page
      .getByLabel("Empresa activa", { exact: true })
      .selectOption(second);
    await expect(card).toContainText("Segunda empresa fiscal ficticia");
    await expect(
      card.getByLabel("Sistema de facturación", { exact: true }),
    ).toHaveValue("external");
    release!();
    await expect.poll(() => completed).toBe(true);
    await expect(
      card.getByLabel("Sistema de facturación", { exact: true }),
    ).toHaveValue("external");
    expect(f.calls.some((c) => c.body?.p_action === "save")).toBe(false);
  });
  test("conexión fiscal accesible en los dos temas y sin credenciales en Android y Windows", async ({
    page,
  }, testInfo) => {
    const f = await fixtures(page);
    enable(f.controls.fiscal.get(org)!);
    const card = await settings(page);
    await card
      .getByLabel("Sistema de facturación", { exact: true })
      .selectOption("ticketbai");
    for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
      await page
        .getByRole("button", { name: "Cambiar apariencia", exact: true })
        .first()
        .click();
      const appearance = page.getByRole("dialog", {
        name: "Apariencia de TruckControl",
      });
      await appearance.getByRole("radio", { name: theme, exact: true }).check();
      await appearance
        .getByLabel("Animaciones", { exact: true })
        .selectOption("off");
      await appearance
        .getByRole("button", { name: "Aplicar apariencia", exact: true })
        .click();
      await appearance
        .getByRole("button", { name: "Cerrar ventana", exact: true })
        .click();
      await card.scrollIntoViewIfNeeded();
      expect(
        (
          await new AxeBuilder({ page })
            .include(".company-fiscal-card")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await card.screenshot({
        path: testInfo.outputPath(`fiscal-${theme.replace(" ", "-")}.png`),
      });
    }
    await expect(card.getByLabel(/clave|contraseña|certificado/i)).toHaveCount(
      0,
    );
    await expect(card).toContainText("Todavía no se emiten facturas fiscales");
  });
  test("el panel fiscal conserva contraste y controles al editar permisos en los dos temas", async ({
    page,
  }, testInfo) => {
    await fixtures(page);
    await login(page, "pedidos@smartscaneuskadi.com");
    await page
      .getByRole("button", { name: "Facturación de empresas", exact: true })
      .click();
    for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
      await page
        .getByRole("button", { name: "Apariencia", exact: true })
        .click();
      const appearance = page.getByRole("dialog", {
        name: "Apariencia de TruckControl",
      });
      await appearance.getByRole("radio", { name: theme, exact: true }).check();
      await appearance
        .getByLabel("Animaciones", { exact: true })
        .selectOption("off");
      await appearance
        .getByRole("button", { name: "Aplicar apariencia", exact: true })
        .click();
      await appearance
        .getByRole("button", { name: "Cerrar ventana", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Permisos fiscales de Empresa ficticia SaaS",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Permisos fiscales de la empresa",
      });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(
          `fiscal-admin-${theme.replace(" ", "-")}.png`,
        ),
      });
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
    }
  });
  test("pagina empresas y rechaza confirmaciones de permisos obsoletas sin sobrescribir", async ({
    page,
  }) => {
    const f = await fixtures(page);
    for (let n = 1; n <= 55; n++) {
      const id = `fc200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      f.controls.fiscal.set(
        id,
        fiscalState(id, `Empresa fiscal ficticia ${n}`),
      );
    }
    await login(page, "pedidos@smartscaneuskadi.com");
    await page
      .getByRole("button", { name: "Facturación de empresas", exact: true })
      .click();
    await expect(page.locator(".fiscal-company-row")).toHaveCount(50);
    await page
      .getByRole("button", { name: "Más empresas", exact: true })
      .click();
    await expect(page.locator(".fiscal-company-row")).toHaveCount(6);
    await page
      .getByRole("button", { name: "Página anterior de empresas", exact: true })
      .click();
    await expect(page.locator(".fiscal-company-row")).toHaveCount(50);
    await page
      .getByRole("button", {
        name: "Permisos fiscales de Empresa ficticia SaaS",
        exact: true,
      })
      .click();
    f.controls.fiscalConflict = true;
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Guardar permisos fiscales", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page
        .getByRole("region", {
          name: "Administración de facturación de empresas",
        })
        .getByRole("alert"),
    ).toContainText("otro dispositivo");
    await expect(page.locator(".fiscal-company-row")).toHaveCount(0);
    expect(f.controls.fiscal.get(org)!.policy.version).toBeNull();
  });
});

function copilotCustomer(): CopilotAction {
  return {
    id: crypto.randomUUID(),
    organization_id: org,
    entity: "customers",
    mode: "create",
    record_id: crypto.randomUUID(),
    fields: {
      name: "Cliente creado por asistente",
      taxId: "DEMO-COPILOT",
      email: "",
      phone: "",
      address: "Dirección ficticia",
      notes: "",
    },
    previous: null,
    expected_version: null,
    state: "pending",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1800000).toISOString(),
    applied_at: null,
  };
}
async function copilotWorkspace(page: Page, consented = true) {
  const f = await fixtures(page);
  f.snapshot.customers[0].ai_allowed = true;
  f.snapshot.customers[0].ai_opt_in = consented;
  return f;
}
async function openCopilot(page: Page) {
  await login(page, "customer@example.com");
  await page.evaluate(() => {
    location.hash = "/assistant";
  });
  const panel = page.getByRole("region", {
    name: "Asistente de empresa",
    exact: true,
  });
  await panel.waitFor();
  await expect(
    panel.getByText("Comprobando permisos…", { exact: true }),
  ).not.toBeVisible();
  return panel;
}
async function installCopilotVoice(page: Page) {
  await page.addInitScript(() => {
    const state = {
      instance: null as Recognition | null,
      late: null as ((event: unknown) => void) | null,
      aborts: 0,
      spoken: [] as string[],
    };
    class Recognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        state.instance = this;
        state.late = this.onresult;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        state.aborts++;
      }
    }
    Object.assign(window, {
      SpeechRecognition: Recognition,
      __tcCopilotVoice: state,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        speak(value: { text: string }) {
          state.spoken.push(value.text);
        },
      },
    });
  });
}
type CopilotVoiceFixture = {
  __tcCopilotVoice: {
    instance: { onresult: ((event: unknown) => void) | null };
    late: ((event: unknown) => void) | null;
    aborts: number;
    spoken: string[];
  };
};
test.describe("ocho perfiles especialistas con evidencia", () => {
  async function workspace(page: Page) {
    const f = await copilotWorkspace(page);
    f.controls.specialistsAvailable = true;
    return f;
  }
  test("elige ocho perfiles y muestra sus fuentes sin mezclar conversaciones", async ({
    page,
  }) => {
    const f = await workspace(page),
      panel = await openCopilot(page),
      picker = panel.getByLabel("Perfil del asistente", { exact: true });
    await expect(picker).toBeVisible();
    for (const p of specialistProfiles) {
      await picker.selectOption(p.id);
      f.controls.copilotReply = `Respuesta ficticia del perfil ${p.id}.`;
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill(`Consulta ficticia para ${p.label}.`);
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await expect(panel.getByRole("log")).toContainText(
        f.controls.copilotReply,
      );
      await panel.getByText("Fuentes utilizadas (1)", { exact: true }).click();
      await expect(panel.getByRole("log")).toContainText(
        "Camión de la empresa de prueba",
      );
      await expect(panel.getByRole("log")).toContainText(
        "No hay telemetría GPS",
      );
      if (p.id !== "general")
        await expect(panel.getByRole("log")).not.toContainText(
          "Respuesta ficticia del perfil general.",
        );
    }
    expect(
      f.calls.filter(
        (c) =>
          c.path.endsWith("/company-copilot/specialists") &&
          c.body?.action === "chat",
      ),
    ).toHaveLength(8);
    expect(f.controls.copilotAppliedWrites).toBe(0);
  });
  test("envía únicamente los documentos elegidos en el perfil documental", async ({
    page,
  }) => {
    const f = await workspace(page),
      id = "30000000-0000-4000-8000-000000000092";
    f.controls.backupDocuments.push({
      id,
      organization_id: org,
      name: "Archivo ficticio para IA.pdf",
      object_path: `${org}/${id}/document.pdf`,
      content_type: "application/pdf",
      size_bytes: 100,
      truck_id: null,
      driver_id: null,
      created_at: stamp,
    });
    const panel = await openCopilot(page);
    await panel.getByLabel("Perfil del asistente").selectOption("documents");
    await panel.getByLabel("Archivo ficticio para IA.pdf").check();
    await panel
      .getByLabel("Tu mensaje al asistente")
      .fill("Lee únicamente mi archivo seleccionado.");
    await panel
      .getByRole("button", { name: "Enviar al asistente", exact: true })
      .click();
    await expect(panel.getByRole("log")).toContainText(f.controls.copilotReply);
    const request = f.calls.find(
      (c) =>
        c.path.endsWith("/company-copilot/specialists") &&
        c.body?.action === "chat",
    );
    expect(request?.body).toMatchObject({
      profile: "documents",
      document_ids: [id],
    });
    await panel.getByText("Fuentes utilizadas (1)", { exact: true }).click();
    await expect(panel.getByRole("log")).toContainText(
      "Documento seleccionado ficticio",
    );
  });
  test("los avisos empiezan apagados y su ejecución no realiza consultas al modelo", async ({
    page,
  }) => {
    const f = await workspace(page),
      panel = await openCopilot(page);
    await panel
      .getByText("Avisos periódicos opcionales", { exact: true })
      .click();
    const opt = panel.getByLabel("Activar avisos de general", { exact: true });
    await expect(opt).not.toBeChecked();
    await opt.click();
    await expect(opt).toBeChecked();
    await panel
      .getByRole("button", { name: "Revisar avisos ahora", exact: true })
      .click();
    await expect(panel).toContainText("completada con reglas, sin consumo IA");
    await expect(panel).toContainText("Mantenimientos vencidos: 2");
    await expect(panel).toContainText("Mantenimientos abiertos: 3");
    await panel
      .getByRole("button", { name: "Revisar avisos ahora", exact: true })
      .click();
    await expect(
      panel.getByText("completada con reglas, sin consumo IA", {
        exact: false,
      }),
    ).toHaveCount(1);
    expect(
      f.calls.filter((c) => c.path.endsWith("/company-copilot/specialists")),
    ).toHaveLength(0);
    await opt.click();
    await expect(opt).not.toBeChecked();
  });
  test("recupera una respuesta incierta sin otra llamada de pago", async ({
    page,
  }) => {
    const f = await workspace(page);
    f.controls.copilotChatUncertain = true;
    const panel = await openCopilot(page);
    await panel.getByLabel("Perfil del asistente").selectOption("finance");
    await panel
      .getByLabel("Tu mensaje al asistente")
      .fill("Resumen financiero ficticio.");
    await panel
      .getByRole("button", { name: "Enviar al asistente", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Comprobar estado de la consulta",
        exact: true,
      })
      .click();
    await expect(panel.getByRole("log")).toContainText(f.controls.copilotReply);
    expect(
      f.calls.filter(
        (c) =>
          c.path.endsWith("/company-copilot/specialists") &&
          c.body?.action === "chat",
      ),
    ).toHaveLength(1);
  });
  test("no muestra respuestas que pertenecen a otro perfil", async ({
    page,
  }) => {
    const f = await workspace(page);
    f.controls.specialistWrongProfile = true;
    f.controls.copilotReply = "SECRETO-PERFIL-AJENO";
    const panel = await openCopilot(page);
    await panel
      .getByLabel("Tu mensaje al asistente")
      .fill("Consulta ficticia general.");
    await panel
      .getByRole("button", { name: "Enviar al asistente", exact: true })
      .click();
    await expect(panel).toContainText(
      "La respuesta no corresponde a este perfil",
    );
    await expect(panel.getByRole("log")).not.toContainText(
      "SECRETO-PERFIL-AJENO",
    );
    await expect(
      panel.getByText("Fuentes utilizadas (1)", { exact: true }),
    ).toHaveCount(0);
  });
  test("retirar consentimiento limpia respuestas, fuentes y controles de perfiles", async ({
    page,
  }) => {
    const f = await workspace(page),
      panel = await openCopilot(page);
    f.controls.copilotReply = "RESPUESTA-PRIVADA-ESPECIALISTA";
    await panel
      .getByLabel("Tu mensaje al asistente")
      .fill("Consulta privada ficticia.");
    await panel
      .getByRole("button", { name: "Enviar al asistente", exact: true })
      .click();
    await expect(panel.getByRole("log")).toContainText(f.controls.copilotReply);
    await panel
      .getByText("Permisos y privacidad del asistente", { exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Retirar mi consentimiento de IA",
        exact: true,
      })
      .click();
    await expect(panel.getByRole("log")).not.toContainText(
      f.controls.copilotReply,
    );
    await expect(panel.getByLabel("Perfil del asistente")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Enviar al asistente", exact: true }),
    ).toBeDisabled();
  });
  test("selector, fuentes y avisos son accesibles en ambos temas y sin desbordamiento", async ({
    page,
  }, testInfo) => {
    const f = await workspace(page),
      panel = await openCopilot(page);
    await panel.getByLabel("Perfil del asistente").selectOption("finance");
    await panel
      .getByLabel("Tu mensaje al asistente")
      .fill("Resumen ficticio accesible.");
    await panel
      .getByRole("button", { name: "Enviar al asistente", exact: true })
      .click();
    await expect(panel.getByRole("log")).toContainText(f.controls.copilotReply);
    await panel.getByText("Fuentes utilizadas (1)", { exact: true }).click();
    await panel
      .getByText("Avisos periódicos opcionales", { exact: true })
      .click();
    await panel
      .getByLabel("Tu mensaje al asistente")
      .fill("Borrador por conservar al cambiar el tema.");
    for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
      await page
        .getByRole("button", { name: "Cambiar apariencia", exact: true })
        .first()
        .click();
      const appearance = page.getByRole("dialog", {
        name: "Apariencia de TruckControl",
      });
      await appearance.getByRole("radio", { name: theme, exact: true }).check();
      await appearance
        .getByLabel("Animaciones", { exact: true })
        .selectOption("off");
      await appearance
        .getByRole("button", { name: "Aplicar apariencia", exact: true })
        .click();
      await appearance
        .getByRole("button", { name: "Cerrar ventana", exact: true })
        .click();
      await expect(panel.getByLabel("Perfil del asistente")).toHaveValue(
        "finance",
      );
      await expect(panel.getByLabel("Tu mensaje al asistente")).toHaveValue(
        "Borrador por conservar al cambiar el tema.",
      );
      expect(
        (
          await new AxeBuilder({ page })
            .include(".company-copilot")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await panel.getByLabel("Perfil del asistente").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`specialists-${theme.replace(" ", "-")}.png`),
      });
    }
  });
});
describeCopilot();
function describeCopilot() {
  test.describe("asistente universal por voz y texto", () => {
    test("prepara un cliente sin escribir y guarda una sola vez al confirmar", async ({
      page,
    }) => {
      const f = await copilotWorkspace(page);
      f.controls.copilotDrafts = [copilotCustomer()];
      const panel = await openCopilot(page);
      await expect(
        panel.getByText("Asistente conectado", { exact: true }),
      ).toBeVisible();
      await panel
        .getByLabel("Tu mensaje al asistente", { exact: true })
        .fill("Prepara el cliente ficticio con los datos que he indicado.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      const task = panel.getByRole("article", {
        name: "Propuesta Clientes",
        exact: true,
      });
      await expect(task).toContainText("Cliente creado por asistente");
      expect(f.records.size).toBe(0);
      expect(f.controls.copilotAppliedWrites).toBe(0);
      expect(
        f.calls.filter((c) => c.body?.p_action === "execute"),
      ).toHaveLength(0);
      await task
        .getByRole("button", {
          name: "Confirmar y guardar Clientes",
          exact: true,
        })
        .click();
      await expect(task.getByText("Guardada", { exact: true })).toBeVisible();
      expect(f.controls.copilotAppliedWrites).toBe(1);
      expect(f.records.size).toBe(1);
      await expect(
        task.getByRole("button", {
          name: "Confirmar y guardar Clientes",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.evaluate(() => {
        location.hash = "/customers";
      });
      await expect(
        page.getByText("Cliente creado por asistente", { exact: true }),
      ).toBeVisible();
    });
    test("cancelar una propuesta conserva los datos y no consume otra consulta", async ({
      page,
    }) => {
      const f = await copilotWorkspace(page);
      f.controls.copilotDrafts = [copilotCustomer()];
      const panel = await openCopilot(page);
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Prepara el cliente ficticio.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await panel
        .getByRole("button", {
          name: "Cancelar propuesta de Clientes",
          exact: true,
        })
        .click();
      await expect(panel.getByText("Cancelada", { exact: true })).toBeVisible();
      expect(f.records.size).toBe(0);
      expect(f.controls.copilotAppliedWrites).toBe(0);
      expect(
        f.calls.filter(
          (c) =>
            c.path.endsWith("company-copilot") && c.body?.action === "chat",
        ),
      ).toHaveLength(1);
    });
    test("exige consentimiento y permite retirarlo limpiando conversación y propuestas", async ({
      page,
    }) => {
      const f = await copilotWorkspace(page, false);
      const panel = await openCopilot(page);
      await expect(
        panel.getByRole("button", { name: "Enviar al asistente", exact: true }),
      ).toBeDisabled();
      await panel
        .getByRole("button", { name: "Permitir mi uso de IA", exact: true })
        .click();
      await expect(
        panel.getByText("Asistente conectado", { exact: true }),
      ).toBeVisible();
      f.controls.copilotReply =
        "Respuesta privada de prueba COPILOT-ONLY-SECRET";
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Consulta confidencial TC-COPILOT-ONLY-TEXT.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await expect(panel.getByRole("log")).toContainText("COPILOT-ONLY-SECRET");
      expect(
        await page.evaluate(() =>
          Object.values(localStorage)
            .concat(Object.values(sessionStorage))
            .some(
              (v) =>
                String(v).includes("TC-COPILOT-ONLY-TEXT") ||
                String(v).includes("COPILOT-ONLY-SECRET"),
            ),
        ),
      ).toBe(false);
      await panel
        .getByText("Permisos y privacidad del asistente", { exact: true })
        .click();
      await panel
        .getByRole("button", {
          name: "Retirar mi consentimiento de IA",
          exact: true,
        })
        .click();
      await expect(panel.getByRole("log")).not.toContainText(
        "COPILOT-ONLY-SECRET",
      );
      await expect(
        panel.getByRole("button", { name: "Enviar al asistente", exact: true }),
      ).toBeDisabled();
    });
    test("una respuesta perdida se recupera sin otra llamada al modelo", async ({
      page,
    }) => {
      const f = await copilotWorkspace(page);
      f.controls.copilotChatUncertain = true;
      f.controls.copilotDrafts = [copilotCustomer()];
      const panel = await openCopilot(page);
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Prepara un cliente ficticio.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await panel
        .getByRole("button", {
          name: "Comprobar estado de la consulta",
          exact: true,
        })
        .click();
      await expect(
        panel.getByRole("article", { name: "Propuesta Clientes", exact: true }),
      ).toBeVisible();
      expect(f.controls.copilotAppliedWrites).toBe(0);
      expect(
        f.calls.filter(
          (c) =>
            c.path.endsWith("company-copilot") && c.body?.action === "chat",
        ),
      ).toHaveLength(1);
    });
    test("una respuesta incierta al guardar consulta el servidor y no duplica la tarea", async ({
      page,
    }) => {
      const f = await copilotWorkspace(page);
      f.controls.copilotExecuteUncertain = true;
      f.controls.copilotDrafts = [copilotCustomer()];
      const panel = await openCopilot(page);
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Prepara un cliente ficticio.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await panel
        .getByRole("button", {
          name: "Confirmar y guardar Clientes",
          exact: true,
        })
        .click();
      await expect(panel.getByText("Guardada", { exact: true })).toBeVisible();
      await expect(panel).toContainText(
        "El servidor confirma que esta tarea ya está guardada",
      );
      expect(f.controls.copilotAppliedWrites).toBe(1);
      expect(
        f.calls.filter((c) => c.body?.p_action === "execute"),
      ).toHaveLength(1);
      expect(f.calls.filter((c) => c.body?.p_action === "task")).toHaveLength(
        1,
      );
    });
    test("la cuenta de consulta conversa y mantiene desactivada la escritura", async ({
      page,
    }) => {
      const f = await copilotWorkspace(page);
      f.controls.companyRole = "viewer";
      const pending = copilotCustomer();
      f.controls.copilotActions.set(pending.id, pending);
      f.controls.copilotReply = "Resumen ficticio sin cambios.";
      const panel = await openCopilot(page);
      await expect(
        panel.getByRole("button", {
          name: "Confirmar y guardar Clientes",
          exact: true,
        }),
      ).toBeDisabled();
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Muéstrame un resumen de mi empresa.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await expect(panel.getByRole("log")).toContainText(
        "Resumen ficticio sin cambios.",
      );
      expect(f.controls.copilotAppliedWrites).toBe(0);
    });
    test("el dictado se revisa antes de enviar y permite escuchar la respuesta", async ({
      page,
    }) => {
      await installCopilotVoice(page);
      const f = await copilotWorkspace(page);
      f.controls.copilotReply =
        "Dime los datos del cliente que quieres preparar.";
      const panel = await openCopilot(page);
      const microphone = panel.getByRole("button", {
        name: "Dictar mensaje",
        exact: true,
      });
      await expect(microphone).toBeDisabled();
      await panel
        .getByLabel(/Permitir dictado y lectura del navegador/)
        .check();
      await microphone.click();
      await page.evaluate(() => {
        (
          window as unknown as CopilotVoiceFixture
        ).__tcCopilotVoice.instance.onresult?.({
          results: [
            {
              isFinal: true,
              0: { transcript: "Prepara un cliente ficticio por voz" },
            },
          ],
        });
      });
      await expect(panel.getByLabel("Tu mensaje al asistente")).toHaveValue(
        "Prepara un cliente ficticio por voz",
      );
      expect(f.calls.filter((c) => c.body?.action === "chat")).toHaveLength(0);
      await panel
        .getByRole("button", { name: "Terminar dictado", exact: true })
        .click();
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Prepara un cliente ficticio por voz corregida");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await expect(panel.getByRole("log")).toContainText(
        "Dime los datos del cliente",
      );
      await panel
        .getByRole("button", { name: "Escuchar respuesta 2", exact: true })
        .click();
      expect(
        await page.evaluate(
          () =>
            (window as unknown as CopilotVoiceFixture).__tcCopilotVoice.spoken,
        ),
      ).toEqual([f.controls.copilotReply]);
      expect(
        f.calls.filter((c) => c.body?.action === "chat").at(-1)?.body?.messages,
      ).toEqual([
        {
          role: "user",
          content: "Prepara un cliente ficticio por voz corregida",
        },
      ]);
    });
    test("retirar el consentimiento detiene el micrófono y descarta callbacks tardíos", async ({
      page,
    }) => {
      await installCopilotVoice(page);
      const f = await copilotWorkspace(page);
      const panel = await openCopilot(page);
      await panel
        .getByLabel(/Permitir dictado y lectura del navegador/)
        .check();
      await panel
        .getByRole("button", { name: "Dictar mensaje", exact: true })
        .click();
      await panel
        .getByText("Permisos y privacidad del asistente", { exact: true })
        .click();
      await panel
        .getByRole("button", {
          name: "Retirar mi consentimiento de IA",
          exact: true,
        })
        .click();
      await expect(
        panel.getByText("Asistente conectado", { exact: true }),
      ).not.toBeVisible();
      await page.evaluate(() => {
        (window as unknown as CopilotVoiceFixture).__tcCopilotVoice.late?.({
          results: [
            {
              isFinal: true,
              0: { transcript: "Texto de una sesión anterior" },
            },
          ],
        });
      });
      await expect(panel.getByLabel("Tu mensaje al asistente")).toHaveValue("");
      expect(
        await page.evaluate(
          () =>
            (window as unknown as CopilotVoiceFixture).__tcCopilotVoice.aborts,
        ),
      ).toBeGreaterThan(0);
      expect(f.calls.filter((c) => c.body?.action === "chat")).toHaveLength(0);
    });
    test("desconectar o recibir una respuesta de otra empresa mantiene el bloqueo", async ({
      page,
      context,
    }) => {
      const f = await copilotWorkspace(page);
      f.controls.copilotWrongCompany = true;
      f.controls.copilotReply = "TC-FOREIGN-SECRET";
      const panel = await openCopilot(page);
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Consulta los datos de mi empresa.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await expect(panel.getByRole("log")).not.toContainText(
        "TC-FOREIGN-SECRET",
      );
      await expect(
        panel.getByRole("article", { name: "Propuesta Clientes", exact: true }),
      ).toHaveCount(0);
      await context.setOffline(true);
      await expect(panel).toContainText("El asistente necesita conexión");
      await expect(
        panel.getByRole("button", { name: "Enviar al asistente", exact: true }),
      ).toBeDisabled();
      await expect(panel.getByRole("log")).not.toContainText(
        "Consulta los datos",
      );
    });
    test("accesible en ambos temas sin perder el borrador y con voz no disponible", async ({
      page,
    }, testInfo) => {
      await page.addInitScript(() => {
        Object.assign(window, {
          SpeechRecognition: undefined,
          webkitSpeechRecognition: undefined,
        });
      });
      const f = await copilotWorkspace(page);
      const pending = copilotCustomer();
      f.controls.copilotActions.set(pending.id, pending);
      const panel = await openCopilot(page);
      await expect(panel).toContainText(
        "Este navegador no ofrece dictado compatible",
      );
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Borrador que debe conservarse al cambiar de tema.");
      for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
        await page
          .getByRole("button", { name: "Cambiar apariencia", exact: true })
          .first()
          .click();
        const appearance = page.getByRole("dialog", {
          name: "Apariencia de TruckControl",
        });
        await appearance
          .getByRole("radio", { name: theme, exact: true })
          .check();
        await appearance
          .getByLabel("Animaciones", { exact: true })
          .selectOption("off");
        await appearance
          .getByRole("button", { name: "Aplicar apariencia", exact: true })
          .click();
        await appearance
          .getByRole("button", { name: "Cerrar ventana", exact: true })
          .click();
        await expect(panel.getByLabel("Tu mensaje al asistente")).toHaveValue(
          "Borrador que debe conservarse al cambiar de tema.",
        );
        await panel.scrollIntoViewIfNeeded();
        expect(
          (
            await new AxeBuilder({ page })
              .include(".company-copilot")
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.body.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await panel
          .getByRole("heading", {
            name: "Tu asistente por voz y texto",
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath(`copilot-${theme.replace(" ", "-")}.png`),
        });
        await panel
          .getByLabel("Tu mensaje al asistente", { exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath(
            `copilot-composer-${theme.replace(" ", "-")}.png`,
          ),
        });
      }
    });
    test("cambiar de empresa descarta una respuesta de chat que llega tarde", async ({
      page,
    }) => {
      const f = await copilotWorkspace(page),
        second = "20000000-0000-4000-8000-000000000097";
      f.controls.additionalOrganizations.push({
        id: second,
        name: "Segunda empresa del copiloto",
      });
      let release!: () => void,
        started = false,
        finished = false;
      const held = new Promise<void>((r) => {
        release = r;
      });
      await page.route("**/functions/v1/company-copilot", async (route) => {
        const body = route.request().postDataJSON();
        if (body?.action === "chat" && body.organization_id === org) {
          started = true;
          await held;
          try {
            await route.fulfill({
              contentType: "application/json",
              headers: {
                "Access-Control-Allow-Origin": "http://127.0.0.1:4194",
              },
              body: JSON.stringify({
                request_id: body.request_id,
                organization_id: org,
                state: "complete",
                reply: "RESPUESTA-PRIVADA-EMPRESA-ANTERIOR",
                actions: [],
              }),
            });
          } catch {
            /* Aborted scoped request. */
          } finally {
            finished = true;
          }
        } else await route.fallback();
      });
      const panel = await openCopilot(page);
      await panel
        .getByLabel("Tu mensaje al asistente")
        .fill("Consulta privada para la primera empresa.");
      await panel
        .getByRole("button", { name: "Enviar al asistente", exact: true })
        .click();
      await expect.poll(() => started).toBe(true);
      await page
        .getByLabel("Empresa activa", { exact: true })
        .selectOption(second);
      await expect(panel).toContainText("Segunda empresa del copiloto");
      release();
      await expect.poll(() => finished).toBe(true);
      await expect(
        panel.getByText("Asistente conectado", { exact: true }),
      ).toBeVisible();
      await expect(panel.getByRole("log")).not.toContainText(
        "RESPUESTA-PRIVADA-EMPRESA-ANTERIOR",
      );
      await expect(panel.getByLabel("Tu mensaje al asistente")).toHaveValue("");
    });
  });
}


test.describe("CargoTrack y cierre de sesión del menú", () => {
  async function openMainMenu(page: Page) {
    const open = page.getByRole("button", { name: "Abrir menú", exact: true });
    if (await open.isVisible()) await open.click();
    return page.getByRole("complementary", { name: "Navegación principal" });
  }

  test("CargoTrack abre dentro de TruckControl y conserva su documento al navegar", async ({ page, context }, testInfo) => {
    const f = await fixtures(page);
    f.controls.companyPlan = "limited";
    await login(page, "customer@example.com");
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    const outgoing: { url: string; referer?: string; authorization?: string; body: string | null }[] = [];
    await context.route("https://on7.cargotrack.ro/**", async (route) => {
      outgoing.push({ url: route.request().url(), referer: route.request().headers().referer,
        authorization: route.request().headers().authorization, body: route.request().postData() });
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="es"><head><title>Proveedor ficticio</title></head><body><main><h1>CargoTrack ficticio</h1><label>Usuario del proveedor<input name="username"></label><script>document.body.dataset.instance=crypto.randomUUID();</script></main></body></html>' });
    });
    const menu = await openMainMenu(page);
    const cargo = menu.getByRole("link", { name: "CargoTrack", exact: true });
    await expect(cargo.locator("svg")).toHaveCount(2);
    await cargo.click();
    await expect(page.getByRole("heading", { name: "CargoTrack", exact: true })).toBeVisible();
    await expect(page.locator("main iframe")).toHaveCount(0);
    const pagesBefore = context.pages().length;
    await page.getByRole("button", { name: "Entrar en CargoTrack", exact: true }).click();
    const element = page.locator("iframe.cargotrack-frame");
    await expect(element).toHaveAttribute("src", "https://on7.cargotrack.ro/signin");
    await expect(element).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(element).toHaveAttribute("sandbox", "allow-forms allow-scripts allow-same-origin allow-downloads allow-popups");
    const frame = page.frameLocator("iframe.cargotrack-frame");
    await expect(frame.getByRole("heading", { name: "CargoTrack ficticio" })).toBeVisible();
    await frame.getByLabel("Usuario del proveedor").fill("borrador-ficticio-sin-enviar");
    const instance = await frame.locator("body").getAttribute("data-instance");
    expect(context.pages()).toHaveLength(pagesBefore);
    expect(outgoing).toEqual([{ url: "https://on7.cargotrack.ro/signin", body: null }]);
    expect(await page.evaluate(() => {
      try { void (document.querySelector("iframe.cargotrack-frame") as HTMLIFrameElement).contentWindow!.document; return false; }
      catch { return true; }
    })).toBe(true);
    for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
      await page.getByRole("button", { name: "Cambiar apariencia", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
      await dialog.getByRole("radio", { name: theme, exact: true }).check();
      await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
      await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.locator(".cargotrack-page").screenshot({ path: testInfo.outputPath("cargotrack-" + theme.replace(" ", "-") + ".png") });
    }
    await page.getByRole("link", { name: "Volver al resumen", exact: true }).click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(element).toHaveCount(1);
    await expect(element).toBeHidden();
    await openMainMenu(page);
    await cargo.click();
    await expect(element).toBeVisible();
    await expect(frame.getByLabel("Usuario del proveedor")).toHaveValue("borrador-ficticio-sin-enviar");
    await expect(frame.locator("body")).toHaveAttribute("data-instance", instance!);
    expect(outgoing).toHaveLength(1);
    expect(f.calls.some((c) => c.path === "/auth/v1/logout" || /cargotrack/i.test(c.path))).toBe(false);
  });

  test("cerrar TruckControl elimina la vista integrada y una nueva sesión no la abre automáticamente", async ({ page, context }) => {
    await fixtures(page);
    let providerRequests = 0;
    await context.route("https://on7.cargotrack.ro/**", async (route) => {
      providerRequests++;
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body>Proveedor ficticio sin credenciales</body></html>' });
    });
    await login(page, "customer@example.com");
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    const menu = await openMainMenu(page);
    await menu.getByRole("link", { name: "CargoTrack", exact: true }).click();
    await page.getByRole("button", { name: "Entrar en CargoTrack", exact: true }).click();
    await expect(page.frameLocator("iframe.cargotrack-frame").locator("body")).toContainText("Proveedor ficticio");
    await openMainMenu(page);
    await menu.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.locator("iframe.cargotrack-frame")).toHaveCount(0);
    await page.getByLabel("Correo electrónico", { exact: true }).fill("customer@example.com");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password-123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    await openMainMenu(page);
    await menu.getByRole("link", { name: "CargoTrack", exact: true }).click();
    await expect(page.getByRole("button", { name: "Entrar en CargoTrack", exact: true })).toBeVisible();
    await expect(page.locator("iframe.cargotrack-frame")).toHaveCount(0);
    expect(providerRequests).toBe(1);
  });

  test("cambiar de empresa desmonta CargoTrack y exige abrir su vista de nuevo", async ({ page, context }) => {
    const f = await fixtures(page);
    const second = "20000000-0000-4000-8000-000000000099";
    f.controls.additionalOrganizations.push({ id: second, name: "Segunda empresa CargoTrack ficticia" });
    let providerRequests = 0;
    await context.route("https://on7.cargotrack.ro/**", async (route) => {
      providerRequests++;
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body>Proveedor ficticio</body></html>' });
    });
    await login(page, "customer@example.com");
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    const menu = await openMainMenu(page);
    await menu.getByRole("link", { name: "CargoTrack", exact: true }).click();
    await page.getByRole("button", { name: "Entrar en CargoTrack", exact: true }).click();
    await expect(page.frameLocator("iframe.cargotrack-frame").locator("body")).toContainText("Proveedor ficticio");
    await openMainMenu(page);
    await menu.getByRole("link", { name: "Configuración", exact: true }).click();
    await page.getByLabel("Empresa activa", { exact: true }).selectOption(second);
    await expect(page.locator(".workspace-label")).toContainText("Segunda empresa CargoTrack ficticia");
    await openMainMenu(page);
    await menu.getByRole("link", { name: "CargoTrack", exact: true }).click();
    await expect(page.getByRole("button", { name: "Entrar en CargoTrack", exact: true })).toBeVisible();
    await expect(page.locator("iframe.cargotrack-frame")).toHaveCount(0);
    expect(providerRequests).toBe(1);
  });

  test("el menú muestra Cerrar sesión debajo de Configuración y revoca una sola vez", async ({ page }) => {
    const f = await fixtures(page);
    await login(page, "customer@example.com");
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    const menu = await openMainMenu(page);
    const settings = menu.getByRole("link", { name: "Configuración", exact: true });
    const logout = menu.getByRole("button", { name: "Cerrar sesión", exact: true });
    expect(await settings.evaluate((element) => element.nextElementSibling?.textContent?.trim())).toBe("Cerrar sesión");
    let finish!: () => Promise<void>;
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => { started = resolve; });
    let logoutRequests = 0;
    await page.route("http://127.0.0.1:9999/auth/v1/logout**", async (route) => {
      if (route.request().method() !== "POST") { await route.fallback(); return; }
      logoutRequests++;
      expect(route.request().headers().authorization).toMatch(/^Bearer ey/);
      finish = () => route.fulfill({
        status: 200, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4194", "Content-Type": "application/json" }, body: "{}",
      });
      started();
    });
    await logout.click();
    await requestStarted;
    const pending = menu.getByRole("button", { name: "Cerrando sesión…", exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await pending.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    expect(logoutRequests).toBe(1);
    await finish();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.locator(".sidebar, .workspace-label")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("truckcontrol-auth-v1"))).toBeNull();
    expect(f.records.size).toBe(0);
    expect(f.calls.some((c) => /storage.*remove|delete_company|delete_organization/.test(c.path))).toBe(false);
  });

  test("una sesión cerrada no vuelve a mostrar datos con Atrás, recarga ni ruta privada", async ({ page }) => {
    const f = await fixtures(page);
    await login(page, "customer@example.com");
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    await page.evaluate(() => { location.hash = "/trucks"; });
    await expect(page.locator("main")).toContainText("8888 TST");
    await page.evaluate(() => { location.hash = "/cargotrack"; });
    await expect(page.getByRole("heading", { name: "CargoTrack", exact: true })).toBeVisible();
    const menu = await openMainMenu(page);
    await menu.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    const callsAfterLogout = f.calls.length;
    await page.goBack();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await page.evaluate(() => { location.hash = "/documents"; });
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("8888 TST");
    await expect(page.locator(".sidebar, .data-table, .personal-mail-reader")).toHaveCount(0);
    const privateReads = f.calls.slice(callsAfterLogout).filter((c) => /^\/rest\/v1\/(organizations|trucks|drivers|finance_entries|company_records|company_documents)/.test(c.path));
    expect(privateReads).toEqual([]);
  });

  test("un rechazo remoto cierra localmente, avisa y exige volver a entrar para reintentar", async ({ page }) => {
    await fixtures(page);
    await login(page, "customer@example.com");
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    const menu = await openMainMenu(page);
    let deny = true;
    let requests = 0;
    await page.route("http://127.0.0.1:9999/auth/v1/logout**", async (route) => {
      if (route.request().method() !== "POST") { await route.fallback(); return; }
      requests++;
      await route.fulfill({
        status: deny ? 400 : 200,
        headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4194", "Content-Type": "application/json" },
        body: deny ? JSON.stringify({ code: "synthetic_rejection", message: "Private provider diagnostic must not be displayed" }) : "{}",
      });
    });
    await menu.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    const notice = page.getByRole("alert").filter({ hasText: "Tu sesión en este dispositivo se ha cerrado" });
    await expect(notice).toContainText("no hemos podido confirmar el cierre en el servidor");
    await expect(page.locator("body")).not.toContainText("Private provider diagnostic");
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("truckcontrol-auth-v1"))).toBeNull();
    expect(requests).toBe(1);
    // A second call without a token would not prove remote revocation.
    // Reauthenticate before the real SDK is allowed to make another request.
    await page.getByLabel("Correo electrónico", { exact: true }).fill("customer@example.com");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password-123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
    await expect(notice).toHaveCount(0);
    deny = false;
    await openMainMenu(page);
    await menu.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    expect(requests).toBe(2);
  });

  test("la demo conserva CargoTrack y no muestra un cierre de sesión de empresa", async ({ page }) => {
    await fixtures(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Explorar la demo", exact: true }).click();
    await expect(page.locator(".workspace-label")).toContainText("Flota de demostración");
    const menu = await openMainMenu(page);
    await expect(menu.getByRole("button", { name: "Cerrar sesión", exact: true })).toHaveCount(0);
    await menu.getByRole("link", { name: "CargoTrack", exact: true }).click();
    await expect(page.getByRole("heading", { name: "CargoTrack", exact: true })).toBeVisible();
  });
});


test("una página restaurada de la caché exige verificar la sesión antes de mostrar la empresa", async ({ page }) => {
  const f = await fixtures(page);
  await login(page, "customer@example.com");
  await expect(page.locator(".workspace-label")).toContainText("Empresa ficticia SaaS");
  await page.evaluate(() => { location.hash = "/trucks"; });
  await expect(page.locator("main")).toContainText("8888 TST");
  const reads = f.calls.filter((c) => c.path === "/auth/v1/user").length;
  // Page lifecycle events exercise the BFCache guard; these are not physical-device tests.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.locator("main")).toContainText("8888 TST");
  expect(f.calls.filter((c) => c.path === "/auth/v1/user").length).toBeGreaterThan(reads);
  const open = page.getByRole("button", { name: "Abrir menú", exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole("complementary", { name: "Navegación principal" })
    .getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("8888 TST");
  await expect(page.locator(".sidebar")).toHaveCount(0);
});

test("correo real: verifica cuentas, conserva dos buzones y no guarda contraseñas", async ({
  page,
  context,
}) => {
  await fixtures(page);
  const calls: { action: string; email: string }[] = [];
  let reject = false;
  await page.route("**/functions/v1/personal-mail", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.consent).toEqual({ version: "2026-11-13", accepted: true });
    const email = body.connection.email;
    calls.push({ action: body.action, email });
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };
    if (reject && body.action === "verify") {
      await route.fulfill({
        status: 403,
        headers,
        body: JSON.stringify({ error: "denied" }),
      });
      return;
    }
    const message = {
      id: "fictitious-1",
      threadId: "fictitious-1",
      from: "sender@example.invalid",
      to: email,
      subject: "Mensaje IMAP ficticio",
      date: "2026-11-08T12:00:00Z",
      snippet: "",
      labels: [],
      text: "Texto IMAP ficticio privado",
      htmlConverted: false,
      messageId: "<fictitious@example.invalid>",
      attachments: [],
    };
    const data =
      body.action === "verify"
        ? { email, reading: true, sending: true, consent_version: "2026-11-13" }
        : body.action === "list"
          ? { messages: [message], next: null }
          : body.action === "read"
            ? message
            : body.action === "send"
              ? { sent: true, sent_copy: true }
              : { changed: true };
    await route.fulfill({ status: 200, headers, body: JSON.stringify(data) });
  });
  await login(page, "customer@example.com");
  await page.evaluate(() => {
    location.hash = "/mailbox";
  });
  await expect(
    page.getByRole("heading", { name: "Correo", exact: true }),
  ).toBeVisible();
  const menu = page.getByRole("complementary", {
    name: "Navegación principal",
  });
  await expect(
    menu.getByRole("link", { name: "Correo", exact: true }),
  ).toHaveCount(1);
  await expect(
    menu.getByRole("link", { name: "Mi correo", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("main iframe")).toHaveCount(0);
  const pages = context.pages().length;
  async function fill(email: string) {
    const consent = page.getByLabel("Autorizo a TruckControl a conectar este buzón", { exact: false });
    await expect(consent).not.toBeChecked();
    await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
    await page
      .getByLabel("Contraseña del buzón o de aplicación", { exact: true })
      .fill("app-password-ficticia-no-real");
    await consent.check();
    // Accepting one configuration must not cover a changed server or credential.
    await page.getByLabel("Servidor de salida SMTP", { exact: false }).fill("smtp.changed.example.com");
    await expect(consent).not.toBeChecked();
    await page.getByLabel("Servidor de salida SMTP", { exact: false }).fill("smtp.porkbun.com");
    await consent.check();
    await page
      .getByRole("button", { name: "Conectar y verificar buzón", exact: true })
      .click();
  }
  await fill("first@example.invalid");
  await expect(
    page.getByRole("heading", { name: "first@example.invalid", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button")
    .filter({ hasText: "Mensaje IMAP ficticio" })
    .click();
  await expect(
    page.getByText("Texto IMAP ficticio privado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redactar", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "Redactar correo" });
  await draft
    .getByLabel("Para", { exact: true })
    .fill("recipient@example.invalid");
  await draft.getByLabel("Asunto", { exact: true }).fill("Envío ficticio IMAP");
  await draft
    .getByLabel("Mensaje", { exact: true })
    .fill("Solo transporte HTTP ficticio");
  await draft
    .getByRole("button", { name: "Revisar envío", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirmar envío" })
    .getByRole("button", { name: "Enviar ahora", exact: true })
    .click();
  await expect(draft).toHaveCount(0);
  expect(calls.filter((c) => c.action === "send")).toEqual([
    { action: "send", email: "first@example.invalid" },
  ]);
  await page
    .getByRole("button", { name: "Añadir otro correo", exact: true })
    .click();
  reject = true;
  await fill("second@example.invalid");
  await expect(page.getByRole("alert")).toContainText("proveedor ha rechazado");
  await expect(
    page
      .getByRole("navigation", { name: "Correos conectados" })
      .getByRole("button", { name: "second@example.invalid", exact: true }),
  ).toHaveCount(0);
  reject = false;
  await fill("second@example.invalid");
  await expect(
    page.getByRole("heading", { name: "second@example.invalid", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Facturas del correo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Del correo a tus gastos", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Volver a Correo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "second@example.invalid", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Correos conectados" })
    .getByRole("button", { name: "first@example.invalid", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "first@example.invalid", exact: true }),
  ).toBeVisible();
  expect(context.pages()).toHaveLength(pages);
  const stored = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(stored).not.toContain("app-password-ficticia-no-real");
  expect(stored).not.toContain("Texto IMAP ficticio privado");
  await page
    .getByRole("button", {
      name: "Desconectar first@example.invalid",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "first@example.invalid", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Correos conectados" }),
  ).toHaveCount(0);
});


test("IMAP/SMTP: la salida de sesión limpia la aceptación y descarta una verificación tardía", async ({ page }) => {
  await fixtures(page);
  let release!: () => void;
  let returned = false;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/functions/v1/personal-mail", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      action: "verify",
      consent: { version: "2026-11-13", accepted: true },
      connection: {
        email: "late@example.invalid",
        username: "late@example.invalid",
        password: "synthetic-late-password",
        imapHost: "imap.porkbun.com",
        smtpHost: "smtp.porkbun.com",
      },
    });
    await wait;
    try {
      await route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { email: "late@example.invalid", reading: true, sending: true, consent_version: "2026-11-13" },
      });
    } catch {
      // The production exit event aborts the in-flight browser request.
    } finally {
      returned = true;
    }
  });
  await login(page, "customer@example.com");
  await page.evaluate(() => { location.hash = "/mailbox"; });
  await page.getByLabel("Correo electrónico", { exact: true }).fill("late@example.invalid");
  await page.getByLabel("Contraseña del buzón o de aplicación", { exact: true }).fill("synthetic-late-password");
  const consent = page.getByLabel("Autorizo a TruckControl a conectar este buzón", { exact: false });
  await expect(consent).not.toBeChecked();
  await consent.check();
  const pending = page.waitForRequest("**/functions/v1/personal-mail");
  await page.getByRole("button", { name: "Conectar y verificar buzón", exact: true }).click();
  await pending;
  // Logout, user/company changes and page exit all use this production cleanup.
  await page.evaluate(() => window.dispatchEvent(new Event("truckcontrol:session-exit")));
  await expect(consent).not.toBeChecked();
  await expect(page.getByLabel("Correo electrónico", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Contraseña del buzón o de aplicación", { exact: true })).toHaveValue("");
  release();
  await expect.poll(() => returned).toBe(true);
  await expect(page.getByRole("navigation", { name: "Correos conectados" })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/synthetic-late-password|late@example.invalid/);
});

// Provider transport is synthetic here; native readiness requires the owner's verified session.
const stripeReadinessFixture = () => ({
  contract: "truckcontrol-stripe-readiness-v2",
  credential_state: "valid_format", signing_secret_state: "missing",
  checked_at: new Date().toISOString(),
  stripe_key_configured: true, key_mode: "live",
  fiscal_signing_secret_format_valid: false,
  account_checked: true, account_status: 200,
  account_id: "acct_1UZSsJCWctKw8slH", expected_account: true,
  charges_enabled: true, payouts_enabled: true,
  webhook_checked: true, webhook_status: 200,
  webhook_id_matches: true, webhook_url_matches: true,
  webhook_events_match: true, webhook_api_version_matches: true,
  webhook_disabled: true, signature_delivery_verified: false,
  payment_or_customer_mutations: 0,
});

test.describe("Stripe privado", () => {
  test("verifica al pulsar, evita duplicados y conserva el formulario de Google", async ({ page }) => {
    await fixtures(page);
    let reads = 0;
    await page.route("**/functions/v1/truckcontrol-billing", async route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,apikey,content-type,x-client-info" } });
      expect(route.request().postDataJSON()).toEqual({ action: "admin_readiness_details" });
      const bearer = route.request().headers().authorization;
      expect(bearer).toMatch(/^Bearer /);
      expect(JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString()).sub).toBe(admin);
      reads++;
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.fulfill({ json: stripeReadinessFixture(), headers: { "access-control-allow-origin": "*" } });
    });
    await openProviders(page);
    const card = page.getByRole("region", { name: "Conexión de Stripe", exact: true });
    await expect(card).toBeVisible();
    expect(reads).toBe(0);
    await page.getByLabel("Secreto nuevo de Google").fill("draft-preserved-on-stripe-check");
    await card.getByRole("button", { name: "Comprobar Stripe", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(card.getByRole("status")).toContainText("La firma y la entrega del webhook siguen pendientes de prueba.");
    await expect(card).toContainText("Estado del receptor: Desactivado");
    await expect(card).toContainText("Esta comprobación no modifica los cobros ni las licencias.");
    await expect(page.getByLabel("Secreto nuevo de Google")).toHaveValue("draft-preserved-on-stripe-check");
    expect(reads).toBe(1);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("stripe-readiness-v1");
  });

  test("explica permisos y rechaza resultados falsos sin mostrar errores privados", async ({ page }) => {
    await fixtures(page);
    let attempts = 0;
    await page.route("**/functions/v1/truckcontrol-billing", async route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,apikey,content-type,x-client-info" } });
      attempts++;
      await route.fulfill({ status: attempts === 1 ? 403 : 200, json: attempts === 1
        ? { error: "platform_admin_required", diagnostic: "private-stripe-diagnostic" }
        : { ...stripeReadinessFixture(), signature_delivery_verified: true, diagnostic: "private-stripe-diagnostic" },
        headers: { "access-control-allow-origin": "*" } });
    });
    await openProviders(page);
    const card = page.getByRole("region", { name: "Conexión de Stripe", exact: true });
    await card.getByRole("button", { name: "Comprobar Stripe", exact: true }).click();
    await expect(card.getByRole("alert")).toHaveText("Solo la administración global puede comprobar Stripe.");
    await card.getByRole("button", { name: "Comprobar Stripe", exact: true }).click();
    await expect(card.getByRole("alert")).toHaveText("La comprobación de Stripe no devolvió un resultado válido.");
    await expect(card.getByRole("status")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("private-stripe-diagnostic");
    expect(attempts).toBe(2);
  });

  test("enlace directo, ambos temas y limpieza offline son accesibles", async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await fixtures(page);
    await page.route("**/functions/v1/truckcontrol-billing", async route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,apikey,content-type,x-client-info" } });
      await route.fulfill({ json: stripeReadinessFixture(), headers: { "access-control-allow-origin": "*" } });
    });
    await login(page, "pedidos@smartscaneuskadi.com");
    await expect(page.getByRole("heading", { name: "Tu centro de administración", exact: true })).toBeVisible();
    await page.goto("/#/admin?section=providers");
    const card = page.getByRole("region", { name: "Conexión de Stripe", exact: true });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Comprobar Stripe", exact: true }).click();
    await expect(card.getByRole("status")).toBeVisible();
    for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
      await page.getByRole("button", { name: "Apariencia", exact: true }).click();
      const appearance = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
      await appearance.getByRole("radio", { name: theme, exact: true }).check();
      await appearance.getByLabel("Animaciones", { exact: true }).selectOption("off");
      await appearance.getByRole("button", { name: "Aplicar apariencia" }).click();
      await appearance.getByRole("button", { name: "Cerrar ventana" }).click();
      expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      await card.screenshot({ path: testInfo.outputPath(`stripe-${theme.replace(/ /g, "-")}.png`) });
    }
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(card.getByRole("status")).toHaveCount(0);
  });

  test("una cuenta Básico no muestra ni consulta el diagnóstico administrativo", async ({ page }) => {
    const f = await fixtures(page);
    f.controls.companyPlan = "limited";
    f.snapshot.customers[0].trial_plan_id = "limited";
    let reads = 0;
    await page.route("**/functions/v1/truckcontrol-billing", async route => { reads++; await route.fulfill({ status: 403, json: { error: "platform_admin_required" } }); });
    await login(page, "customer@example.com");
    await expect(page).toHaveURL(/#\/dashboard/);
    await page.goto("/#/admin?section=providers");
    await expect(page.getByRole("button", { name: "Comprobar Stripe", exact: true })).toHaveCount(0);
    expect(reads).toBe(0);
  });
});


test("Stripe privado: identifica el formato inválido sin mostrar claves y conserva los borradores", async ({ page }) => {
  await fixtures(page);
  await page.route("**/functions/v1/truckcontrol-billing", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status:204, headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info"} });
    await route.fulfill({ json:{...stripeReadinessFixture(), credential_state:"invalid_format", stripe_key_configured:false, key_mode:null, account_checked:false, account_status:null, account_id:null, expected_account:false, charges_enabled:false, payouts_enabled:false, webhook_checked:false, webhook_status:null, webhook_id_matches:false, webhook_url_matches:false, webhook_events_match:false, webhook_api_version_matches:false, webhook_disabled:null }, headers:{"access-control-allow-origin":"*"} });
  });
  await openProviders(page);
  await page.getByLabel("Secreto nuevo de Google").fill("synthetic-draft-preserved");
  const card=page.getByRole("region",{name:"Conexión de Stripe",exact:true});
  await card.getByRole("button",{name:"Comprobar Stripe",exact:true}).click();
  await expect(card.getByRole("status")).toContainText("La clave de Stripe guardada no tiene un formato válido.");
  await expect(page.getByLabel("Secreto nuevo de Google")).toHaveValue("synthetic-draft-preserved");
});

test("Stripe privado: mantiene el contrato anterior sin inventar un diagnóstico", async ({ page }) => {
  await fixtures(page); const calls:string[]=[];
  await page.route("**/functions/v1/truckcontrol-billing", async route => {
    const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info"};
    if (route.request().method() === "OPTIONS") return route.fulfill({status:204,headers});
    const action=route.request().postDataJSON().action;calls.push(action);
    if(action === "admin_readiness_details") return route.fulfill({status:400,json:{error:"invalid_request"},headers});
    const {credential_state:_,signing_secret_state:__,...legacy}=stripeReadinessFixture();
    await route.fulfill({json:{...legacy,contract:"truckcontrol-stripe-readiness-v1"},headers});
  });
  await openProviders(page);const card=page.getByRole("region",{name:"Conexión de Stripe",exact:true});
  await card.getByRole("button",{name:"Comprobar Stripe",exact:true}).click();
  await expect(card.getByRole("status")).toContainText("El servidor aún no ofrece el detalle de configuración de Stripe.");
  expect(calls).toEqual(["admin_readiness_details","admin_readiness"]);
});
