import { afterEach, describe, expect, it, vi } from "vitest";
import { createGmailHandler } from "../../../supabase/functions/company-gmail/handler";
import type { GmailGateway } from "../../../supabase/functions/company-gmail/handler";
import { seal } from "../../../supabase/functions/_shared/invoice";
import { gmailFailureCode, gmailFailureMessage } from "./errors";

const org = "20000000-0000-4000-8000-000000000021";
const user = "10000000-0000-4000-8000-000000000021";
const origin = "https://truckcontrol.example";
const encryptionKey = btoa("x".repeat(32));
afterEach(() => vi.unstubAllGlobals());

describe("Gmail refresh credential errors", () => {
  it.each([
    ["invalid_client", 401, "google_client_rejected", 503, false],
    ["unauthorized_client", 400, "google_client_rejected", 503, false],
    ["invalid_grant", 400, "gmail_reauthorization_required", 409, true],
    ["rate_limit", 429, "gmail_import_unavailable", 502, false],
    ["server_error", 500, "gmail_import_unavailable", 502, false],
  ] as const)(
    "classifies %s without forcing a new consent for a client fault",
    async (remoteError, status, error, expectedStatus, reauthorize) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          throw Error("Real network forbidden");
        }),
      );
      const cipher = await seal(
        "synthetic-refresh",
        encryptionKey,
        `${org}:${user}:synthetic-subject`,
      );
      const server = vi.fn(
        async (action: string, _data: Record<string, unknown>) => {
          if (action === "lock_sync") return true;
          if (action === "credentials")
            return {
              organization_id: org,
              user_id: user,
              google_subject: "synthetic-subject",
              refresh_token_cipher: cipher,
            };
          return {};
        },
      );
      const upload = vi.fn();
      const gateway: GmailGateway = {
        authenticate: async () => ({ id: user }),
        owns: async () => true,
        actionAllowed: async () => true,
        featureAllowed: async () => true,
        server: <T>(action: string, data: Record<string, unknown>) =>
          server(action, data) as Promise<T>,
        upload,
        remove: vi.fn(),
      };
      const marker = "private-provider-detail-never-returned";
      const fetcher = vi.fn<typeof fetch>(async (url) => {
        expect(String(url)).toBe("https://oauth2.googleapis.com/token");
        return Response.json(
          { error: remoteError, error_description: marker },
          { status },
        );
      });
      const resolveAI = vi.fn();
      const handler = createGmailHandler(
        gateway,
        {
          appOrigin: origin,
          callbackUrl: `${origin}/gmail-callback`,
          enforceCompanyRoles: true,
          enforceEntitlements: true,
          enforceReceivedPeriod: true,
          validateOAuthCredentials: true,
          now: () => Date.parse("2026-11-13T12:00:00Z"),
          oauth: {
            clientId: "468881730124-synthetic.apps.googleusercontent.com",
            clientSecret: "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ts-only",
            encryptionKey,
          },
          resolveAI,
        },
        fetcher,
      );
      const response = await handler(
        new Request(`${origin}/functions/v1/company-gmail`, {
          method: "POST",
          headers: {
            Origin: origin,
            Authorization: "Bearer synthetic-session",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "sync_period", organization_id: org }),
        }),
      );
      expect(response.status).toBe(expectedStatus);
      expect(await response.json()).toEqual({ error, imported: 0 });
      expect(server).toHaveBeenCalledWith(
        "finish_sync",
        expect.objectContaining({
          organization_id: org,
          reauthorize,
          succeeded: false,
        }),
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(upload).not.toHaveBeenCalled();
      expect(resolveAI).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      const code = await gmailFailureCode(null, {
        context: Response.json(
          { error, details: marker },
          { status: expectedStatus },
        ),
      });
      if (
        error === "google_client_rejected" ||
        error === "gmail_reauthorization_required"
      ) {
        expect(code).toBe(error);
        expect(gmailFailureMessage(code)).not.toContain(marker);
      }
    },
  );
});
