import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { actor, broadcast, org } from "../mfa-browser/fixture";
import {
  mailPeriodBounds,
  presetReceivedPeriod,
} from "../../supabase/functions/_shared/mail-period";
import {
  test,
  expect,
  openMail,
  connectGmail,
  connectImap,
  noMailStorage,
  firstMail,
  secondMail,
  imapPassword,
  importButton,
} from "./fixture";
import type { MailFixture } from "./fixture";

const accounts = (page: Page) =>
  page.getByRole("navigation", { name: "Correos conectados", exact: true });
const selectedView = (page: Page) =>
  page.locator(".mail-provider-view:visible");
async function choose(page: Page, email: string) {
  await accounts(page)
    .getByRole("button", { name: email, exact: true })
    .click();
  await expect(
    selectedView(page).getByRole("heading", { name: email, exact: true }),
  ).toBeVisible();
}
async function openImport(page: Page) {
  await selectedView(page)
    .getByRole("button", { name: importButton, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: importButton, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function authorize(page: Page) {
  const dialog = await openImport(page);
  await dialog.locator(".mail-invoice-consent input").check();
  await expect(
    dialog.getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    }),
  ).toBeEnabled();
  return dialog;
}
async function closeImport(page: Page) {
  await page
    .getByRole("dialog", { name: importButton, exact: true })
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
}
async function waitImport(mail: MailFixture, count = 1) {
  await expect.poll(() => mail.imports().length).toBe(count);
  return mail.imports().at(-1)!.body!;
}

test("Correo ofrece un solo formulario y conectar no autoriza la IA", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await expect(page.locator("main h1:visible")).toHaveText("Correo");
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Proveedor de correo", { exact: true }),
  ).toHaveValue("google");
  await expect(
    page.getByRole("link", { name: "Facturas del correo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: importButton, exact: true }),
  ).toHaveCount(0);
  expect(mail.imports()).toEqual([]);
  expect(mail.calls.filter((call) => call.name === "company:status")).toEqual(
    [],
  );
  await connectGmail(page, mail);
  await expect(
    selectedView(page).getByRole("button", { name: importButton, exact: true }),
  ).toBeEnabled();
  expect(mail.imports()).toEqual([]);
  await page.evaluate(() => {
    location.hash = "/mailbox/gmail";
  });
  await expect(page).toHaveURL(/#\/mailbox$/);
  await expect(page.locator("#mail-title")).toHaveText("Correo");
  await expect(
    accounts(page).getByRole("button", { name: firstMail, exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/invoices";
  });
  await expect(
    page.getByRole("heading", {
      name: "Facturas de esta empresa",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Bandeja de facturas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Conectar Gmail de esta empresa",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "/mailbox";
  });
  await expect(
    selectedView(page).getByRole("heading", { name: firstMail, exact: true }),
  ).toBeVisible();
  expect(mail.imports()).toEqual([]);
  await noMailStorage(page);
});

test("mantiene dos Gmail independientes y caduca únicamente la cuenta cuyo permiso vence", async ({
  page,
  mail,
}, info) => {
  await page.clock.install({ time: Date.now() });
  await openMail(page, info);
  await connectGmail(page, mail, firstMail, { expires: 30 });
  await connectGmail(page, mail, secondMail);
  await expect(
    accounts(page).getByRole("button", { name: firstMail, exact: true }),
  ).toBeVisible();
  await choose(page, firstMail);
  await expect(selectedView(page).locator(".personal-mail-row")).toContainText(
    `Bandeja de ${firstMail}`,
  );
  await choose(page, secondMail);
  await expect(selectedView(page).locator(".personal-mail-row")).toContainText(
    `Bandeja de ${secondMail}`,
  );
  await page.clock.fastForward(16_000);
  await expect(
    accounts(page).getByRole("button", { name: firstMail, exact: true }),
  ).toHaveCount(0);
  await expect(
    accounts(page).getByRole("button", { name: secondMail, exact: true }),
  ).toBeVisible();
  await expect(
    selectedView(page).getByRole("heading", { name: secondMail, exact: true }),
  ).toBeVisible();
  expect(mail.imports()).toEqual([]);
  await noMailStorage(page);
});

test("rechaza un perfil Google diferente del correo escrito y conserva la cuenta anterior", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  mail.controls.wrongProfile = firstMail;
  await connectGmail(page, mail, secondMail, { wait: false });
  await expect(page.locator(".mail-provider-card [role=alert]")).toContainText(
    "no coincide con el correo escrito",
  );
  await expect(
    accounts(page).getByRole("button", { name: firstMail, exact: true }),
  ).toBeVisible();
  await expect(
    accounts(page).getByRole("button", { name: secondMail, exact: true }),
  ).toHaveCount(0);
  await choose(page, firstMail);
  await expect(selectedView(page).locator(".personal-mail-row")).toContainText(
    firstMail,
  );
  expect(mail.imports()).toEqual([]);
});

test("añade varias cuentas IMAP desde el mismo formulario y solo muestra el buzón elegido", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectImap(page, "imap-one@example.invalid");
  await connectImap(page, "imap-two@example.invalid");
  await expect(
    accounts(page).getByRole("button", {
      name: /^imap-(one|two)@example\.invalid$/,
    }),
  ).toHaveCount(2);
  await choose(page, "imap-one@example.invalid");
  await expect(selectedView(page).locator(".personal-mail-row")).toContainText(
    "imap-one@example.invalid",
  );
  await expect(
    selectedView(page).getByText("Bandeja de imap-two@example.invalid", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    mail.calls.filter((call) => call.name === "personal:verify"),
  ).toHaveLength(2);
  expect(mail.imports()).toEqual([]);
  await noMailStorage(page);
});

test("conserva el borrador de la cuenta al navegar y no lo comparte con otra cuenta", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  await selectedView(page)
    .getByRole("button", { name: "Redactar", exact: true })
    .click();
  const draft = page.getByRole("dialog", {
    name: "Redactar correo",
    exact: true,
  });
  await draft
    .getByLabel("Para", { exact: true })
    .fill("recipient@example.invalid");
  await draft
    .getByLabel("Asunto", { exact: true })
    .fill("Borrador privado de la primera cuenta");
  await draft
    .getByLabel("Mensaje", { exact: true })
    .fill("Texto privado ficticio del borrador");
  // Hash navigation preserves the existing mailbox instance; no message is sent.
  await page.evaluate(() => {
    location.hash = "/dashboard";
  });
  await expect(page.locator(".mail-workspace:visible")).toHaveCount(0);
  await expect(draft).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "/mailbox";
  });
  await expect(draft.getByLabel("Asunto", { exact: true })).toHaveValue(
    "Borrador privado de la primera cuenta",
  );
  await draft
    .getByRole("button", { name: "Minimizar borrador", exact: true })
    .click();
  await connectGmail(page, mail, secondMail);
  await selectedView(page)
    .getByRole("button", { name: "Redactar", exact: true })
    .click();
  const secondDraft = page.getByRole("dialog", {
    name: "Redactar correo",
    exact: true,
  });
  await expect(secondDraft.getByLabel("Asunto", { exact: true })).toHaveValue(
    "",
  );
  await secondDraft
    .getByRole("button", { name: "Minimizar borrador", exact: true })
    .click();
  await choose(page, firstMail);
  await selectedView(page)
    .getByRole("button", { name: "Continuar borrador", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Redactar correo", exact: true })
      .getByLabel("Asunto", { exact: true }),
  ).toHaveValue("Borrador privado de la primera cuenta");
  expect(
    mail.calls.filter((call) => call.name === "gmail:messages/send"),
  ).toEqual([]);
  await noMailStorage(page);
});

test("la autorización empieza desmarcada, limita a doce meses y cancelar no importa", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  const dialog = await openImport(page);
  const confirmation = dialog.getByRole("button", {
    name: "Autorizar y descargar facturas",
    exact: true,
  });
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await expect(confirmation).toBeDisabled();
  const expected = presetReceivedPeriod();
  await expect(
    dialog.getByLabel("Recibidas desde", { exact: true }),
  ).toHaveValue(expected.from);
  await expect(
    dialog.getByLabel("Recibidas hasta", { exact: true }),
  ).toHaveValue(expected.to);
  await dialog.locator(".mail-invoice-consent input").check();
  await dialog
    .getByLabel("Período de correo", { exact: true })
    .selectOption("12m");
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await expect(
    dialog.getByLabel("Recibidas desde", { exact: true }),
  ).toHaveValue(mailPeriodBounds().earliest);
  await dialog
    .getByLabel("Período de correo", { exact: true })
    .selectOption("custom");
  await dialog
    .getByLabel("Recibidas hasta", { exact: true })
    .fill("2099-01-01");
  await expect(dialog.locator(".mail-invoice-consent input")).toBeDisabled();
  await expect(confirmation).toBeDisabled();
  await expect(dialog.getByRole("alert").first()).toContainText(
    "fechas válidas",
  );
  await closeImport(page);
  expect(mail.imports()).toEqual([]);
});

