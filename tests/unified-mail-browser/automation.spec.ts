/** Published-app/SDK behavior with closed synthetic HTTP; no real mailbox or model. */
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { actor, broadcast, org } from "../mfa-browser/fixture";
import { openMailAutomationPolicy } from "../../supabase/functions/_shared/mail-automation";
import type { OpenSessionMailGrant } from "../../supabase/functions/_shared/mail-automation";
import { presetReceivedPeriod } from "../../supabase/functions/_shared/mail-period";
import {
  test,
  expect,
  openMail,
  connectGmail,
  connectImap,
  noMailStorage,
  firstMail,
  secondMail,
  importButton,
  imapPassword,
} from "./fixture";
import type { MailFixture } from "./fixture";

const sid = "a7100000-0000-4000-8000-000000000001";
const nextSid = "a7100000-0000-4000-8000-000000000002";
const secondOrg = "20000000-0000-4000-8000-000000000152";
const automaticLabel =
  "Revisar facturas automáticamente mientras uso TruckControl";
const activateLabel = "Activar revisión automática";
const stopAllLabel = "Detener todas las revisiones";
const waitingLabel = "Esperando la siguiente revisión autorizada.";
const selected = (page: Page) => page.locator(".mail-provider-view:visible");
const accounts = (page: Page) =>
  page.getByRole("navigation", { name: "Correos conectados", exact: true });

async function ready(page: Page, mail: MailFixture, info: TestInfo) {
  await page.clock.install({ time: Date.now() });
  await openMail(page, info);
  // The retained MFA fixture's default SID is deliberately not a UUID. Give
  // these new grant tests a valid native SID instead of weakening validation.
  await broadcast(page, "SIGNED_IN", mail.auth.session(actor, "aal1", sid));
  mail.controls.automation = true;
}
async function openImport(page: Page) {
  await selected(page)
    .getByRole("button", { name: importButton, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: importButton, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function prepareAutomatic(page: Page) {
  const dialog = await openImport(page);
  await expect(dialog.locator(".mail-auto-mode input")).toBeEnabled();
  await dialog.locator(".mail-auto-mode input").check();
  await dialog.locator(".mail-invoice-consent input").check();
  await expect(
    dialog.getByRole("button", { name: activateLabel, exact: true }),
  ).toBeEnabled();
  return dialog;
}
async function activate(page: Page) {
  const dialog = await prepareAutomatic(page);
  await dialog
    .getByRole("button", { name: activateLabel, exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Revisión automática autorizada",
      exact: true,
    }),
  ).toBeVisible();
  return dialog;
}
async function settled(mail: MailFixture, count: number, dialog: Locator) {
  await expect.poll(() => mail.imports().length).toBe(count);
  // A request being observed does not mean the SDK response has been applied.
  // Advance the browser clock only after the scheduler returns to waiting.
  await expect(dialog.locator(".mail-automatic-status")).toContainText(
    waitingLabel,
  );
}
async function closeImport(page: Page) {
  await page
    .getByRole("dialog", { name: importButton, exact: true })
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
}
async function choose(page: Page, email: string) {
  await accounts(page)
    .getByRole("button", { name: email, exact: true })
    .click();
  await expect(
    selected(page).getByRole("heading", { name: email, exact: true }),
  ).toBeVisible();
}
async function advance(
  page: Page,
  milliseconds = openMailAutomationPolicy.min_interval_ms + 1000,
) {
  await page.clock.fastForward(milliseconds);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
}
async function noPrivateGrantStorage(page: Page, grant: OpenSessionMailGrant) {
  await noMailStorage(page);
  expect(
    await page.evaluate(
      (id) =>
        [...Object.values(localStorage), ...Object.values(sessionStorage)].some(
          (value) => value.includes(id),
        ),
      grant.id,
    ),
  ).toBe(false);
}

test("conectar y marcar opciones no activa revisiones sin el consentimiento separado", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  expect(mail.imports()).toEqual([]);
  const dialog = await openImport(page);
  await expect(dialog.locator(".mail-auto-mode input")).not.toBeChecked();
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await dialog.locator(".mail-invoice-consent input").check();
  await dialog.locator(".mail-auto-mode input").check();
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await expect(
    dialog.getByRole("button", { name: activateLabel, exact: true }),
  ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await noOverflow(page);
  await closeImport(page);
  await advance(page);
  expect(mail.imports()).toEqual([]);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await noMailStorage(page);
});

test("un backend anterior conserva la descarga manual y no ofrece automatización", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  mail.controls.automation = false;
  await connectGmail(page, mail);
  const dialog = await openImport(page);
  await expect(dialog.locator(".mail-auto-mode")).toHaveCount(0);
  await dialog.locator(".mail-invoice-consent input").check();
  await dialog
    .getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("region", {
      name: "Resultado de la descarga de facturas",
    }),
  ).toBeVisible();
  expect(mail.imports()).toHaveLength(1);
  expect(mail.imports()[0].body?.automation).toBeUndefined();
  await noMailStorage(page);
});

