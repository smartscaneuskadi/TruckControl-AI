import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { exampleCatalog, featureLabels } from "../../src/domain/subscriptions";
import type { UnlinkedIncident } from "../../src/domain/subscription-unlinked-incidents";

const actor = "ab110000-0000-4000-8000-000000000001",
  id = "ab220000-0000-4000-8000-000000000001";
const stamp = "2026-11-13T07:00:00Z",
  contract = "subscription-unlinked-incidents-v1";
const row = (): UnlinkedIncident => ({
  id,
  request_id: "ab440000-0000-4000-8000-000000000001",
  buyer_company_id: "ab550000-0000-4000-8000-000000000001",
  checkout_id: "cs_test_Owned",
  payment_intent_id: "pi_Owned",
  charge_id: "ch_Owned",
  invoice_id: null,
  subscription_id: null,
  period_start: null,
  period_end: null,
  amount_cents: 36300,
  currency: "EUR",
  reason: "payment_task_missing",
  row_version: 2,
  created_at: stamp,
  review_state: "pending",
  link_state: "unlinked",
  last_action: null,
  link: null,
  latest_provider: {
    event_id: "evt_Owned",
    event_type: "refund.created",
    event_created: stamp,
    object_type: "refund",
    object_id: "re_Owned",
    status_at_event: "succeeded",
    current_status: "succeeded",
    event_amount_cents: 5000,
    current_amount_cents: 5000,
    charge_amount_refunded_cents: 5000,
  },
});
async function fixture(page: Page) {
  let signedIn = false,
    current = row();
  const operations = new Map<string, unknown>(),
    calls: Record<string, unknown>[] = [];
  const controls = { denied: false, lostReply: false };
  const jwt =
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: actor,
        aud: "authenticated",
        role: "authenticated",
        session_id: "ab660000-0000-4000-8000-000000000001",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".synthetic";
  const user = {
    id: actor,
    aud: "authenticated",
    role: "authenticated",
    email: "operator@example.invalid",
    email_confirmed_at: stamp,
    user_metadata: {},
  };
  const access = {
    is_admin: true,
    active: true,
    profile: null,
    features: exampleCatalog.plans.find((p) => p.id === "full")!.modules,
    plan: "full",
    max_trucks: 50,
    requires_phone_verification: false,
    can_manage: true,
    can_write: true,
    organization_id: current.buyer_company_id,
    company_role: "owner",
    sms_ready: false,
    prices_are_examples: true,
    payments_enabled: false,
  };
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== "http://127.0.0.1:9999") {
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost")
        return route.continue();
      return route.abort("blockedbyclient");
    }
    const body = req.postData()
      ? (req.postDataJSON() as Record<string, unknown>)
      : {};
    const headers = {
      "Access-Control-Allow-Origin": req.headers().origin ?? "*",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,prefer",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers, body: "" });
    let status = 200,
      data: unknown = {};
    if (url.pathname === "/auth/v1/token") {
      signedIn = true;
      data = {
        access_token: jwt,
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      };
    } else if (url.pathname === "/auth/v1/user") {
      data = user;
      if (!signedIn) {
        status = 401;
        data = { message: "Synthetic signed out" };
      }
    } else if (url.pathname === "/auth/v1/logout") signedIn = false;
    else if (url.pathname.endsWith("/tc_public_catalog")) data = exampleCatalog;
    else if (
      url.pathname.endsWith("/tc_my_access") ||
      url.pathname.endsWith("/tc_finish_registration")
    )
      data = access;
    else if (url.pathname.endsWith("/tc_admin_control"))
      data = {
        settings: {
          prices_are_examples: true,
          payments_enabled: false,
          sms_ready: false,
          registration_open: true,
        },
        plans: exampleCatalog.plans,
        modules: Object.entries(featureLabels).map(([key, label]) => ({
          id: key,
          label,
          enabled: true,
        })),
        customers: [],
        pending_registrations: [],
        payment_requests: [],
        audit: [],
      };
    else if (url.pathname.endsWith("/tc_admin_subscription_incidents"))
      data =
        body.p_action === "capabilities"
          ? {
              contract: "subscription-financial-incidents-v1",
              available: true,
              refunds_available: false,
              license_changes_available: false,
              rectification_emission_available: false,
            }
          : {
              contract: "subscription-financial-incidents-v1",
              items: [],
              next_cursor: null,
            };
    else if (url.pathname.endsWith("/tc_admin_subscription_unlinked")) {
      calls.push({ ...body, authorization: req.headers().authorization });
      const action = String(body.p_action);
      if (controls.denied || !signedIn) {
        status = 403;
        data = { code: "42501", message: "PRIVATE-DO-NOT-DISPLAY" };
      } else if (action === "capabilities")
        data = {
          contract,
          available: true,
          payment_changes_available: false,
          license_changes_available: false,
          fiscal_emission_available: false,
        };
      else if (action === "list" || action === "detail")
        data = { contract, items: [current], next_cursor: null };
      else if (action === "history")
        data = { contract, case_id: id, items: [], next_before_version: null };
      else {
        const operation = String(body.p_operation_id),
          input = body.p_data as { reason: string; evidence_reference: string };
        if (!operations.has(operation)) {
          current = {
            ...current,
            row_version: current.row_version + 1,
            review_state: action === "dismiss" ? "dismissed" : "reviewed",
            last_action: {
              kind: action as "review" | "dismiss",
              actor_id: actor,
              row_version: current.row_version + 1,
              created_at: stamp,
              ...input,
            },
          };
          operations.set(operation, {
            contract,
            case: current,
            operation: {
              id: operation,
              action,
              actor_id: actor,
              expected_version: body.p_expected,
              applied_version: current.row_version,
              ...input,
            },
          });
        }
        if (controls.lostReply) {
          controls.lostReply = false;
          return route.abort("failed");
        }
        data = operations.get(operation);
      }
    } else {
      status = 400;
      data = { code: "22023", message: "Unexpected synthetic request" };
    }
    return route.fulfill({ status, headers, body: JSON.stringify(data) });
  });
  return { controls, calls, count: () => operations.size };
}
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("operator@example.invalid");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Incidencias de pagos", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Incidencias sin tarea vinculada",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Revisar registro" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Revisar registro" }).click();
  return panel;
}

