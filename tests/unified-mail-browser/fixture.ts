import type { BrowserContext, Page, Request, TestInfo } from "@playwright/test";
import {
  test as base,
  expect,
  selectedTheme,
} from "../billing-attachments-browser/fixture";
import type { NativeAuth } from "../billing-attachments-browser/fixture";
import { actor, org } from "../mfa-browser/fixture";
import { mailPeriodPolicy } from "../../supabase/functions/_shared/mail-period";
import { openMailAutomationPolicy } from "../../supabase/functions/_shared/mail-automation";

export const firstMail = "one@example.invalid";
export const secondMail = "two@example.invalid";
export const imapPassword = "SYNTHETIC_UNIFIED_MAILBOX_PASSWORD_NOT_REAL";
export const importButton = "Descargar facturas del correo por IA";
const headers = (request: Request) => ({
  "Access-Control-Allow-Origin": request.headers().origin ?? "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info,prefer,x-supabase-api-version,range,range-unit",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Content-Type": "application/json",
});
const claims = (request: Request) => {
  try {
    return JSON.parse(
      Buffer.from(
        (request.headers().authorization ?? "").split(".")[1],
        "base64url",
      ).toString(),
    ) as { sub?: string; session_id?: string; aal?: string };
  } catch {
    return {};
  }
};
export async function mailboxFixture(
  context: BrowserContext,
  auth: NativeAuth,
  backendOrigin = "http://127.0.0.1:9999",
) {
  if (
    ![
      "http://127.0.0.1:9999",
      "https://kkkemaycedexymrpaqtp.supabase.co",
    ].includes(backendOrigin)
  )
    throw new Error("Unexpected synthetic mailbox backend origin");
  auth.controls.manualFullEnabled = true;
  const tokens = new Map<string, string>();
  const calls: {
    name: string;
    body: Record<string, unknown> | null;
    actor: string | null;
    sid: string | null;
    authorization: string | null;
  }[] = [];
  const controls = {
    capability: true,
    automation: false,
    aiEnabled: true,
    hasMore: false,
    holdImport: false,
    pendingImports: 0,
    holdProfile: false,
    pendingProfiles: 0,
    wrongProfile: null as string | null,
    denyMail: null as string | null,
    importFailure: null as string | null,
    holdStatus: false,
    pendingStatuses: 0,
    resultFailures: 0,
  };
  const importWaiters: (() => void)[] = [],
    profileWaiters: (() => void)[] = [],
    statusWaiters: (() => void)[] = [];
  const releaseImports = () => {
    for (const release of importWaiters.splice(0)) release();
  };
  const releaseProfiles = () => {
    for (const release of profileWaiters.splice(0)) release();
  };
  const releaseStatuses = () => {
    for (const release of statusWaiters.splice(0)) release();
  };
  await context.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, "__unifiedMailStorageLeaks", {
      value: writes,
    });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        String(value).includes("synthetic-unified-mail-token-") ||
        String(value).includes("SYNTHETIC_UNIFIED_MAILBOX_PASSWORD_NOT_REAL") ||
        String(value).includes("Contenido privado ficticio de")
      )
        writes.push(key);
      return original.call(this, key, value);
    };
  });
  const message = (email: string, id = "mail001") => ({
    id,
    threadId: "thread001",
    internalDate: String(Date.now() - 60_000),
    labelIds: ["INBOX", "UNREAD"],
    snippet: `Mensaje ficticio de ${email}`,
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Sender <sender@example.invalid>" },
        { name: "To", value: email },
        { name: "Subject", value: `Bandeja de ${email}` },
        { name: "Date", value: new Date().toUTCString() },
        { name: "Message-ID", value: `<${id}@example.invalid>` },
      ],
      body: {
        data: Buffer.from(`Contenido privado ficticio de ${email}`).toString(
          "base64url",
        ),
      },
    },
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const browserConfig =
      url.origin === "https://kkkemaycedexymrpaqtp.supabase.co" &&
      path === "/functions/v1/company-gmail/browser-config";
    const googleScript =
      url.origin === "https://accounts.google.com" && path === "/gsi/client";
    const gmail =
      url.origin === "https://gmail.googleapis.com" &&
      path.startsWith("/gmail/v1/users/me/");
    const personal =
      url.origin === backendOrigin && path === "/functions/v1/personal-mail";
    const companyMail =
      url.origin === backendOrigin && path === "/functions/v1/company-mail";
    const invoicePage =
      url.origin === backendOrigin && path === "/rest/v1/rpc/tc_invoice_page";
    if (!(
      browserConfig ||
      googleScript ||
      gmail ||
      personal ||
      companyMail ||
      invoicePage
    ))
      return route.fallback();
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: headers(request),
        body: "",
      });
    if (googleScript)
      return route.fulfill({
        contentType: "application/javascript",
        body: `window.google={accounts:{oauth2:{initTokenClient(options){window.__unifiedMailOAuth=options;return{requestAccessToken(){window.__unifiedMailRequests=(window.__unifiedMailRequests||0)+1;var grant=window.__unifiedMailGrant;if(!grant)throw new Error('Missing synthetic grant');options.callback({access_token:grant.token,token_type:'Bearer',expires_in:grant.expires,scope:'https://www.googleapis.com/auth/gmail.modify'});}};},revoke(){throw new Error('Unexpected account-wide revoke');}}}};`,
      });
    let body: Record<string, unknown> | null = null;
    try {
      body = request.postDataJSON() as Record<string, unknown> | null;
    } catch {
      /* no JSON body */
    }
    const identity = claims(request);
    const name = browserConfig
      ? "browser-config"
      : gmail
        ? "gmail:" + path.split("/users/me/")[1]
        : personal
          ? "personal:" + body?.action
          : invoicePage
            ? "invoice-page"
            : "company:" + body?.action;
    calls.push({
      name,
      body,
      actor: identity.sub ?? null,
      sid: identity.session_id ?? null,
      authorization: request.headers().authorization ?? null,
    });
    let data: unknown,
      status = 200;
    if (browserConfig)
      data = {
        configured: true,
        client_id: "468881730124-synthetic-browser.apps.googleusercontent.com",
        provider: "google",
        mode: "personal_browser",
      };
    else if (invoicePage) data = [];
    else if (gmail) {
      const token = (request.headers().authorization ?? "").replace(
        /^Bearer /,
        "",
      );
      const email = tokens.get(token);
      expect(
        email,
        "Only a previously issued synthetic Google token is accepted",
      ).toBeTruthy();
      expect(request.headers().apikey).toBeUndefined();
      if (controls.denyMail === email) {
        status = 401;
        data = { error: "synthetic_expired" };
      } else if (path.endsWith("/profile")) {
        if (controls.holdProfile) {
          controls.pendingProfiles++;
          await new Promise<void>((resolve) => profileWaiters.push(resolve));
        }
        data = { emailAddress: controls.wrongProfile ?? email };
      } else if (path.endsWith("/messages"))
        data = { messages: [{ id: "mail001" }], resultSizeEstimate: 1 };
      else if (path.endsWith("/messages/send")) data = { id: "sent001" };
      else if (/\/(modify|trash|untrash)$/.test(path)) data = { id: "mail001" };
      else data = message(email!, path.split("/").at(-1));
    } else if (personal) {
      expect(identity.sub).toBe(actor);
      expect(body?.consent).toEqual({ version: "2026-11-13", accepted: true });
      const connection = body?.connection as {
        email: string;
        password: string;
      };
      expect(connection.password).toBe(imapPassword);
      if (body?.action === "verify")
        data = {
          email: connection.email,
          reading: true,
          sending: true,
          consent_version: "2026-11-13",
        };
      else if (body?.action === "list")
        data = {
          messages: [
            {
              id: "imap001",
              threadId: "imap001",
              from: "sender@example.invalid",
              to: connection.email,
              subject: `Bandeja de ${connection.email}`,
              date: new Date().toUTCString(),
              snippet: "Mensaje IMAP ficticio",
              labels: ["INBOX"],
            },
          ],
          next: null,
        };
      else if (body?.action === "read")
        data = {
          id: "imap001",
          threadId: "imap001",
          from: "sender@example.invalid",
          to: connection.email,
          subject: `Bandeja de ${connection.email}`,
          date: new Date().toUTCString(),
          snippet: "Mensaje IMAP ficticio",
          labels: ["INBOX"],
          text: `Contenido privado ficticio de ${connection.email}`,
          htmlConverted: false,
          messageId: "<imap001@example.invalid>",
          attachments: [],
        };
      else if (body?.action === "send") data = { sent: true, sent_copy: true };
      else data = { changed: true };
    } else if (companyMail) {
      expect(identity.sub).toBe(actor);
      if (body?.action === "status") {
        if (controls.holdStatus) {
          controls.pendingStatuses++;
          await new Promise<void>((resolve) => statusWaiters.push(resolve));
        }
        data = {
          upload_ready: true,
          forwarding_ready: false,
          inbox: null,
          ai_enabled: controls.aiEnabled,
          ...(controls.capability
            ? {
                connected_mailbox_import: {
                  version: 1,
                  consent_version: "2026-11-16",
                  providers: ["gmail", "imap"],
                  max_messages: 50,
                  max_attachments: 10,
                  received_period_policy: { ...mailPeriodPolicy },
                  ...(controls.automation
                    ? { automation: { ...openMailAutomationPolicy } }
                    : {}),
                },
              }
            : {}),
        };
      } else if (body?.action === "import_connected_mailbox") {
        expect(body.organization_id).toBe(org);
        if (controls.holdImport) {
          controls.pendingImports++;
          await new Promise<void>((resolve) => importWaiters.push(resolve));
        }
        if (controls.importFailure) {
          status = 403;
          data = { error: controls.importFailure };
        } else
          data = {
            authorization_scope: "selected_mailbox_period",
            consent_version: "2026-11-16",
            imported: 1,
            skipped: 0,
            failures: controls.resultFailures,
            ai_used: controls.resultFailures ? 0 : 1,
            examined: 1,
            has_more: controls.hasMore,
            next_cursor: controls.hasMore ? "synthetic-next-mail-cursor" : null,
            received_period: {
              ...(body.period as object),
              time_zone: "Europe/Madrid",
            },
          };
      } else throw new Error("Unexpected company mail action " + body?.action);
    }
    await route
      .fulfill({
        status,
        headers: headers(request),
        body: JSON.stringify(data),
      })
      .catch(() => {});
  });
  let next = 0;
  return {
    auth,
    calls,
    controls,
    tokens,
    releaseImports,
    releaseProfiles,
    releaseStatuses,
    async grant(page: Page, email: string, expires = 3600) {
      const token = "synthetic-unified-mail-token-" + ++next;
      tokens.set(token, email);
      await page.evaluate(
        (grant) => {
          (
            window as unknown as { __unifiedMailGrant: unknown }
          ).__unifiedMailGrant = grant;
        },
        { token, expires },
      );
      return token;
    },
    imports: () =>
      calls.filter((call) => call.name === "company:import_connected_mailbox"),
  };
}
export type MailFixture = Awaited<ReturnType<typeof mailboxFixture>>;
export const test = base.extend<{ mail: MailFixture }>({
  mail: async ({ context, nativeAuth }, use) => {
    const mail = await mailboxFixture(context, nativeAuth);
    await use(mail);
    mail.releaseImports();
    mail.releaseProfiles();
    mail.releaseStatuses();
  },
});
export { expect, selectedTheme };
export async function openMail(page: Page, info: TestInfo) {
  // Retain the existing fixture's real SDK login; unlike its historical helper,
  // do not overwrite the saved UI language on every reload.
  void info;
  await page.addInitScript(() => {
    sessionStorage.setItem("truckcontrol-company-mode", "yes");
  });
  await page.goto("/#/settings");
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("owner@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-password-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/mailbox";
  });
  await expect(page.locator("#mail-title")).toBeVisible();
}
export async function connectGmail(
  page: Page,
  mail: MailFixture,
  email = firstMail,
  options: { expires?: number; wait?: boolean } = {},
) {
  await page
    .getByRole("button", { name: "Añadir correo", exact: true })
    .click();
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page
    .getByLabel("Proveedor de correo", { exact: true })
    .selectOption("google");
  const token = await mail.grant(page, email, options.expires);
  const prepare = page.getByRole("button", {
    name: "Preparar conexión con Google",
    exact: true,
  });
  if (await prepare.isVisible()) await prepare.click();
  await page
    .getByRole("button", { name: "Entrar con Google", exact: true })
    .click();
  if (options.wait !== false)
    await expect(
      page
        .getByRole("navigation", { name: "Correos conectados" })
        .getByRole("button", { name: email, exact: true }),
    ).toBeVisible();
  return token;
}
export async function connectImap(page: Page, email = "imap@example.invalid") {
  await page
    .getByRole("button", { name: "Añadir correo", exact: true })
    .click();
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page
    .getByLabel("Proveedor de correo", { exact: true })
    .selectOption("porkbun");
  await page
    .getByLabel("Contraseña del buzón o de aplicación", { exact: true })
    .fill(imapPassword);
  await page.locator(".mail-consent input").check();
  await page
    .getByRole("button", { name: "Conectar y verificar buzón", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Correos conectados" })
      .getByRole("button", { name: email, exact: true }),
  ).toBeVisible();
}
export async function noMailStorage(page: Page) {
  expect(
    await page.evaluate(() => ({
      writes: (window as unknown as { __unifiedMailStorageLeaks: string[] })
        .__unifiedMailStorageLeaks,
      leaked: [
        ...Object.values(localStorage),
        ...Object.values(sessionStorage),
      ].some(
        (value) =>
          value.includes("synthetic-unified-mail-token-") ||
          value.includes("SYNTHETIC_UNIFIED_MAILBOX_PASSWORD_NOT_REAL") ||
          value.includes("Contenido privado ficticio de"),
      ),
    })),
  ).toEqual({ writes: [], leaked: false });
}