test("una cuenta IMAP autoriza la revisión con su conexión temporal y el SID vigente", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  const email = "automatic-imap@example.invalid";
  await connectImap(page, email);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  const call = mail.imports()[0],
    payload = call.body!,
    grant = payload.automation as OpenSessionMailGrant;
  expect(call.sid).toBe(sid);
  expect(payload).toMatchObject({
    provider: "imap",
    email,
    connection: { email, password: imapPassword },
    connector_consent: { version: "2026-11-13", accepted: true },
  });
  expect(payload.gmail_access_token).toBeUndefined();
  expect(grant).toMatchObject({
    actor_id: actor,
    organization_id: org,
    mailbox: email,
    provider: "imap",
    session_id: sid,
    aal: "aal1",
    accepted: true,
  });
  expect(JSON.stringify(grant)).not.toContain(imapPassword);
  await noPrivateGrantStorage(page, grant);
  await dialog
    .getByRole("button", { name: "Detener revisión automática", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Revisión automática detenida",
      exact: true,
    }),
  ).toBeVisible();
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
});

test("el grant mantiene cuenta, empresa, SID, fechas y caducidad y espera cinco minutos entre lotes", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  const token = await connectGmail(page, mail);
  mail.controls.hasMore = true;
  const dialog = await openImport(page);
  await expect(dialog.locator(".mail-auto-mode input")).toBeEnabled();
  await dialog
    .getByLabel("Período de correo", { exact: true })
    .selectOption("3m");
  const requested = await page.evaluate(() => Date.now());
  const period = presetReceivedPeriod("3m", requested);
  await dialog.locator(".mail-auto-mode input").check();
  await dialog.locator(".mail-invoice-consent input").check();
  await dialog
    .getByRole("button", { name: activateLabel, exact: true })
    .click();
  await settled(mail, 1, dialog);
  const first = mail.imports()[0],
    payload = first.body!,
    grant = payload.automation as OpenSessionMailGrant;
  expect(first.sid).toBe(sid);
  expect(grant).toMatchObject({
    version: openMailAutomationPolicy.consent_version,
    accepted: true,
    actor_id: actor,
    organization_id: org,
    session_id: sid,
    aal: "aal1",
    mailbox: firstMail,
    provider: "gmail",
    period,
  });
  expect(grant.account_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(grant.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(payload.period).toEqual(period);
  expect(payload.gmail_access_token).toBe(token);
  expect(payload.cursor).toBeNull();
  expect(
    Date.parse(grant.expires_at) - Date.parse(grant.started_at),
  ).toBeLessThanOrEqual(openMailAutomationPolicy.max_session_ms);
  await expect(
    dialog.getByLabel("Período de correo", { exact: true }),
  ).toBeDisabled();
  await advance(page, openMailAutomationPolicy.min_interval_ms - 60000);
  expect(mail.imports()).toHaveLength(1);
  mail.controls.hasMore = false;
  // Advancing virtual timers also starts the native permission heartbeat. Its
  // real HTTP must settle before another jump can expire request deadlines.
  // This fixture closes all external traffic, so networkidle drains only its
  // intercepted/local requests; retain the account and waiting-state checks.
  await page.waitForLoadState("networkidle");
  await expect(dialog.locator(".mail-automatic-status")).toContainText(
    waitingLabel,
  );
  await expect(
    accounts(page).getByRole("button", { name: firstMail, exact: true }),
  ).toBeVisible();
  await advance(page, 61000);
  await settled(mail, 2, dialog);
  expect(mail.imports()[1].body).toMatchObject({
    automation: grant,
    period,
    cursor: "synthetic-next-mail-cursor",
  });
  await page.waitForLoadState("networkidle");
  await expect(dialog.locator(".mail-automatic-status")).toContainText(
    waitingLabel,
  );
  await expect(
    accounts(page).getByRole("button", { name: firstMail, exact: true }),
  ).toBeVisible();
  await advance(page);
  await settled(mail, 3, dialog);
  expect(mail.imports()[2].body).toMatchObject({
    automation: grant,
    period: { from: period.to, to: period.to },
    cursor: null,
  });
  await noPrivateGrantStorage(page, grant);
});

test("un período que termina antes de hoy permite revisión manual pero bloquea la automática", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await openImport(page);
  await expect(dialog.locator(".mail-auto-mode input")).toBeEnabled();
  await dialog
    .getByLabel("Período de correo", { exact: true })
    .selectOption("custom");
  const previous = await page.evaluate(() => {
    const date = new Date(Date.now() - 86400000);
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Madrid",
    }).format(date);
  });
  await dialog.getByLabel("Recibidas hasta", { exact: true }).fill(previous);
  await dialog.locator(".mail-auto-mode input").check();
  await dialog.locator(".mail-invoice-consent input").check();
  await expect(dialog.getByRole("alert")).toContainText("debe terminar hoy");
  await expect(
    dialog.getByRole("button", { name: activateLabel, exact: true }),
  ).toBeDisabled();
  expect(mail.imports()).toEqual([]);
});

