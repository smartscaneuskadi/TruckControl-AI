import { expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { exampleCatalog } from "../../src/domain/subscriptions";
import { disabledFiscalPolicy } from "../../src/domain/company-fiscal";
import type { ManualFullState } from "../../src/domain/company-full";
export const actor = "10000000-0000-4000-8000-000000000151";
export const other = "10000000-0000-4000-8000-000000000152";
export const org = "20000000-0000-4000-8000-000000000151";
export const backup = "40000000-0000-4000-8000-000000000152";
export const primary = "40000000-0000-4000-8000-000000000151";
export const secret = "SYNTHETIC_MFA_RAM_SECRET";
export const goodCode = "654321";
const stamp = "2026-11-15T00:00:00Z";
export type Factor = {
  id: string;
  factor_type: "totp";
  status: "verified" | "unverified";
  friendly_name: string;
  created_at: string;
  updated_at: string;
};
export const factor = (
  id = primary,
  name = "Principal ficticio",
  status: Factor["status"] = "verified",
): Factor => ({
  id,
  factor_type: "totp",
  status,
  friendly_name: name,
  created_at: stamp,
  updated_at: stamp,
});
export const jwt = (
  id = actor,
  aal = "aal1",
  revision = 1,
  sid = "session-" + id,
) =>
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      aud: "authenticated",
      role: "authenticated",
      aal,
      session_id: sid,
      jti: revision,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url") +
  ".c3ludGhldGlj";

export async function nativeFixture(
  context: BrowserContext,
  {
    factors = [],
    company = false,
    backendOrigin = "http://127.0.0.1:9999",
  }: { factors?: Factor[]; company?: boolean; backendOrigin?: string } = {},
) {
  if (
    ![
      "http://127.0.0.1:9999",
      "https://kkkemaycedexymrpaqtp.supabase.co",
    ].includes(backendOrigin)
  )
    throw new Error("Unexpected synthetic backend origin");
  const controls = {
    factors: new Map<string, Factor[]>([
      [actor, factors],
      [other, []],
    ]),
    capability: { schema_version: 1, totp_enforcement: true } as unknown,
    capabilityStatus: 200,
    sessionStatus: 200,
    failUser: false,
    holdUser: false,
    userPending: false,
    releaseUser: () => {},
    unsafeQr: false,
    unsafeStyle: false,
    largeQr: false,
    ignoreVerification: false,
    revision: 1,
    loginAal: "aal1",
    refreshAal: "aal2",
    holdEnroll: false,
    holdVerify: false,
    holdLogout: false,
    holdRemoval: false,
    enrollmentPending: false,
    verificationPending: false,
    logoutPending: false,
    removalPending: false,
    releaseEnroll: () => {},
    releaseVerify: () => {},
    releaseLogout: () => {},
    releaseRemoval: () => {},
    boundFactor: new Map<string, string>(),
    organizations: [{ id: org, name: "Empresa MFA ficticia" }],
    manualFullEnabled: null as boolean | null,
    companyActor: null as string | null,
  };
  let fullRevision = 0;
  const observedAt = () => new Date().toISOString();
  const fullState = (): ManualFullState =>
    controls.manualFullEnabled === null
      ? {
          schema_version: 1,
          configured: false,
          status: "unconfigured",
          enabled: null,
          expires_at: null,
          revision: 0,
          updated_at: null,
        }
      : {
          schema_version: 1,
          configured: true,
          status: controls.manualFullEnabled ? "active" : "disabled",
          enabled: controls.manualFullEnabled,
          expires_at: null,
          revision: Math.max(1, fullRevision),
          updated_at: observedAt(),
        };
  const fullItem = () => ({
    organization_id: org,
    company_name: "Empresa MFA ficticia",
    owner_id: company ? actor : other,
    owner_email: company ? "owner@example.com" : "other@example.com",
    manual_full: fullState(),
    effective_active: controls.manualFullEnabled === true,
    effective_plan: controls.manualFullEnabled === true ? "full" : null,
  });
  const calls: {
    path: string;
    method: string;
    actor: string | null;
    aal: string | null;
    body: Record<string, unknown> | null;
  }[] = [];
  const blocked: string[] = [];
  const user = (id = actor) => ({
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === actor ? "owner@example.com" : "other@example.com",
    email_confirmed_at: stamp,
    phone_confirmed_at: stamp,
    phone: "34600000001",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { mfa_passed: true, aal: "aal2" },
    identities: [],
    created_at: stamp,
    updated_at: stamp,
    factors: structuredClone(controls.factors.get(id) ?? []),
  });
  const session = (id = actor, aal = "aal1", sid = "session-" + id) => ({
    access_token: jwt(id, aal, ++controls.revision, sid),
    refresh_token: "synthetic-refresh-" + id,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: user(id),
  });
  const customer = {
    user_id: actor,
    email: "owner@example.com",
    contact_name: "Persona ficticia",
    company_name: "Empresa MFA ficticia",
    tax_id: "DEMO-MFA",
    address: "Calle ficticia 1",
    phone: "+34600000001",
    requested_plan: "limited",
    trial_plan_id: "limited",
    paid_plan: null,
    status: "trial",
    trial_started_at: stamp,
    trial_ends_at: new Date(Date.now() + 86400000 * 10).toISOString(),
    paid_until: null,
    ai_allowed: false,
    ai_opt_in: false,
    module_overrides: {},
    created_at: stamp,
    updated_at: stamp,
  };
  const access = (id = actor, scoped = false) => ({
    is_admin: !company && id !== controls.companyActor,
    active: true,
    features: exampleCatalog.plans.find((p) => p.id === "limited")!.modules,
    profile:
      company || id === controls.companyActor
        ? { ...customer, user_id: id, email: user(id).email }
        : null,
    plan: "limited",
    max_trucks: 50,
    requires_phone_verification: false,
    company_role: "owner",
    can_write: true,
    can_manage: true,
    organization_id: org,
    sms_ready: false,
    prices_are_examples: true,
    payments_enabled: false,
    user_id: id,
    ...(company && scoped && controls.manualFullEnabled !== null
      ? {
          active: controls.manualFullEnabled,
          plan: controls.manualFullEnabled ? "full" : null,
          features: controls.manualFullEnabled
            ? exampleCatalog.plans.find((p) => p.id === "full")!.modules
            : [],
          can_write: controls.manualFullEnabled,
          can_manage: controls.manualFullEnabled,
          manual_full: fullState(),
          observed_at: observedAt(),
        }
      : {}),
  });
  await context.addInitScript(
    ({ secret, goodCode }) => {
      const writes: string[] = [];
      Object.defineProperty(window, "__mfaSecretWrites", { value: writes });
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (
          String(value).includes(secret) ||
          String(value).includes(goodCode) ||
          String(value).includes("otpauth://")
        )
          writes.push(key);
        return original.call(this, key, value);
      };
    },
    { secret, goodCode },
  );
  await context.routeWebSocket("**/*", (socket) => {
    blocked.push(socket.url());
    socket.close();
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      [
        "http://127.0.0.1:4204",
        "http://127.0.0.1:4205",
        "http://127.0.0.1:4206",
      ].includes(url.origin)
    )
      return route.continue();
    if (url.origin !== backendOrigin) {
      blocked.push(request.url());
      return route.abort("blockedbyclient");
    }
    const headers = {
      "Access-Control-Allow-Origin": request.headers().origin ?? "*",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,prefer,x-supabase-api-version,range,range-unit",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Expose-Headers": "x-supabase-api-version",
      "Content-Type": "application/json",
      "x-supabase-api-version": "2024-01-01",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers, body: "" });
    let claims: { sub?: string; aal?: string; session_id?: string } = {};
    try {
      claims = JSON.parse(
        Buffer.from(
          (request.headers().authorization ?? "").split(".")[1],
          "base64url",
        ).toString(),
      );
    } catch {
      /* public request */
    }
    const id = claims.sub ?? actor,
      body = request.postDataJSON() as Record<string, unknown> | null,
      path = url.pathname;
    calls.push({
      path,
      method: request.method(),
      actor: claims.sub ?? null,
      aal: claims.aal ?? null,
      body,
    });
    let data: unknown = null,
      status = 200;
    if (path === "/auth/v1/token") {
      const nextId =
        body?.email === "other@example.com"
          ? other
          : String(body?.refresh_token ?? "").endsWith(other)
            ? other
            : actor;
      data = session(
        nextId,
        url.searchParams.get("grant_type") === "refresh_token"
          ? controls.refreshAal
          : controls.loginAal,
      );
    } else if (path === "/auth/v1/user") {
      if (controls.holdUser) {
        controls.userPending = true;
        await new Promise<void>((resolve) => {
          controls.releaseUser = resolve;
        });
      }
      data = controls.failUser
        ? { code: "unexpected_failure", message: "Private provider diagnostic" }
        : user(id);
      if (controls.failUser) status = 500;
    } else if (path === "/auth/v1/logout") {
      controls.logoutPending = true;
      if (controls.holdLogout)
        await new Promise<void>((resolve) => {
          controls.releaseLogout = resolve;
        });
      data = {};
    } else if (path === "/auth/v1/factors" && request.method() === "POST") {
      controls.enrollmentPending = true;
      if (controls.holdEnroll)
        await new Promise<void>((resolve) => {
          controls.releaseEnroll = resolve;
        });
      const nextId = (controls.factors.get(id)?.length ?? 0) ? backup : primary;
      controls.factors
        .get(id)!
        .push(factor(nextId, String(body?.friendly_name ?? ""), "unverified"));
      data = {
        id: nextId,
        type: "totp",
        totp: {
          secret,
          uri: "otpauth://totp/synthetic",
          qr_code: controls.unsafeQr
            ? '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://blocked.example/qr.svg"/></svg>'
            : controls.unsafeStyle
              ? '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" style="fill:url(https://blocked.example/style);stroke:none"/></svg>'
              : '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">' +
                (controls.largeQr
                  ? Array.from(
                      { length: 4000 },
                      (_, index) =>
                        `<rect x="${index % 64}" y="${Math.floor(index / 64)}" width="1" height="1" style="fill:${index % 2 ? "black" : "white"};stroke:none"/>`,
                    ).join("")
                  : '<rect x="0" y="0" width="100" height="100" style="fill:white;stroke:none"/><rect x="10" y="10" width="80" height="80" style="fill:black;stroke:none"/>') +
                "</svg>",
        },
      };
    } else if (/\/auth\/v1\/factors\/[^/]+\/challenge$/.test(path))
      data = {
        id: "synthetic-challenge",
        type: "totp",
        expires_at: 9999999999,
      };
    else if (/\/auth\/v1\/factors\/[^/]+\/verify$/.test(path)) {
      controls.verificationPending = true;
      if (controls.holdVerify)
        await new Promise<void>((resolve) => {
          controls.releaseVerify = resolve;
        });
      if (body?.code !== goodCode) {
        status = 422;
        data = {
          code: "mfa_verification_failed",
          message: "Never display this raw diagnostic",
        };
      } else {
        const factorId = path.split("/")[4];
        if (!controls.ignoreVerification) {
          controls.factors.set(
            id,
            (controls.factors.get(id) ?? []).filter(
              (f) => f.id === factorId || f.status === "verified",
            ),
          );
          controls.factors.get(id)?.forEach((f) => {
            if (f.id === factorId) f.status = "verified";
          });
        }
        controls.boundFactor.set(id, factorId);
        data = session(id, "aal2", claims.session_id ?? "session-" + id);
      }
    } else if (
      /\/auth\/v1\/factors\/[^/]+$/.test(path) &&
      request.method() === "DELETE"
    ) {
      const factorId = path.split("/")[4];
      controls.removalPending = true;
      if (controls.holdRemoval)
        await new Promise<void>((resolve) => {
          controls.releaseRemoval = resolve;
        });
      if (
        claims.aal !== "aal2" &&
        controls.factors
          .get(id)
          ?.some((f) => f.id === factorId && f.status === "verified")
      ) {
        status = 403;
        data = { code: "insufficient_aal" };
      } else {
        controls.factors.set(
          id,
          (controls.factors.get(id) ?? []).filter((f) => f.id !== factorId),
        );
        if (controls.boundFactor.get(id) === factorId)
          controls.boundFactor.delete(id);
        data = { id: factorId };
      }
    } else if (path === "/rest/v1/rpc/tc_public_catalog") data = exampleCatalog;
    else if (path === "/rest/v1/rpc/tc_mfa_protection_status") {
      data = controls.capability;
      status = controls.capabilityStatus;
    } else if (path === "/rest/v1/rpc/tc_verified_session") {
      const enrolled = controls.factors
        .get(id)
        ?.some((f) => f.status === "verified");
      data =
        !enrolled ||
        (claims.aal === "aal2" &&
          controls.factors
            .get(id)
            ?.some(
              (f) =>
                f.status === "verified" &&
                f.id === controls.boundFactor.get(id),
            ));
      status = controls.sessionStatus;
    } else {
      const enrolled = controls.factors
        .get(id)
        ?.some((f) => f.status === "verified");
      if (
        enrolled &&
        (claims.aal !== "aal2" || !controls.boundFactor.has(id))
      ) {
        status = 403;
        data = { code: "42501", message: "Native MFA required" };
      } else if (
        [
          "tc_finish_registration",
          "tc_organization_access",
          "tc_my_access",
        ].some((name) => path === "/rest/v1/rpc/" + name)
      )
        data = access(id, path === "/rest/v1/rpc/tc_organization_access");
      else if (path === "/rest/v1/rpc/tc_admin_company_full") {
        if (company || id !== actor) {
          status = 403;
          data = { code: "42501" };
        } else if (body?.p_action === "capabilities")
          data = {
            schema_version: 1,
            manual_company_full: true,
            observed_at: observedAt(),
          };
        else if (body?.p_action === "list")
          data = {
            schema_version: 1,
            observed_at: observedAt(),
            items: [fullItem()],
            next_after: null,
          };
        else if (body?.p_action === "set" && body.p_org === org) {
          const input = body.p_data as { enabled?: unknown };
          if (
            body.p_expected !== fullState().revision ||
            typeof input.enabled !== "boolean"
          ) {
            status = 409;
            data = { code: "40001" };
          } else {
            fullRevision = fullState().revision + 1;
            controls.manualFullEnabled = input.enabled;
            data = {
              schema_version: 1,
              observed_at: observedAt(),
              item: fullItem(),
              operation_id: body.p_operation,
              replayed: false,
              applied_revision: fullRevision,
            };
          }
        } else {
          blocked.push(request.url());
          return route.abort("blockedbyclient");
        }
      } else if (path === "/rest/v1/rpc/tc_admin_control")
        data = {
          settings: {
            prices_are_examples: true,
            payments_enabled: false,
            sms_ready: false,
            registration_open: true,
          },
          plans: exampleCatalog.plans,
          modules: [],
          customers: [],
          pending_registrations: [],
          payment_requests: [],
          audit: [],
        };
      else if (path === "/rest/v1/organizations")
        data =
          company || id === controls.companyActor ? controls.organizations : [];
      else if (
        path === "/rest/v1/rpc/tc_team_control" &&
        body?.p_action === "invitations"
      )
        data = [];
      else if (
        ["trucks", "drivers", "finance_entries"].some(
          (name) => path === "/rest/v1/" + name,
        )
      )
        data = [];
      else if (
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
          organization_id: org,
          organization_name: "Empresa MFA ficticia",
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
    user,
    session,
    privateCalls: () =>
      calls.filter(
        (c) =>
          c.path.startsWith("/rest/") &&
          ![
            "/rest/v1/rpc/tc_public_catalog",
            "/rest/v1/rpc/tc_mfa_protection_status",
            "/rest/v1/rpc/tc_verified_session",
          ].includes(c.path),
      ),
  };
}
export async function login(
  page: Page,
  {
    legacy = false,
    email = "owner@example.com",
    theme = "cockpit",
    language = "es",
  } = {},
) {
  await page.addInitScript(
    ({ theme, language }) => {
      sessionStorage.setItem("truckcontrol-company-mode", "yes");
      localStorage.setItem("truckcontrol.ui.language", language);
      localStorage.setItem(
        "truckcontrol-appearance-v1:demo",
        JSON.stringify({
          preference: { theme, motion: "reduced" },
          pending: false,
        }),
      );
    },
    { theme, language },
  );
  await page.goto("/#/settings");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-only");
  await expect(
    page.getByRole("heading", {
      name: legacy ? "Entrar en mi empresa" : "Bienvenido a TruckControl",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
export async function openSecurity(page: Page, company = false) {
  if (company)
    await expect(
      page.getByRole("heading", { name: "Configuración", exact: true }),
    ).toBeVisible();
  else {
    await expect(
      page.getByRole("heading", { name: "Tu centro de administración" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Seguridad de la cuenta", exact: true })
      .click();
  }
  await expect(
    page
      .getByText("Sin autenticadores verificados", { exact: true })
      .or(page.getByText("Autenticadores verificados", { exact: true })),
  ).toBeVisible();
}
export async function noSecretStorage(page: Page) {
  const result = await page.evaluate(
    ({ secret, goodCode }) => ({
      leaked: [
        ...Object.values(localStorage),
        ...Object.values(sessionStorage),
      ].some(
        (value) =>
          value.includes(secret) ||
          value.includes(goodCode) ||
          value.includes("otpauth://"),
      ),
      writes: (window as unknown as { __mfaSecretWrites: string[] })
        .__mfaSecretWrites,
    }),
    { secret, goodCode },
  );
  expect(result).toEqual({ leaked: false, writes: [] });
}
export async function broadcast(page: Page, event: string, session: unknown) {
  await page.evaluate(
    ({ event, session }) => {
      if (session)
        localStorage.setItem("truckcontrol-auth-v1", JSON.stringify(session));
      else localStorage.removeItem("truckcontrol-auth-v1");
      const channel = new BroadcastChannel("truckcontrol-auth-v1");
      channel.postMessage({ event, session });
      channel.close();
    },
    { event, session },
  );
}