test("importa desde la cuenta Gmail elegida con consentimiento exacto y continúa su cursor sin OAuth empresarial", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  const firstToken = await connectGmail(page, mail);
  const secondToken = await connectGmail(page, mail, secondMail);
  mail.controls.hasMore = true;
  const dialog = await authorize(page);
  await dialog
    .getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    })
    .click();
  const body = await waitImport(mail);
  expect(body.provider).toBe("gmail");
  expect(body.email).toBe(secondMail);
  expect(body.gmail_access_token).toBe(secondToken);
  expect(JSON.stringify(body)).not.toContain(firstToken);
  expect(body.organization_id).toBe(org);
  expect(body.analyze).toBe(true);
  expect(body.period).toEqual(presetReceivedPeriod());
  expect(body.consent).toEqual({
    version: "2026-11-16",
    accepted: true,
    mailbox: secondMail,
    provider: "gmail",
    period: body.period,
  });
  await expect(
    dialog.getByRole("region", {
      name: "Resultado de la descarga de facturas",
    }),
  ).toContainText("Originales guardados");
  await expect(dialog.locator(".mail-invoice-consent input")).toBeChecked();
  mail.controls.hasMore = false;
  await dialog
    .getByRole("button", { name: "Continuar descarga autorizada", exact: true })
    .click();
  const continuation = await waitImport(mail, 2);
  expect(continuation.cursor).toBe("synthetic-next-mail-cursor");
  expect(continuation.email).toBe(secondMail);
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await dialog
    .getByRole("button", { name: "Ver facturas de la empresa", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Facturas de esta empresa", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () => mail.calls.filter((call) => call.name === "invoice-page").length,
    )
    .toBeGreaterThan(0);
  expect(
    mail.auth.calls.filter(
      (call) => call.path === "/functions/v1/company-gmail",
    ),
  ).toEqual([]);
  expect(
    mail.auth.calls.filter(
      (call) =>
        call.path === "/rest/v1/finance_entries" && call.method !== "GET",
    ),
  ).toEqual([]);
  await noMailStorage(page);
});