test("otra cuenta no hereda consentimiento y reconectar la misma dirección retira el grant anterior", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  await connectGmail(page, mail, secondMail);
  await choose(page, firstMail);
  let dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await choose(page, secondMail);
  dialog = await openImport(page);
  await expect(dialog.locator(".mail-auto-mode input")).not.toBeChecked();
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await expect(
    dialog.getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    }),
  ).toBeDisabled();
  await closeImport(page);
  await connectGmail(page, mail, firstMail);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  dialog = await openImport(page);
  await expect(dialog.locator(".mail-auto-mode input")).not.toBeChecked();
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  await noMailStorage(page);
});

test("dos cuentas comparten el intervalo y un único lote en vuelo", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  await connectGmail(page, mail, secondMail);
  await choose(page, firstMail);
  let dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await choose(page, secondMail);
  dialog = await activate(page);
  await expect(page.locator(".mail-automation-summary:visible")).toContainText(
    "2 cuenta(s)",
  );
  expect(mail.imports()).toHaveLength(1);
  mail.controls.holdImport = true;
  await advance(page);
  await expect.poll(() => mail.controls.pendingImports).toBe(1);
  expect(mail.imports()).toHaveLength(2);
  // Keep the HTTP flight below its real 150-second SDK deadline. A five-minute
  // hold would correctly trip the uncertainty circuit instead of resuming work.
  await advance(page, 60000);
  expect(mail.imports()).toHaveLength(2);
  mail.controls.holdImport = false;
  mail.releaseImports();
  await closeImport(page);
  await choose(page, firstMail);
  dialog = await openImport(page);
  await settled(mail, 2, dialog);
  await closeImport(page);
  await choose(page, secondMail);
  dialog = await openImport(page);
  await advance(page);
  await settled(mail, 3, dialog);
  expect(mail.imports().map((call) => call.body?.email)).toEqual([
    firstMail,
    firstMail,
    secondMail,
  ]);
  const grants = mail
    .imports()
    .map((call) => call.body?.automation as OpenSessionMailGrant);
  expect(grants[0].account_id).not.toBe(grants[2].account_id);
  expect(grants[0].id).not.toBe(grants[2].id);
  await noMailStorage(page);
});

