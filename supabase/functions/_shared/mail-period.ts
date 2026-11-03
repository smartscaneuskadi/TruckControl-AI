/** Calendar days in the fleet's published reference zone, shared by UI and server. */
export const mailPeriodPolicy = {
  version: 1,
  action: "sync_period",
  default_days: 30,
  max_months: 12,
  time_zone: "Europe/Madrid",
} as const;
export interface ReceivedPeriod {
  from: string;
  to: string;
}
export interface MailReadWindow extends ReceivedPeriod {
  start: number;
  end: number;
  key: string;
  query: string;
}
export class MailPeriodError extends Error {
  constructor() {
    super("invalid_received_period");
  }
}
const day = 86400000;
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: mailPeriodPolicy.time_zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function parts(value: number) {
  return Object.fromEntries(
    formatter.formatToParts(value).map((p) => [p.type, Number(p.value)]),
  );
}
function date(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}
function parse(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new MailPeriodError();
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(stamp) || date(stamp) !== value)
    throw new MailPeriodError();
  return stamp;
}
function localMidnight(value: string) {
  const target = parse(value);
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(candidate);
    const represented = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    candidate += target - represented;
  }
  const p = parts(candidate);
  if (
    date(Date.UTC(p.year, p.month - 1, p.day)) !== value ||
    p.hour !== 0 ||
    p.minute !== 0 ||
    p.second !== 0
  )
    throw new MailPeriodError();
  return candidate;
}
function monthsBefore(value: string, months: number) {
  const d = new Date(parse(value));
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return date(target.getTime());
}
export function mailPeriodBounds(now = Date.now()) {
  if (!Number.isFinite(now)) throw new MailPeriodError();
  const p = parts(now);
  const today = date(Date.UTC(p.year, p.month - 1, p.day));
  const tomorrow = date(parse(today) + day);
  return { today, earliest: monthsBefore(tomorrow, 12) };
}
export function presetReceivedPeriod(
  preset: "30d" | "3m" | "6m" | "12m" = "30d",
  now = Date.now(),
): ReceivedPeriod {
  const { today, earliest } = mailPeriodBounds(now);
  const tomorrow = date(parse(today) + day);
  return {
    from:
      preset === "30d"
        ? date(parse(today) - 29 * day)
        : preset === "12m"
          ? earliest
          : monthsBefore(tomorrow, preset === "3m" ? 3 : 6),
    to: today,
  };
}
export function resolveMailPeriod(
  value: unknown,
  now = Date.now(),
): MailReadWindow {
  const bounds = mailPeriodBounds(now);
  const input = value === undefined ? presetReceivedPeriod("30d", now) : value;
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new MailPeriodError();
  const { from, to } = input as ReceivedPeriod;
  parse(from);
  parse(to);
  if (from < bounds.earliest || to > bounds.today || from > to)
    throw new MailPeriodError();
  const start = localMidnight(from);
  const end = localMidnight(date(parse(to) + day));
  return {
    from,
    to,
    start,
    end,
    key: `received-v1:${from}:${to}:${mailPeriodPolicy.time_zone}`,
    // Gmail interprets YYYY/MM/DD as PST. Epoch seconds preserve our reference zone.
    // Widen the lower boundary by one second; the metadata check is exact/inclusive.
    query: `has:attachment -in:sent -in:drafts {factura invoice} after:${Math.floor(start / 1000) - 1} before:${Math.ceil(end / 1000)}`,
  };
}
export function receivedInPeriod(
  value: unknown,
  period: MailReadWindow,
  now = Date.now(),
) {
  if (typeof value !== "string" || !/^\d{1,16}$/.test(value)) return false;
  const stamp = Number(value);
  return (
    Number.isSafeInteger(stamp) &&
    stamp >= period.start &&
    stamp < period.end &&
    stamp <= now
  );
}
export function periodCursor(value: unknown, period: MailReadWindow) {
  if (typeof value !== "string" || value.length > 4000) return "";
  try {
    const stored = JSON.parse(value);
    return stored.v === 1 &&
      stored.period === period.key &&
      typeof stored.cursor === "string" &&
      stored.cursor.length <= 3000
      ? stored.cursor
      : "";
  } catch {
    // Legacy cursors have no range: restart rather than reusing another query's page.
    return "";
  }
}
export function savePeriodCursor(cursor: string, period: MailReadWindow) {
  if (cursor.length > 3000) throw new MailPeriodError();
  const encoded = JSON.stringify({ v: 1, period: period.key, cursor });
  if (encoded.length > 4000) throw new MailPeriodError();
  return encoded;
}
