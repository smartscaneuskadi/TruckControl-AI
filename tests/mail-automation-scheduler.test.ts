import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailAutomationSchedulerOptions } from "../src/domain/mail-automation";
import { MailAutomationScheduler } from "../src/domain/mail-automation";
import { ConnectedInvoiceImportError } from "../src/integrations/personal-mail/invoice-import";
import type { ConnectedInvoiceImportResult } from "../src/integrations/personal-mail/invoice-import";
import { openMailAutomationPolicy } from "../supabase/functions/_shared/mail-automation";
import type { OpenSessionMailGrant } from "../supabase/functions/_shared/mail-automation";
import type { ReceivedPeriod } from "../supabase/functions/_shared/mail-period";

type Run = MailAutomationSchedulerOptions["run"];
const now = Date.parse("2026-11-17T12:00:00.000Z");
const account = "af000000-0000-4000-8000-000000000001",
  other = "af000000-0000-4000-8000-000000000002";
const period = { from: "2026-10-19", to: "2026-11-17" };
const schedulers: MailAutomationScheduler[] = [];
function grant(id = account): OpenSessionMailGrant {
  return {
    version: "2026-11-17",
    accepted: true,
    id: crypto.randomUUID(),
    actor_id: "af000000-0000-4000-8000-000000000003",
    organization_id: "af000000-0000-4000-8000-000000000004",
    account_id: id,
    session_id: "af000000-0000-4000-8000-000000000005",
    aal: "aal1",
    mailbox: "fictitious@example.com",
    provider: "gmail",
    period: { ...period },
    started_at: new Date(Date.now()).toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
}
function result(
  window: ReceivedPeriod,
  extra: Partial<ConnectedInvoiceImportResult> = {},
): ConnectedInvoiceImportResult {
  return {
    authorization_scope: "selected_mailbox_period",
    consent_version: "2026-11-16",
    imported: 1,
    skipped: 0,
    failures: 0,
    ai_used: 1,
    examined: 1,
    has_more: false,
    next_cursor: null,
    received_period: { ...window, time_zone: "Europe/Madrid" },
    ...extra,
  };
}
function setup(
  run = vi.fn<Run>(
    async (
      _g: OpenSessionMailGrant,
      window: ReceivedPeriod,
      _cursor: string | null,
      _signal: AbortSignal,
    ) => result(window),
  ),
) {
  const changed = vi.fn();
  const scheduler = new MailAutomationScheduler({
    now: () => Date.now(),
    monotonic: () => performance.now(),
    run,
    changed,
  });
  schedulers.push(scheduler);
  scheduler.setScope("user/company/SID/aal1", [account, other]);
  return { scheduler, run, changed };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  for (const s of schedulers.splice(0)) s.dispose();
  vi.useRealTimers();
});