test("Detener descarga cancela una activación cuya comprobación de estado sigue pendiente", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await prepareAutomatic(page);
  mail.controls.holdStatus = true;
  await dialog
    .getByRole("button", { name: activateLabel, exact: true })
    .click();
  await expect.poll(() => mail.controls.pendingStatuses).toBe(1);
  await dialog
    .getByRole("button", { name: "Detener descarga", exact: true })
    .click();
  mail.controls.holdStatus = false;
  mail.releaseStatuses();
  await expect(
    dialog.getByRole("button", { name: activateLabel, exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await advance(page);
  expect(mail.imports()).toEqual([]);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await noMailStorage(page);
});

test("Detener todas cancela la comprobación pendiente de una revisión periódica", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  mail.controls.holdStatus = true;
  await advance(page);
  await expect.poll(() => mail.controls.pendingStatuses).toBe(1);
  await page.getByRole("button", { name: stopAllLabel, exact: true }).click();
  mail.controls.holdStatus = false;
  mail.releaseStatuses();
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
});

test("navegar conserva la revisión y ofrece Detener flotante con diseño accesible", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  let dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await page.evaluate(() => {
    location.hash = "/dashboard";
  });
  const floating = page.locator(".mail-automation-floating");
  await expect(floating).toBeVisible();
  await expect(
    floating.getByRole("button", { name: stopAllLabel, exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await noOverflow(page);
  await advance(page);
  await expect.poll(() => mail.imports().length).toBe(2);
  await page.evaluate(() => {
    location.hash = "/mailbox";
  });
  dialog = await openImport(page);
  await settled(mail, 2, dialog);
  await closeImport(page);
  await page.evaluate(() => {
    location.hash = "/dashboard";
  });
  await floating
    .getByRole("button", { name: stopAllLabel, exact: true })
    .click();
  await expect(floating).toHaveCount(0);
  await advance(page);
  expect(mail.imports()).toHaveLength(2);
});

test("perder conexión detiene la revisión y volver a internet no la reactiva", async ({
  page,
  context,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await context.setOffline(true);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.locator("#mail-title")).toBeVisible();
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  await noMailStorage(page);
});

test("ocultar la aplicación retira el permiso y hacerla visible no lo restaura", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  const stopped = await openImport(page);
  await expect(stopped.locator(".mail-automatic-status")).toContainText(
    "al ocultar la aplicación",
  );
  await expect(
    stopped.locator(".mail-invoice-consent input"),
  ).not.toBeChecked();
});

for (const change of ["SID", "AAL"] as const)
  test(`cambiar ${change} retira cuentas y grants sin reactivarlos al reconectar`, async ({
    page,
    mail,
  }, info) => {
    await ready(page, mail, info);
    await connectGmail(page, mail);
    const dialog = await activate(page);
    await settled(mail, 1, dialog);
    await closeImport(page);
    await broadcast(
      page,
      "SIGNED_IN",
      mail.auth.session(
        actor,
        change === "AAL" ? "aal2" : "aal1",
        change === "SID" ? nextSid : sid,
      ),
    );
    await expect(page.locator(".mail-open-views")).toHaveCount(0);
    await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
    await connectGmail(page, mail);
    await advance(page);
    expect(mail.imports()).toHaveLength(1);
    const current = await openImport(page);
    await expect(
      current.locator(".mail-invoice-consent input"),
    ).not.toBeChecked();
    await noMailStorage(page);
  });

test("cambiar de empresa no reutiliza el buzón ni el permiso de la empresa anterior", async ({
  page,
  mail,
}, info) => {
  mail.auth.controls.organizations.push({
    id: secondOrg,
    name: "Segunda empresa MFA ficticia",
  });
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await page
    .getByRole("button", { name: "Cuenta y acceso", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Cuenta y acceso", exact: true })
    .getByRole("link", { name: "Configuración", exact: true })
    .click();
  await page
    .getByLabel("Empresa activa", { exact: true })
    .selectOption(secondOrg);
  // The retained Auth fixture grants Full only to its primary organization.
  // Observe the real selected-company RPC, including its fail-closed response,
  // without claiming that a second company's license has been provisioned.
  await expect
    .poll(() =>
      mail.auth.calls.some(
        (call) =>
          call.path === "/rest/v1/rpc/tc_organization_access" &&
          call.body?.p_org === secondOrg,
      ),
    )
    .toBe(true);
  await expect(page.locator(".mail-open-views")).toHaveCount(0);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  expect(mail.imports()[0].body?.organization_id).toBe(org);
  await noMailStorage(page);
});

test("cerrar sesión cancela las siguientes revisiones y conserva el acceso público", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await page
    .getByRole("button", { name: "Cuenta y acceso", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bienvenido a TruckControl",
      exact: true,
    }),
  ).toBeVisible();
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await noMailStorage(page);
});

test("revocar y restaurar FULL no restaura una autorización automática anterior", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  mail.auth.controls.manualFullEnabled = false;
  await broadcast(page, "USER_UPDATED", mail.auth.session(actor, "aal1", sid));
  await expect(page.locator(".mail-workspace:visible")).toHaveCount(0);
  mail.auth.controls.manualFullEnabled = true;
  await broadcast(page, "USER_UPDATED", mail.auth.session(actor, "aal1", sid));
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await noMailStorage(page);
});

test("caducar la cuenta termina el grant antes del siguiente intervalo", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail, firstMail, { expires: 240 });
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  const grant = mail.imports()[0].body?.automation as OpenSessionMailGrant;
  expect(
    Date.parse(grant.expires_at) - Date.parse(grant.started_at),
  ).toBeLessThanOrEqual(240000);
  await closeImport(page);
  await advance(page, 241000);
  await expect(page.locator(".mail-open-views")).toHaveCount(0);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await connectGmail(page, mail);
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  await noPrivateGrantStorage(page, grant);
});

