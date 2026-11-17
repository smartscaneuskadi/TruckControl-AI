import {
  openMailAutomationPolicy,
  readOpenSessionMailGrant,
} from "../../supabase/functions/_shared/mail-automation";
import type { OpenSessionMailGrant } from "../../supabase/functions/_shared/mail-automation";
import {
  connectedInvoiceResult,
  ConnectedInvoiceImportError,
} from "../integrations/personal-mail/invoice-import";
import type { ConnectedInvoiceImportResult } from "../integrations/personal-mail/invoice-import";
import type { ReceivedPeriod } from "../../supabase/functions/_shared/mail-period";

export type MailAutomationStop =
  | "stopped"
  | "context"
  | "expired"
  | "offline"
  | "hidden"
  | "review"
  | "uncertain"
  | "budget"
  | "limit";
export interface MailAutomationView {
  accountId: string;
  state: "waiting" | "running" | "stopped";
  reason: MailAutomationStop | null;
  period: ReceivedPeriod;
  expiresAt: number;
  lastCheckedAt: number | null;
  nextCheckAt: number | null;
  requests: number;
  imported: number;
  analyzed: number;
  skipped: number;
  failures: number;
  hasMore: boolean;
}
interface Job {
  view: MailAutomationView;
  grant: OpenSessionMailGrant | null;
  period: ReceivedPeriod;
  cursor: string | null;
  seen: Set<string>;
  startedWall: number;
  startedMono: number;
  deadlineMono: number;
  dueMono: number;
  lastOrder: number;
}
export interface MailAutomationSchedulerOptions {
  now(): number;
  monotonic(): number;
  run(
    grant: OpenSessionMailGrant,
    period: ReceivedPeriod,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ConnectedInvoiceImportResult>;
  changed(views: MailAutomationView[], busy: boolean): void;
  setTimer?(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer?(timer: ReturnType<typeof setTimeout>): void;
}

/** One coordinator, no credentials, no storage and no retries of uncertain work. */
export class MailAutomationScheduler {
  private jobs = new Map<string, Job>();
  private scope = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight: { job: Job; controller: AbortController } | null = null;
  private manual: object | null = null;
  private lastDispatch = -Infinity;
  private sequence = 0;
  private disposed = false;
  constructor(private readonly options: MailAutomationSchedulerOptions) {}

  views() {
    return [...this.jobs.values()].map((j) => ({
      ...j.view,
      period: { ...j.view.period },
    }));
  }
  private publish() {
    this.options.changed(
      this.views(),
      this.flight !== null || this.manual !== null,
    );
  }
  private clearTimer() {
    if (this.timer !== null)
      (this.options.clearTimer ?? clearTimeout)(this.timer);
    this.timer = null;
  }
  private live(job: Job) {
    return job.grant !== null && job.view.state !== "stopped";
  }
  setScope(scope: string, accounts: readonly string[]) {
    if (this.disposed) return;
    if (scope !== this.scope) {
      this.stopAll("context");
      this.jobs.clear();
      this.scope = scope;
    }
    for (const id of this.jobs.keys())
      if (!accounts.includes(id)) {
        this.stop(id, "context");
        this.jobs.delete(id);
      }
    this.publish();
    this.schedule();
  }
  start(input: OpenSessionMailGrant) {
    const previous = this.jobs.get(input.account_id);
    if (this.disposed || this.manual || (previous && this.live(previous)))
      return false;
    const now = this.options.now(),
      mono = this.options.monotonic();
    const grant = readOpenSessionMailGrant(input, input.period, now);
    const expires = Date.parse(grant.expires_at);
    const job: Job = {
      grant,
      cursor: null,
      seen: new Set(),
      period: { ...grant.period },
      startedWall: now,
      startedMono: mono,
      deadlineMono: mono + expires - now,
      dueMono: mono,
      lastOrder: ++this.sequence,
      view: {
        accountId: grant.account_id,
        state: "waiting",
        reason: null,
        period: { ...grant.period },
        expiresAt: expires,
        lastCheckedAt: null,
        nextCheckAt: null,
        requests: 0,
        imported: 0,
        analyzed: 0,
        skipped: 0,
        failures: 0,
        hasMore: false,
      },
    };
    this.jobs.set(grant.account_id, job);
    this.publish();
    this.schedule();
    return true;
  }
  stop(accountId: string, reason: MailAutomationStop = "stopped") {
    const job = this.jobs.get(accountId);
    if (!job) return;
    job.grant = null;
    job.cursor = null;
    job.seen.clear();
    job.view.state = "stopped";
    job.view.reason = reason;
    job.view.nextCheckAt = null;
    if (this.flight?.job === job) this.flight.controller.abort();
    this.publish();
    this.schedule();
  }
  stopAll(reason: MailAutomationStop = "stopped") {
    this.clearTimer();
    for (const job of this.jobs.values()) {
      if (!this.live(job)) continue;
      job.grant = null;
      job.cursor = null;
      job.seen.clear();
      job.view.state = "stopped";
      job.view.reason = reason;
      job.view.nextCheckAt = null;
    }
    this.flight?.controller.abort();
    this.publish();
  }
  /** Manual work starts only after explicit stop and the old flight has settled. */
  beginManual(): (() => void) | null {
    if (
      this.disposed ||
      this.flight ||
      this.manual ||
      [...this.jobs.values()].some((j) => this.live(j))
    )
      return null;
    const lease = {};
    this.manual = lease;
    this.publish();
    return () => {
      if (this.manual === lease) {
        this.manual = null;
        this.publish();
        this.schedule();
      }
    };
  }
  private expired(job: Job) {
    const now = this.options.now(),
      mono = this.options.monotonic();
    return (
      now >= job.view.expiresAt ||
      mono >= job.deadlineMono ||
      now < job.startedWall - 5000 ||
      Math.abs(now - job.startedWall - (mono - job.startedMono)) > 30000
    );
  }
  private schedule() {
    this.clearTimer();
    if (this.disposed) return;
    const jobs = [...this.jobs.values()].filter((j) => this.live(j));
    if (!jobs.length) return;
    const mono = this.options.monotonic(),
      now = this.options.now();
    const expiry = Math.min(...jobs.map((j) => j.deadlineMono));
    const dispatch =
      this.flight || this.manual
        ? Infinity
        : Math.max(
            Math.min(...jobs.map((j) => j.dueMono)),
            this.lastDispatch + openMailAutomationPolicy.min_interval_ms,
          );
    for (const job of jobs)
      job.view.nextCheckAt = Number.isFinite(dispatch)
        ? now +
          Math.max(
            0,
            Math.max(
              job.dueMono,
              this.lastDispatch + openMailAutomationPolicy.min_interval_ms,
            ) - mono,
          )
        : null;
    this.publish();
    this.timer = (this.options.setTimer ?? setTimeout)(
      () => {
        this.timer = null;
        void this.tick();
      },
      Math.max(0, Math.min(expiry, dispatch) - mono),
    );
  }
  private async tick() {
    if (this.disposed) return;
    for (const [id, job] of this.jobs)
      if (this.live(job) && this.expired(job)) this.stop(id, "expired");
    if (this.flight || this.manual) {
      this.schedule();
      return;
    }
    const mono = this.options.monotonic();
    if (mono < this.lastDispatch + openMailAutomationPolicy.min_interval_ms) {
      this.schedule();
      return;
    }
    const job = [...this.jobs.values()]
      .filter((j) => this.live(j) && j.dueMono <= mono)
      .sort((a, b) => a.lastOrder - b.lastOrder)[0];
    if (!job?.grant) {
      this.schedule();
      return;
    }
    if (job.view.requests >= openMailAutomationPolicy.max_requests) {
      this.stop(job.view.accountId, "limit");
      return;
    }
    let grant: OpenSessionMailGrant;
    try {
      grant = readOpenSessionMailGrant(
        job.grant,
        job.period,
        this.options.now(),
      );
    } catch {
      this.stop(job.view.accountId, "expired");
      return;
    }
    const flight = { job, controller: new AbortController() };
    this.flight = flight;
    this.lastDispatch = mono;
    job.lastOrder = ++this.sequence;
    job.view.state = "running";
    job.view.requests++;
    this.schedule();
    try {
      const raw = await this.options.run(
        grant,
        { ...job.period },
        job.cursor,
        flight.controller.signal,
      );
      if (
        flight.controller.signal.aborted ||
        !this.live(job) ||
        this.jobs.get(job.view.accountId) !== job
      )
        return;
      const data = connectedInvoiceResult(raw, job.period);
      if (
        this.expired(job) ||
        data.imported > openMailAutomationPolicy.max_new_attachments
      )
        throw new ConnectedInvoiceImportError("uncertain");
      job.view.imported += data.imported;
      job.view.analyzed += data.ai_used;
      job.view.skipped += data.skipped;
      job.view.failures += data.failures;
      job.view.lastCheckedAt = this.options.now();
      job.view.hasMore = data.has_more;
      if (data.failures) {
        this.stopAll("review");
        return;
      }
      if (data.has_more) {
        if (
          !data.next_cursor ||
          job.seen.has(data.next_cursor) ||
          (data.examined === 0 && data.imported === 0 && data.skipped === 0)
        )
          throw new ConnectedInvoiceImportError("uncertain");
        job.seen.add(data.next_cursor);
        job.cursor = data.next_cursor;
      } else {
        job.cursor = null;
        job.seen.clear();
        // Narrow only inside the fixed, explicitly authorized calendar window.
        job.period = { from: grant.period.to, to: grant.period.to };
      }
      job.view.state = "waiting";
      job.dueMono =
        this.options.monotonic() + openMailAutomationPolicy.min_interval_ms;
      if (job.view.requests >= openMailAutomationPolicy.max_requests)
        this.stop(job.view.accountId, "limit");
    } catch (error) {
      if (
        !flight.controller.signal.aborted &&
        this.live(job) &&
        this.jobs.get(job.view.accountId) === job
      )
        this.stopAll(
          error instanceof ConnectedInvoiceImportError &&
            error.code === "budget"
            ? "budget"
            : "uncertain",
        );
    } finally {
      if (this.flight === flight) this.flight = null;
      this.publish();
      this.schedule();
    }
  }
  dispose() {
    this.disposed = true;
    this.stopAll("context");
    this.jobs.clear();
    this.clearTimer();
  }
}
