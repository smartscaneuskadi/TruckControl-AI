import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  connectionConsent,
  mailConnectorConsentVersion,
} from "../supabase/functions/personal-mail/contract";
import type { MailConnectorConsent } from "../supabase/functions/personal-mail/contract";
import { createPersonalMailHandler } from "../supabase/functions/personal-mail/handler";
import { createImapMailbox } from "../src/integrations/personal-mail/imap";
import { LegalPage } from "../src/components/LegalPage";
import { legalVersion } from "../src/domain/legal";
import { mailConnectorPrivacy } from "../src/domain/mail-privacy";

const origin = "https://truckcontrolai.com";
const org = "00000000-0000-4000-8000-000000000001";
const config = {
  email: "fixture@example.com",
  username: "mailbox-fixture",
  password: "synthetic-password-never-sent-to-a-provider",
  imapHost: "imap.porkbun.com",
  smtpHost: "smtp.porkbun.com",
};
const consent: MailConnectorConsent = {
  version: mailConnectorConsentVersion,
  accepted: true,
};
const request = (body: unknown) =>
  new Request(`${origin}/functions/v1/personal-mail`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer synthetic.session.only",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
afterEach(() => vi.unstubAllGlobals());

describe("IMAP/SMTP supplemental privacy consent", () => {
  it.each(["verify", "list", "read", "change", "send"])(
    "%s refuses missing, declined or unsupported consent before credentials/transport",
    async (action) => {
      const operate = vi.fn();
      const handler = createPersonalMailHandler(
        { authorize: async () => true, operate, probe: vi.fn() },
        [origin],
      );
      for (const value of [
        undefined,
        null,
        false,
        [],
        {},
        { version: "2026-11-02", accepted: true },
        { version: "future-version", accepted: true },
        { version: mailConnectorConsentVersion, accepted: false },
        { version: mailConnectorConsentVersion, accepted: "true" },
        { ...consent, extra: config.password },
      ]) {
        const response = await handler(
          request({
            organization_id: org,
            action,
            // Deliberately invalid: consent must fail before connectionConfig.
            connection: { password: config.password },
            consent: value,
          }),
        );
        expect(response.status).toBe(428);
        expect(await response.json()).toEqual({ error: "consent_required" });
      }
      expect(operate).not.toHaveBeenCalled();
    },
  );

  it("keeps live account authorization ahead of a consent acknowledgement", async () => {
    const operate = vi.fn();
    const handler = createPersonalMailHandler(
      { authorize: async () => false, operate, probe: vi.fn() },
      [origin],
    );
    const response = await handler(
      request({
        organization_id: org,
        action: "verify",
        connection: config,
        consent,
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "expired" });
    expect(operate).not.toHaveBeenCalled();
  });

  it("passes the accepted actual connection and organization through the handler without WebStorage or real fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw Error("Real network forbidden");
      }),
    );
    const forbiddenStorage = new Proxy(
      {},
      {
        get: () => {
          throw Error("Mail privacy state must remain in RAM");
        },
      },
    );
    vi.stubGlobal("localStorage", forbiddenStorage);
    vi.stubGlobal("sessionStorage", forbiddenStorage);
    const operate = vi.fn(async (actual, action) => {
      expect(actual).toEqual(config);
      return action === "verify"
        ? { email: config.email, reading: true, sending: true }
        : { messages: [], next: null };
    });
    const handler = createPersonalMailHandler(
      {
        authorize: async (_token, actualOrg) => actualOrg === org,
        operate,
        probe: vi.fn(),
      },
      [origin],
    );
    const invoke = vi.fn(async (body: Record<string, unknown>) => {
      expect(body.organization_id).toBe(org);
      expect(body.connection).toEqual(config);
      expect(body.consent).toEqual(consent);
      const response = await handler(request(body));
      expect(response.status).toBe(200);
      return response.json();
    });
    const callerConfig = { ...config };
    const callerConsent = { ...consent };
    const mailbox = createImapMailbox(callerConfig, org, callerConsent, invoke);
    callerConfig.password = "changed-after-construction";
    callerConsent.accepted = false as unknown as true;
    expect(await mailbox.profile()).toBe(config.email);
    expect(await mailbox.list("inbox", "")).toEqual({
      messages: [],
      next: null,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(operate).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    mailbox.dispose();
    await expect(mailbox.list("inbox", "")).rejects.toMatchObject({
      code: "expired",
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not send credentials when client acknowledgement is absent", () => {
    const invoke = vi.fn();
    expect(() =>
      createImapMailbox(
        config,
        org,
        undefined as unknown as MailConnectorConsent,
        invoke,
      ),
    ).toThrow(expect.objectContaining({ code: "consent_required" }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not claim connection against a backend lacking the consent protocol", async () => {
    const invoke = vi.fn(async () => ({
      email: config.email,
      reading: true,
      sending: true,
    }));
    const mailbox = createImapMailbox(config, org, consent, invoke);
    await expect(mailbox.profile()).rejects.toMatchObject({
      code: "consent_required",
    });
    mailbox.dispose();
  });

  it("discards a late verified response when scope/session exit disposes the mailbox", async () => {
    let complete!: (value: unknown) => void;
    const invoke = vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const mailbox = createImapMailbox(config, org, consent, invoke);
    const pending = mailbox.profile();
    mailbox.dispose();
    complete({
      email: config.email,
      reading: true,
      sending: true,
      consent_version: mailConnectorConsentVersion,
    });
    await expect(pending).rejects.toMatchObject({ code: "expired" });
    await expect(mailbox.read("synthetic-message")).rejects.toMatchObject({
      code: "expired",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("publishes the supplement separately while keeping historical registration terms unchanged", () => {
    expect(legalVersion).toBe("2026-11-02");
    expect(connectionConsent(consent).version).toBe("2026-11-13");
    const privacy = renderToStaticMarkup(
      createElement(LegalPage, { document: "privacy" }),
    );
    expect(privacy).toContain('id="personal-mail-connectors"');
    expect(privacy).toContain(mailConnectorPrivacy.summary);
    expect(privacy).toContain(mailConnectorPrivacy.retention);
    expect(privacy).toContain(mailConnectorPrivacy.withdrawal);
    expect(privacy).toContain(mailConnectorPrivacy.distinction);
    expect(privacy).toContain("2026-11-02");
    expect(privacy).toContain("2026-11-13");
    const terms = renderToStaticMarkup(
      createElement(LegalPage, { document: "terms" }),
    );
    expect(terms).not.toContain('id="personal-mail-connectors"');
  });
});