test("el puente IMAP usa solo la cuenta seleccionada y no persiste credenciales ni contenido", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectImap(page, "imap-one@example.invalid");
  await connectImap(page, "imap-two@example.invalid");
  await choose(page, "imap-one@example.invalid");
  const dialog = await authorize(page);
  await dialog
    .getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    })
    .click();
  const body = await waitImport(mail);
  expect(body.provider).toBe("imap");
  expect(body.email).toBe("imap-one@example.invalid");
  expect(body.gmail_access_token).toBeUndefined();
  expect(body.connection).toMatchObject({
    email: "imap-one@example.invalid",
    password: imapPassword,
  });
  expect(body.connector_consent).toEqual({
    version: "2026-11-13",
    accepted: true,
  });
  await expect(
    dialog.getByRole("region", {
      name: "Resultado de la descarga de facturas",
    }),
  ).toBeVisible();
  await closeImport(page);
  await accounts(page)
    .getByRole("button", {
      name: "Desconectar imap-one@example.invalid",
      exact: true,
    })
    .click();
  await expect(
    accounts(page).getByRole("button", {
      name: "imap-two@example.invalid",
      exact: true,
    }),
  ).toBeVisible();
  await noMailStorage(page);
});

test("un backend antiguo o IA desactivada bloquea la descarga y revocar FULL cierra las capacidades", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  mail.controls.capability = false;
  let dialog = await openImport(page);
  await expect(dialog.getByRole("alert")).toContainText(
    "aún no está disponible",
  );
  await dialog.locator(".mail-invoice-consent input").check();
  await expect(
    dialog.getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    }),
  ).toBeDisabled();
  await closeImport(page);
  mail.controls.capability = true;
  mail.controls.aiEnabled = false;
  dialog = await openImport(page);
  await expect(dialog.getByRole("alert")).toContainText("no está habilitada");
  await expect(
    dialog.getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    }),
  ).toBeDisabled();
  await closeImport(page);
  mail.auth.controls.manualFullEnabled = false;
  await broadcast(page, "USER_UPDATED", mail.auth.session(actor, "aal1"));
  await expect(page.locator(".mail-workspace:visible")).toHaveCount(0);
  expect(mail.imports()).toEqual([]);
  await noMailStorage(page);
});