test("la revisión exige motivo/evidencia y nunca presenta una licencia o factura resuelta", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  await expect(panel).toContainText(
    "No resuelve el pago, la licencia ni las obligaciones fiscales",
  );
  await panel
    .getByRole("button", { name: "Declarar revisión", exact: true })
    .click();
  await panel
    .getByLabel("Motivo", { exact: true })
    .fill("Evidence checked in external provider");
  await panel
    .getByLabel("Referencia de evidencia", { exact: true })
    .fill("Synthetic review reference");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Registrar declaración" }).click();
  await expect(panel).toContainText("Declaración registrada.");
  expect(f.count()).toBe(1);
  expect(
    f.calls.filter((call) => call.p_action === "review")[0].p_expected,
  ).toBe(2);
  await expect(
    panel.getByRole("button", { name: "Ver tarea fiscal existente" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("pi_Owned");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("un ACK perdido conserva la misma operación y bloquea editar su motivo", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  f.controls.lostReply = true;
  await panel
    .getByRole("button", { name: "Declarar descarte de revisión" })
    .click();
  await panel
    .getByLabel("Motivo", { exact: true })
    .fill("External duplicate reviewed");
  await panel
    .getByLabel("Referencia de evidencia", { exact: true })
    .fill("Synthetic duplicate reference");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Registrar declaración" }).click();
  await expect(
    panel.getByRole("button", { name: "Reintentar la misma declaración" }),
  ).toBeVisible();
  await expect(panel.getByLabel("Motivo", { exact: true })).toBeDisabled();
  await panel
    .getByRole("button", { name: "Reintentar la misma declaración" })
    .click();
  await expect(panel).toContainText("Declaración registrada.");
  expect(f.count()).toBe(1);
  const writes = f.calls.filter((call) => call.p_action === "dismiss");
  expect(writes).toHaveLength(2);
  expect(writes[0].p_operation_id).toBe(writes[1].p_operation_id);
  expect(writes[0].p_data).toEqual(writes[1].p_data);
});
test("la revocación administrativa limpia los datos y no acepta una declaración", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  f.controls.denied = true;
  await panel
    .getByRole("button", { name: "Declarar revisión", exact: true })
    .click();
  await panel
    .getByLabel("Motivo", { exact: true })
    .fill("Review not authorized");
  await panel
    .getByLabel("Referencia de evidencia", { exact: true })
    .fill("Synthetic revoked reference");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Registrar declaración" }).click();
  await expect(panel.getByRole("alert")).toContainText("sesión");
  expect(f.count()).toBe(0);
  await expect(panel).not.toContainText("pi_Owned");
  await expect(panel).not.toContainText("PRIVATE-DO-NOT-DISPLAY");
});
