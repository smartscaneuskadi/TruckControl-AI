import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleCatalog, featureLabels } from "../../src/domain/subscriptions";
import { riskEntrySchema } from "../../src/domain/subscription-risk-signals";
import {
  riskUiRow,
  riskUiActor as actor,
  riskUiStamp as stamp,
} from "../helpers/risk-ui-fixture";

async function fixture(page: Page) {
  let signedIn = false,
    current = riskUiRow();
  const operations = new Map<string, unknown>();
  const calls: Record<string, unknown>[] = [],
    controls = {
      denied: false,
      missing: false,
      lostReply: false,
      conflict: false,
    };
  const jwt =
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: actor,
        aud: "authenticated",
        role: "authenticated",
        session_id: "ab880000-0000-4000-8000-000000000001",
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
    features: exampleCatalog.plans.find((x) => x.id === "full")!.modules,
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
      return route.abort("blockedbyclient"); // No real provider/account calls in browser QA.
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
      data = signedIn ? user : { message: "Synthetic signed out" };
      if (!signedIn) status = 401;
    } else if (url.pathname === "/auth/v1/logout") signedIn = false;
    else if (url.pathname === "/rest/v1/organizations")
      data = [{ id: current.buyer_company_id, name: current.buyer_company_name }];
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
        modules: Object.entries(featureLabels).map(([id, label]) => ({
          id,
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
    else if (url.pathname.endsWith("/tc_admin_subscription_unlinked"))
      data =
        body.p_action === "capabilities"
          ? {
              contract: "subscription-unlinked-incidents-v1",
              available: true,
              payment_changes_available: false,
              license_changes_available: false,
              fiscal_emission_available: false,
            }
          : {
              contract: "subscription-unlinked-incidents-v1",
              items: [],
              next_cursor: null,
            };
    else if (url.pathname.endsWith("/tc_admin_subscription_risk")) {
      calls.push({ ...body, authorization: req.headers().authorization });
      if (controls.denied || !signedIn) {
        status = 403;
        data = { code: "42501", message: "PRIVATE-DO-NOT-DISPLAY" };
      } else if (controls.missing) {
        status = 404;
        data = { code: "PGRST202", message: "private_schema_missing" };
      } else if (body.p_action === "capabilities")
        data = {
          contract: "subscription-risk-v1",
          available: true,
          informational_only: true,
          refunds_available: false,
          license_changes_available: false,
          fiscal_emission_available: false,
        };
      else if (body.p_action === "list" || body.p_action === "detail")
        data = {
          contract: "subscription-risk-v1",
          items: [current],
          next_cursor: null,
        };
      else if (body.p_action === "history")
        data = {
          contract: "subscription-risk-v1",
          case_id: current.id,
          items: current.last_review
            ? [current.last_review, current.latest_provider]
            : [current.latest_provider],
          next_before_version: null,
        };
      else {
        if (controls.conflict) {
          status = 409;
          data = { code: "40001", message: "PRIVATE-CAS-DETAIL" };
        } else {
          const op = String(body.p_operation_id),
            note = (body.p_data as { note: string }).note;
          if (!operations.has(op)) {
            current = {
              ...current,
              row_version: 3,
              review_state: "reviewed",
              last_review: riskEntrySchema.parse({
                id: "ab990000-0000-4000-8000-000000000001",
                row_version: 3,
                kind: "review",
                actor_id: actor,
                created_at: stamp,
                provider: null,
                note,
              }),
            };
            operations.set(op, {
              contract: "subscription-risk-v1",
              case: current,
              replayed: false,
              operation: {
                id: op,
                actor_id: actor,
                expected_version: body.p_expected,
                applied_version: 3,
                note,
              },
            });
          }
          if (controls.lostReply) {
            controls.lostReply = false;
            return route.abort("failed");
          }
          data = operations.get(op);
        }
      }
    } else {
      status = 400;
      data = { code: "22023", message: "Unexpected synthetic endpoint" };
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
    name: "Señales tempranas de fraude",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Ver señal", exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Ver señal", exact: true }).click();
  await expect(
    panel.getByRole("heading", { name: "Señal observada", exact: true }),
  ).toBeVisible();
  return panel;
}
test("EFW is separate and informative; Root review preserves money and customer access", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  await expect(panel).toContainText(
    "no confirma fraude, un contracargo ni una pérdida",
  );
  await expect(panel).toContainText("Este importe no representa una pérdida");
  await panel
    .getByRole("button", { name: "Declarar revisión de señal", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Declarar revisión de señal",
    exact: true,
  });
  await dialog
    .getByLabel("Nota de revisión", { exact: true })
    .fill("Synthetic facts checked in provider");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Confirmar revisión de señal", exact: true })
    .click();
  await expect(panel).toContainText(
    "Revisión declarada. No modifica el pago ni el acceso.",
  );
  expect(f.count()).toBe(1);
  expect(f.calls.filter((x) => x.p_action === "review")).toHaveLength(1);
  const mutations = f.calls.filter((x) => x.p_action === "review");
  expect(mutations[0].p_expected).toBe(2);
  expect(JSON.stringify(mutations)).not.toMatch(
    /refund|cancel|license|company_id|task_id/,
  );
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(storage).not.toMatch(
    /Empresa sintética Radar|issfr_RiskOwned|Synthetic facts checked/,
  );
});
test("lost acknowledgement retries only the same UUID, version and note", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  f.controls.lostReply = true;
  await panel
    .getByRole("button", { name: "Declarar revisión de señal", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Declarar revisión de señal",
    exact: true,
  });
  await dialog
    .getByLabel("Nota de revisión", { exact: true })
    .fill("Synthetic uncertain review");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Confirmar revisión de señal", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Reintentar la misma declaración",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Nota de revisión", { exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", {
      name: "Reintentar la misma declaración",
      exact: true,
    })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(f.count()).toBe(1);
  const writes = f.calls.filter((x) => x.p_action === "review");
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
});
test("stale CAS is visible and cannot invent a successful review", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  f.controls.conflict = true;
  await panel
    .getByRole("button", { name: "Declarar revisión de señal", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Declarar revisión de señal",
    exact: true,
  });
  await dialog
    .getByLabel("Nota de revisión", { exact: true })
    .fill("Synthetic stale review");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Confirmar revisión de señal", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "ha cambiado en otro dispositivo",
  );
  expect(f.count()).toBe(0);
  await expect(panel).not.toContainText("PRIVATE-CAS-DETAIL");
});
test("revoked Root access clears private signals and history", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  f.controls.denied = true;
  await panel
    .getByRole("button", { name: "Actualizar señales", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "La sesión ya no permite",
  );
  await expect(panel).not.toContainText("Empresa sintética Radar");
  await expect(panel).not.toContainText("issfr_RiskOwned");
});
test("offline clears private observations and reconnection requires a fresh permission check", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  const prior = f.calls.filter((x) => x.p_action === "capabilities").length;
  await page.context().setOffline(true);
  await expect(panel).toContainText("no están disponibles sin conexión");
  await expect(panel).not.toContainText("Empresa sintética Radar");
  await page.context().setOffline(false);
  await expect(
    panel.getByRole("button", { name: "Ver señal", exact: true }),
  ).toBeVisible();
  expect(
    f.calls.filter((x) => x.p_action === "capabilities").length,
  ).toBeGreaterThan(prior);
});
test("missing additive schema fails closed and does not imply an active receiver", async ({
  page,
}) => {
  const f = await fixture(page),
    panel = await open(page);
  f.controls.missing = true;
  await panel
    .getByRole("button", { name: "Actualizar señales", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "todavía no está disponible",
  );
  await expect(panel).not.toContainText("issfr_RiskOwned");
  await expect(panel).toContainText(
    "no acredita que el receptor esté activado",
  );
});
test("both themes remain readable, responsive and accessible without treating fixtures as provider acceptance", async ({
  page,
}) => {
  await fixture(page);
  const panel = await open(page);
  for (const theme of ["light", "cockpit"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await expect(
      panel.getByRole("heading", { name: "Señal observada", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .include('[aria-label="Señales tempranas de fraude"]')
      .analyze();
    expect(audit.violations).toEqual([]);
  }
});