test("una incidencia IA conserva contadores y detiene todas las cuentas sin repetir", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  await connectGmail(page, mail, secondMail);
  await choose(page, firstMail);
  let dialog = await activate(page);
  await settled(mail, 1, dialog);
  await closeImport(page);
  await choose(page, secondMail);
  await activate(page);
  mail.controls.resultFailures = 1;
  await advance(page);
  await expect.poll(() => mail.imports().length).toBe(2);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await expect(page.locator(".mail-automatic-status")).toContainText(
    "detenido por una incidencia",
  );
  await closeImport(page);
  await choose(page, firstMail);
  dialog = await openImport(page);
  await expect(dialog.locator(".mail-automatic-status")).toContainText(
    "Incidencias: 1.",
  );
  await advance(page);
  expect(mail.imports()).toHaveLength(2);
  await noMailStorage(page);
});

for (const failure of ["ai_budget_exceeded", "mail_operation_unavailable"])
  test(`${failure} detiene la revisión sin reintento automático`, async ({
    page,
    mail,
  }, info) => {
    await ready(page, mail, info);
    await connectGmail(page, mail);
    const dialog = await activate(page);
    await settled(mail, 1, dialog);
    mail.controls.importFailure = failure;
    await advance(page);
    await expect.poll(() => mail.imports().length).toBe(2);
    await expect(
      dialog.getByRole("heading", {
        name: "Revisión automática detenida",
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog.locator(".mail-automatic-status")).toContainText(
      failure === "ai_budget_exceeded"
        ? "límite de IA"
        : "no se ha podido confirmar",
    );
    mail.controls.importFailure = null;
    await advance(page);
    expect(mail.imports()).toHaveLength(2);
    await noMailStorage(page);
  });

test("un cursor repetido detiene la revisión en lugar de empezar de nuevo el período", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  mail.controls.hasMore = true;
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  await advance(page);
  await expect.poll(() => mail.imports().length).toBe(2);
  await expect(
    dialog.getByRole("heading", {
      name: "Revisión automática detenida",
      exact: true,
    }),
  ).toBeVisible();
  expect(mail.imports()[1].body?.cursor).toBe("synthetic-next-mail-cursor");
  await advance(page);
  expect(mail.imports()).toHaveLength(2);
});

test("recargar elimina la autorización y nunca guarda el grant ni el correo en WebStorage", async ({
  page,
  mail,
}, info) => {
  await ready(page, mail, info);
  await connectGmail(page, mail);
  const dialog = await activate(page);
  await settled(mail, 1, dialog);
  const grant = mail.imports()[0].body?.automation as OpenSessionMailGrant;
  await noPrivateGrantStorage(page, grant);
  await page.reload();
  await expect(page.locator("#mail-title")).toBeVisible();
  await expect(page.locator(".mail-open-views")).toHaveCount(0);
  await expect(page.locator(".mail-automation-summary")).toHaveCount(0);
  await advance(page);
  expect(mail.imports()).toHaveLength(1);
  await noPrivateGrantStorage(page, grant);
});
