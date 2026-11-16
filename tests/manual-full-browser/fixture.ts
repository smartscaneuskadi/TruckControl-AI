import { expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { exampleCatalog } from "../../src/domain/subscriptions";
import { disabledFiscalPolicy } from "../../src/domain/company-fiscal";
import type {
  ManualFullState,
  CompanyFullAudit,
} from "../../src/domain/company-full";
export const root = "10000000-0000-4000-8000-000000000201",
  owner = "10000000-0000-4000-8000-000000000202",
  other = "10000000-0000-4000-8000-000000000203",
  member = "10000000-0000-4000-8000-000000000204";
export const orgA = "20000000-0000-4000-8000-000000000201",
  orgA2 = "20000000-0000-4000-8000-000000000202",
  orgB = "20000000-0000-4000-8000-000000000203",
  orgR = "20000000-0000-4000-8000-000000000204";
const companies = [
  { id: orgA, owner: owner, name: "Empresa A" },
  { id: orgA2, owner: owner, name: "Empresa A2" },
  { id: orgB, owner: other, name: "Empresa B" },
  { id: orgR, owner: root, name: "Empresa Root" },
];
const stamp = "2026-11-15T00:00:00.000Z";
const email = (id: string) =>
  id === root
    ? "root@example.com"
    : id === other
      ? "other@example.com"
      : id === member
        ? "member@example.com"
        : "owner@example.com";
export function token(id: string, revision = 1) {
  return (
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: id,
        aud: "authenticated",
        role: "authenticated",
        session_id: "synthetic-session-" + id,
        jti: revision,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".c3ludGhldGlj"
  );
}
export async function fixture(context: BrowserContext) {
  const controls = {
    offset: 0,
    ownerTrialActive: false,
    cap: true,
    capVersion: 1,
    unavailable: false,
    conflict: false,
    loseAck: false,
    holdSet: false,
    setPending: false,
    releaseSet: () => {},
    holdAck: false,
    ackPending: false,
    releaseAck: () => {},
    orgDelay: 0,
    orgUnavailable: false,
    rootAuthorized: true,
  };
  const now = () => new Date(Date.now() + controls.offset).toISOString();
  const overrides = new Map<string, Omit<ManualFullState, "status">>();
  const audit: CompanyFullAudit[] = [];
  const receipts = new Map<
    string,
    { organizationId: string; actor: string; input: string; revision: number }
  >();
  const calls: {
    path: string;
    method: string;
    actor: string | null;
    body: Record<string, unknown> | null;
    org: string | null;
  }[] = [];
  const blocked: string[] = [];
  const state = (id: string): ManualFullState => {
    const value = overrides.get(id);
    return value
      ? {
          ...structuredClone(value),
          status: !value.enabled
            ? "disabled"
            : value.expires_at &&
                Date.parse(value.expires_at) <= Date.parse(now())
              ? "expired"
              : "active",
        }
      : {
          schema_version: 1,
          configured: false,
          status: "unconfigured",
          enabled: null,
          expires_at: null,
          revision: 0,
          updated_at: null,
        };
  };
  const isActive = (id: string) => {
    const value = state(id),
      company = companies.find((c) => c.id === id)!;
    return value.configured
      ? value.status === "active"
      : company.owner !== owner || controls.ownerTrialActive;
  };
  const profile = (id: string) => ({
    user_id: id,
    email: email(id),
    contact_name: "Persona ficticia",
    company_name: "Empresa ficticia",
    tax_id: "DEMO-FULL",
    address: "Calle ficticia 1",
    phone: "+34600000001",
    requested_plan: "limited",
    trial_plan_id: "limited",
    paid_plan: null,
    status: "trial",
    trial_started_at: stamp,
    trial_ends_at: new Date(
      Date.now() +
        ((id === owner || id === member) && !controls.ownerTrialActive
          ? -1
          : 10) *
          86400000,
    ).toISOString(),
    paid_until: null,
    ai_allowed: false,
    ai_opt_in: false,
    module_overrides: {},
    created_at: stamp,
    updated_at: stamp,
  });
  const user = (id: string) => ({
    id,
    aud: "authenticated",
    role: "authenticated",
    email: email(id),
    email_confirmed_at: stamp,
    phone_confirmed_at: stamp,
    phone: "34600000001",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { is_admin: true, paid_plan: "full" },
    identities: [],
    created_at: stamp,
    updated_at: stamp,
  });
  const session = (id: string, revision = 1) => ({
    access_token: token(id, revision),
    refresh_token: "synthetic-refresh-" + id,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: user(id),
  });
  const access = (id: string, orgId: string | null, bootstrap = false) => {
    const company = companies.find((c) => c.id === orgId),
      value = orgId ? state(orgId) : null;
    const active =
      id === root ||
      (bootstrap
        ? (id !== owner && id !== member) || controls.ownerTrialActive
        : Boolean(
            company &&
            (company.owner === id || (id === member && company.id === orgA)) &&
            isActive(company.id),
          ));
    const plan =
      !bootstrap && value?.configured && value.status === "active"
        ? "full"
        : "limited";
    const features = {
      ...exampleCatalog.plans.find((p) => p.id === plan)!.modules,
      invoice_ai: false,
      document_ai: false,
    };
    if (!active)
      for (const key of Object.keys(features))
        features[key as keyof typeof features] = false;
    return {
      is_admin: id === root && controls.rootAuthorized,
      active,
      features,
      profile: id === root ? null : profile(id),
      plan,
      max_trucks: 50,
      requires_phone_verification: false,
      company_role: id === member ? "admin" : "owner",
      can_write: active,
      can_manage: active,
      ...(orgId ? { organization_id: orgId, manual_full: value } : {}),
      observed_at: now(),
      sms_ready: false,
      prices_are_examples: true,
      payments_enabled: false,
    };
  };
  const item = (id: string) => {
    const company = companies.find((c) => c.id === id)!;
    return {
      organization_id: id,
      company_name: company.name,
      owner_id: company.owner,
      owner_email: email(company.owner),
      manual_full: state(id),
      effective_active: isActive(id),
      effective_plan:
        state(id).configured && state(id).status === "active"
          ? "full"
          : "limited",
    };
  };
  const change = (
    id: string,
    enabled: boolean,
    expiresAt: string | null = null,
    operationId = crypto.randomUUID(),
    actorId = root,
  ) => {
    const before = state(id),
      revision = before.revision + 1;
    overrides.set(id, {
      schema_version: 1,
      configured: true,
      enabled,
      expires_at: expiresAt,
      revision,
      updated_at: now(),
    });
    audit.push({
      organization_id: id,
      operation_id: operationId,
      revision,
      actor_id: actorId,
      actor_email: email(actorId),
      changed_at: now(),
      before,
      after: state(id),
    });
    return revision;
  };
  await context.routeWebSocket("**/*", (socket) => {
    blocked.push(socket.url());
    socket.close();
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4214") return route.continue();
    if (url.origin !== "http://127.0.0.1:9999") {
      blocked.push(request.url());
      return route.abort("blockedbyclient");
    }
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4214",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,prefer,range,range-unit,x-supabase-api-version",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Content-Type": "application/json",
      "x-supabase-api-version": "2024-01-01",
      "Access-Control-Expose-Headers": "x-supabase-api-version",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers, body: "" });
    let id: string | null = null;
    try {
      id = JSON.parse(
        Buffer.from(
          (request.headers().authorization ?? "").split(".")[1],
          "base64url",
        ).toString(),
      ).sub;
    } catch {
      /* anonymous request */
    }
    const body = request.postDataJSON() as Record<string, unknown> | null,
      path = url.pathname;
    const orgId =
      typeof body?.p_org === "string"
        ? body.p_org
        : (url.searchParams.get("organization_id")?.replace(/^eq\./, "") ??
          null);
    calls.push({ path, method: request.method(), actor: id, body, org: orgId });
    let data: unknown = null,
      status = 200;
    if (path === "/auth/v1/token") {
      const actorId = String(body?.email ?? "").startsWith("root")
        ? root
        : String(body?.email ?? "").startsWith("other")
          ? other
          : String(body?.email ?? "").startsWith("member")
            ? member
            : owner;
      data = session(actorId);
    } else if (path === "/auth/v1/user") data = user(id ?? owner);
    else if (path === "/auth/v1/logout") data = {};
    else if (path === "/rest/v1/rpc/tc_public_catalog") data = exampleCatalog;
    else if (path === "/rest/v1/organizations") {
      if (controls.orgDelay)
        await new Promise((resolve) => setTimeout(resolve, controls.orgDelay));
      data = companies
        .filter(
          (company) =>
            company.owner === id || (id === member && company.id === orgA),
        )
        .map((company) => ({ id: company.id, name: company.name }));
      if (controls.orgUnavailable) { status = 503; data = { code: "PGRST000" }; }
    } else if (path === "/rest/v1/rpc/tc_finish_registration")
      data = access(id ?? owner, null, true);
    else if (path === "/rest/v1/rpc/tc_organization_access") {
      if (controls.unavailable) {
        status = 503;
        data = { code: "PGRST000" };
      } else data = access(id ?? owner, orgId);
    } else if (
      path === "/rest/v1/rpc/tc_team_control" &&
      body?.p_action === "invitations"
    )
      data = [];
    else if (
      path === "/functions/v1/truckcontrol-subscriptions" &&
      body?.action === "status"
    )
      data = {
        configured: false,
        invoice_delivery_ready: false,
        management_available: false,
        refresh_available: false,
        terms_version: null,
        terms_url: null,
        subscription: null,
        invoices: [],
      };
    else if (path === "/rest/v1/rpc/tc_admin_control") {
      if (id !== root || !controls.rootAuthorized) {
        status = 403;
        data = { code: "42501" };
      } else
        data = {
          settings: {
            prices_are_examples: true,
            payments_enabled: false,
            sms_ready: false,
            registration_open: true,
          },
          plans: exampleCatalog.plans,
          modules: [],
          customers: [profile(owner), profile(other)],
          pending_registrations: [],
          payment_requests: [],
          audit: [],
        };
    } else if (path === "/rest/v1/rpc/tc_admin_company_full") {
      if (id !== root || !controls.rootAuthorized) {
        status = 403;
        data = { code: "42501", message: "Private root-only diagnostic" };
      } else if (body?.p_action === "capabilities")
        data = {
          schema_version: controls.capVersion,
          manual_company_full: controls.cap,
          observed_at: now(),
        };
      else if (body?.p_action === "list") {
        const query = String(
          (body.p_data as Record<string, unknown>)?.query ?? "",
        ).toLowerCase();
        data = {
          schema_version: 1,
          observed_at: now(),
          items: companies
            .filter(
              (c) =>
                !query ||
                c.name.toLowerCase().includes(query) ||
                email(c.owner).includes(query),
            )
            .map((c) => item(c.id)),
          next_after: null,
        };
      } else if (body?.p_action === "history")
        data = {
          schema_version: 1,
          observed_at: now(),
          items: audit
            .filter((entry) => entry.organization_id === orgId)
            .slice()
            .reverse(),
          next_before_revision: null,
        };
      else if (body?.p_action === "set" && orgId) {
        controls.setPending = true;
        if (controls.holdSet)
          await new Promise<void>((resolve) => {
            controls.releaseSet = resolve;
          });
        const input = body.p_data as {
            enabled: boolean;
            expires_at: string | null;
          },
          operationId = String(body.p_operation),
          saved = receipts.get(operationId),
          signature = JSON.stringify(input);
        if (
          saved &&
          (saved.organizationId !== orgId ||
            saved.actor !== id ||
            saved.input !== signature)
        ) {
          status = 400;
          data = { code: "22023" };
        } else if (
          !saved &&
          (controls.conflict ||
            Number(body.p_expected) !== state(orgId).revision)
        ) {
          status = 409;
          data = { code: "40001" };
        } else if (
          input.expires_at &&
          Date.parse(input.expires_at) <= Date.parse(now())
        ) {
          status = 400;
          data = { code: "22023" };
        } else {
          const revision =
            saved?.revision ??
            change(orgId, input.enabled, input.expires_at, operationId);
          if (!saved)
            receipts.set(operationId, {
              organizationId: orgId,
              actor: id!,
              input: signature,
              revision,
            });
          data = {
            schema_version: 1,
            observed_at: now(),
            item: item(orgId),
            operation_id: operationId,
            replayed: Boolean(saved),
            applied_revision: revision,
          };
          if (controls.holdAck) {
            controls.ackPending = true;
            await new Promise<void>((resolve) => {
              controls.releaseAck = resolve;
            });
          }
          if (controls.loseAck) {
            controls.loseAck = false;
            return route.abort("failed");
          }
        }
      } else {
        status = 400;
        data = { code: "22023" };
      }
    } else {
      const allowed =
        orgId &&
        companies.some(
          (c) =>
            c.id === orgId &&
            (c.owner === id || (id === member && c.id === orgA)),
        ) &&
        isActive(orgId);
      if (!allowed) {
        status = 403;
        data = { code: "42501" };
      } else if (path === "/rest/v1/trucks")
        data = [
          {
            id: "30000000-0000-4000-8000-000000000201",
            organization_id: orgId,
            plate:
              orgId === orgA
                ? "1111 FUL"
                : orgId === orgA2
                  ? "2222 FUL"
                  : "3333 FUL",
            brand: "Ficticio",
            model: "Sintético",
            year: 2026,
            odometer_km: 1000,
            status: "available",
            driver_id: null,
            inspection_due_on: "2028-01-01",
            route: "Ruta ficticia",
            created_at: stamp,
            row_version: 1,
          },
        ];
      else if (
        ["drivers", "finance_entries"].some(
          (name) => path === "/rest/v1/" + name,
        ) ||
        ["tc_list_records", "tc_document_page", "tc_document_page_v2", "tc_tyre_page"].some(
          (name) => path === "/rest/v1/rpc/" + name,
        )
      )
        data = [];
      else if (path === "/rest/v1/rpc/tc_company_fiscal_control")
        data = {
          schema_version: 1,
          phase: "preparation",
          emission_available: false,
          organization_id: orgId,
          organization_name: companies.find((c) => c.id === orgId)!.name,
          policy: { ...disabledFiscalPolicy, version: null, updated_at: null },
          profile: null,
          configured_option_allowed: false,
        };
      else {
        blocked.push(request.url());
        return route.abort("blockedbyclient");
      }
    }
    await route
      .fulfill({ status, headers, body: JSON.stringify(data) })
      .catch(() => {});
  });
  return {
    controls,
    calls,
    blocked,
    overrides,
    audit,
    state,
    change,
    session,
    item,
  };
}
export async function login(
  page: Page,
  who: "root" | "owner" | "other" | "member" = "root",
  theme = "cockpit",
) {
  await page.addInitScript((theme) => {
    sessionStorage.setItem("truckcontrol-company-mode", "yes");
    localStorage.setItem(
      "truckcontrol-appearance-v1:demo",
      JSON.stringify({
        preference: { theme, motion: "reduced" },
        pending: false,
      }),
    );
  }, theme);
  await page.goto("/#/settings");
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill(who + "@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
export async function openCompanies(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Empresas · Pack Full", exact: true }),
  ).toBeVisible();
}
export async function broadcast(page: Page, session: unknown) {
  await page.evaluate((session) => {
    localStorage.setItem("truckcontrol-auth-v1", JSON.stringify(session));
    const channel = new BroadcastChannel("truckcontrol-auth-v1");
    channel.postMessage({ event: "SIGNED_IN", session });
    channel.close();
  }, session);
}