test("cambiar de cuenta o reconectar la misma dirección descarta consentimiento y respuesta tardía", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  await connectGmail(page, mail, secondMail);
  await choose(page, firstMail);
  mail.controls.holdImport = true;
  let dialog = await authorize(page);
  await dialog
    .getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    })
    .click();
  await expect.poll(() => mail.controls.pendingImports).toBe(1);
  await closeImport(page);
  await choose(page, secondMail);
  dialog = await openImport(page);
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await expect(
    dialog.getByRole("region", {
      name: "Resultado de la descarga de facturas",
    }),
  ).toHaveCount(0);
  mail.controls.holdImport = false;
  mail.releaseImports();
  await expect(
    dialog.getByRole("region", {
      name: "Resultado de la descarga de facturas",
    }),
  ).toHaveCount(0);
  await closeImport(page);
  await connectGmail(page, mail, firstMail);
  dialog = await openImport(page);
  await expect(dialog.locator(".mail-invoice-consent input")).not.toBeChecked();
  await expect(
    dialog.getByRole("region", {
      name: "Resultado de la descarga de facturas",
    }),
  ).toHaveCount(0);
  expect(mail.imports()).toHaveLength(1);
});

test("un cambio de SID descarta un perfil OAuth tardío sin restaurar la cuenta", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  mail.controls.holdProfile = true;
  await connectGmail(page, mail, secondMail, { wait: false });
  await expect.poll(() => mail.controls.pendingProfiles).toBe(1);
  await broadcast(
    page,
    "USER_UPDATED",
    mail.auth.session(actor, "aal1", "synthetic-unified-new-sid"),
  );
  mail.controls.holdProfile = false;
  mail.releaseProfiles();
  await expect(page.locator(".mail-open-views:visible")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: firstMail, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: secondMail, exact: true }),
  ).toHaveCount(0);
  expect(mail.imports()).toEqual([]);
  await noMailStorage(page);
});

test("cerrar sesión bloquea resultados de una importación en vuelo y conserva el acceso público", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  mail.controls.holdImport = true;
  const dialog = await authorize(page);
  await dialog
    .getByRole("button", {
      name: "Autorizar y descargar facturas",
      exact: true,
    })
    .click();
  await expect.poll(() => mail.controls.pendingImports).toBe(1);
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
  mail.controls.holdImport = false;
  mail.releaseImports();
  await expect(
    page.getByRole("region", { name: "Resultado de la descarga de facturas" }),
  ).toHaveCount(0);
  await expect(page.locator(".mail-open-views")).toHaveCount(0);
  expect(mail.imports()).toHaveLength(1);
  await noMailStorage(page);
});

test("una actualización MFA con el mismo SID solo reabre un pool vacío después de validar acceso", async ({
  page,
  mail,
}, info) => {
  await openMail(page, info);
  await connectGmail(page, mail);
  const before = mail.calls.filter(
    (call) => call.name === "gmail:profile",
  ).length;
  await page.evaluate(
    ({ actor }) => {
      window.dispatchEvent(
        new CustomEvent("truckcontrol:native-mfa-state", {
          detail: {
            reason: "refresh",
            userId: actor,
            sessionId: "session-" + actor,
          },
        }),
      );
    },
    { actor },
  );
  await expect(accounts(page)).toHaveCount(0);
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Preparar conexión con Google",
      exact: true,
    }),
  ).toBeEnabled();
  expect(
    mail.calls.filter((call) => call.name === "gmail:profile"),
  ).toHaveLength(before);
  await connectGmail(page, mail, secondMail);
  await expect(
    accounts(page).getByRole("button", { name: secondMail, exact: true }),
  ).toBeVisible();
  await expect(
    accounts(page).getByRole("button", { name: firstMail, exact: true }),
  ).toHaveCount(0);
  expect(mail.imports()).toEqual([]);
});

test("Correo y la autorización de facturas son accesibles y no desbordan en móvil y escritorio", async ({
  page,
  mail,
}, info) => {
  test.setTimeout(65_000);
  await openMail(page, info);
  for (const width of [
    320,
    info.project.name.includes("android") ? 412 : 1440,
  ]) {
    await page.setViewportSize({ width, height: 980 });
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
  }
  await connectGmail(page, mail);
  const dialog = await openImport(page);
  await expect(
    dialog
      .locator(".mail-invoice-authorization")
      .getByText(firstMail, { exact: true }),
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
  await noMailStorage(page);
});