describe("authorized foreground invoice scheduling", () => {
  it("does nothing until explicit activation and prevents a double-click renewal", async () => {
    const { scheduler, run } = setup(),
      authorization = grant();
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.start(authorization)).toBe(true);
    expect(scheduler.start({ ...authorization, id: crypto.randomUUID() })).toBe(
      false,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.views()[0].expiresAt).toBe(
      Date.parse(authorization.expires_at),
    );
  });
  it("enforces five minutes including catch-up continuations", async () => {
    const run = vi.fn<Run>(
      async (_g: OpenSessionMailGrant, p: ReceivedPeriod) =>
        result(p, {
          has_more: true,
          next_cursor: `cursor.${run.mock.calls.length}`,
        }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      openMailAutomationPolicy.min_interval_ms - 1,
    );
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][2]).toBe("cursor.1");
  });
  it("keeps one request in flight across two accounts even after a stopped flight ignores abort", async () => {
    let finish!: (r: ConnectedInvoiceImportResult) => void;
    const run = vi.fn<Run>(
      (_g: OpenSessionMailGrant, p: ReceivedPeriod) =>
        new Promise<ConnectedInvoiceImportResult>((resolve) => {
          finish = resolve;
        }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    scheduler.start(grant(other));
    await vi.advanceTimersByTimeAsync(0);
    const signal = run.mock.calls[0][3];
    scheduler.stop(account);
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(600000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.beginManual()).toBeNull();
    finish(result(period));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0].account_id).toBe(other);
    expect(
      scheduler.views().find((v) => v.accountId === account)?.imported,
    ).toBe(0);
    finish(result(period));
    await vi.advanceTimersByTimeAsync(0);
  });
  it("narrows to the already authorized day only after catch-up completes", async () => {
    const { scheduler, run } = setup(),
      original = grant();
    scheduler.start(original);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(openMailAutomationPolicy.min_interval_ms);
    expect(run.mock.calls[0][1]).toEqual(period);
    expect(run.mock.calls[1][1]).toEqual({ from: period.to, to: period.to });
    expect(run.mock.calls[1][0].period).toEqual(period);
    expect(original.period).toEqual(period);
  });
  for (const reason of ["offline", "hidden", "context", "stopped"] as const)
    it(`${reason} never restarts automatically`, async () => {
      const { scheduler, run } = setup();
      scheduler.start(grant());
      await vi.advanceTimersByTimeAsync(0);
      scheduler.stopAll(reason);
      scheduler.setScope("user/company/SID/aal1", [account, other]);
      await vi.advanceTimersByTimeAsync(1200000);
      expect(run).toHaveBeenCalledTimes(1);
      expect(scheduler.views()[0].reason).toBe(reason);
    });
  it("drops stale data after company/SID context replacement", async () => {
    let finish!: (r: ConnectedInvoiceImportResult) => void;
    const run = vi.fn<Run>(
      (_g: OpenSessionMailGrant, _p: ReceivedPeriod) =>
        new Promise<ConnectedInvoiceImportResult>((resolve) => {
          finish = resolve;
        }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(0);
    scheduler.setScope("new-company/new-SID/aal2", [account]);
    finish(result(period));
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.views()).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("removes a disconnected account and never inherits its grant on reconnect", async () => {
    const { scheduler, run } = setup();
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(0);
    scheduler.setScope("user/company/SID/aal1", []);
    scheduler.setScope("user/company/SID/aal1", [account]);
    await vi.advanceTimersByTimeAsync(600000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.views()).toEqual([]);
  });
  it("does not prolong a grant on refresh with the same SID", async () => {
    const { scheduler } = setup(),
      authorization = grant();
    scheduler.start(authorization);
    const expires = scheduler.views()[0].expiresAt;
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.setScope("user/company/SID/aal1", [account, other]);
    expect(scheduler.views()[0].expiresAt).toBe(expires);
  });
  for (const failure of [
    "budget",
    "unavailable",
    "uncertain",
    "expired",
  ] as const)
    it(`${failure} trips all accounts without retrying or restarting cursors`, async () => {
      const run = vi.fn<Run>(async () => {
        throw new ConnectedInvoiceImportError(failure);
      });
      const { scheduler } = setup(run);
      scheduler.start(grant());
      scheduler.start(grant(other));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1800000);
      expect(run).toHaveBeenCalledTimes(1);
      expect(scheduler.views().every((v) => v.state === "stopped")).toBe(true);
    });
  it("a stored original with failed AI stops every account without discarding its counters", async () => {
    const run = vi.fn<Run>(
      async (_g: OpenSessionMailGrant, p: ReceivedPeriod) =>
        result(p, { ai_used: 0, failures: 1 }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    scheduler.start(grant(other));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(600000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      scheduler.views().find((v) => v.accountId === account),
    ).toMatchObject({
      imported: 1,
      analyzed: 0,
      failures: 1,
      state: "stopped",
      reason: "review",
    });
  });
  it("rejects a batch exceeding the automatic new-original limit", async () => {
    const run = vi.fn<Run>(
      async (_g: OpenSessionMailGrant, p: ReceivedPeriod) =>
        result(p, { imported: 2, ai_used: 2 }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.views()[0]).toMatchObject({
      state: "stopped",
      reason: "uncertain",
      imported: 0,
    });
  });
  it("detects a repeated cursor instead of starting the period again", async () => {
    const run = vi.fn<Run>(
      async (_g: OpenSessionMailGrant, p: ReceivedPeriod) =>
        result(p, { has_more: true, next_cursor: "cursor.same" }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(600000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(scheduler.views()[0].reason).toBe("uncertain");
  });
  it("stops a cursor claiming more work without any measurable progress", async () => {
    const run = vi.fn<Run>(
      async (_g: OpenSessionMailGrant, p: ReceivedPeriod) =>
        result(p, {
          imported: 0,
          ai_used: 0,
          examined: 0,
          has_more: true,
          next_cursor: "cursor.empty",
        }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(600000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.views()[0].reason).toBe("uncertain");
  });
  it("enforces the request ceiling while the original authorization still has time left", async () => {
    const run = vi.fn<Run>(
      async (_g: OpenSessionMailGrant, p: ReceivedPeriod) =>
        result(p, {
          has_more: true,
          next_cursor: `cursor.${run.mock.calls.length}`,
        }),
    );
    const { scheduler } = setup(run);
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(
      openMailAutomationPolicy.min_interval_ms *
        openMailAutomationPolicy.max_requests,
    );
    expect(run).toHaveBeenCalledTimes(openMailAutomationPolicy.max_requests);
    expect(scheduler.views()[0]).toMatchObject({
      state: "stopped",
      reason: "limit",
    });
  });
  it("ends an in-flight authorization at its immutable deadline and discards the late result", async () => {
    let finish!: (r: ConnectedInvoiceImportResult) => void;
    const run = vi.fn<Run>(
      (_g: OpenSessionMailGrant, _p: ReceivedPeriod) =>
        new Promise<ConnectedInvoiceImportResult>((resolve) => {
          finish = resolve;
        }),
    );
    const { scheduler } = setup(run);
    const authorization = grant();
    authorization.expires_at = new Date(now + 1000).toISOString();
    scheduler.start(authorization);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run.mock.calls[0][3].aborted).toBe(true);
    finish(result(period));
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.views()[0]).toMatchObject({
      reason: "expired",
      imported: 0,
    });
  });
  it("stops on a backwards wall-clock adjustment instead of extending the grant", async () => {
    const { scheduler, run } = setup();
    scheduler.start(grant());
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(now - 60000);
    await vi.advanceTimersByTimeAsync(openMailAutomationPolicy.min_interval_ms);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.views()[0].reason).toBe("expired");
  });
  it("serializes manual work and never silently enables a waiting automatic request", async () => {
    const { scheduler, run } = setup(),
      release = scheduler.beginManual();
    expect(release).not.toBeNull();
    expect(scheduler.start(grant())).toBe(false);
    expect(scheduler.beginManual()).toBeNull();
    release!();
    expect(scheduler.start(grant())).toBe(true);
    expect(scheduler.beginManual()).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
