import type { FleetSnapshot } from "../domain/models";
import type { OperationRecord } from "../domain/operations";
import { tripFinanceSchema } from "../domain/commercial-records";
import type { TripFinance } from "../domain/commercial-records";
const links = new Map<string, Map<string, string>>(),
  reviews = new Map<string, Map<string, string>>();
function state(org: string) {
  if (!links.has(org)) links.set(org, new Map());
  if (!reviews.has(org)) reviews.set(org, new Map());
  return { links: links.get(org)!, reviews: reviews.get(org)! };
}
export function demoTripCandidates(
  fleet: FleetSnapshot,
  operations: OperationRecord[],
  id: string,
) {
  const trip = operations.find((r) => r.id === id && r.kind === "trips");
  if (!trip) throw Error("El viaje ya no está disponible.");
  const used = state(fleet.organization.id).links;
  return fleet.entries
    .filter(
      (e) =>
        e.truckId === trip.data.truckId &&
        !used.has(e.id) &&
        !operations.some(
          (r) => r.kind === "trips" && r.financeEntryId === e.id,
        ),
    )
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      concept: e.concept,
      date: e.date,
      amount_cents: e.amountCents,
      payment_status: e.paymentStatus,
      row_version: 1,
      auto_booked: false,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export async function demoTripFinance(
  fleet: FleetSnapshot,
  operations: OperationRecord[],
  id: string,
  action: "summary" | "link" | "unlink" | "review" = "summary",
  data: { entry_id?: string; expected_fingerprint?: string } = {},
): Promise<TripFinance> {
  const trip = operations.find((r) => r.kind === "trips" && r.id === id);
  if (!trip) throw Error("El viaje ya no está disponible.");
  const s = state(fleet.organization.id);
  // Remove only stale in-memory demo references, never production records.
  for (const [entry, target] of s.links)
    if (
      !fleet.entries.some((e) => e.id === entry) ||
      !operations.some((r) => r.id === target && r.kind === "trips")
    )
      s.links.delete(entry);
  if (action === "link" || action === "unlink") {
    const entry = fleet.entries.find((e) => e.id === data.entry_id);
    if (
      !entry ||
      entry.truckId !== trip.data.truckId ||
      operations.some(
        (r) => r.kind === "trips" && r.financeEntryId === entry.id,
      )
    )
      throw Error("El movimiento no se puede vincular a este viaje.");
    const previous = s.links.get(entry.id);
    if (previous && previous !== id)
      throw Error("El movimiento está vinculado a otro viaje.");
    if (action === "link") s.links.set(entry.id, id);
    else s.links.delete(entry.id);
  }
  const rows = fleet.entries
    .filter((e) => e.id === trip.financeEntryId || s.links.get(e.id) === id)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      concept: e.concept,
      date: e.date,
      amount_cents: e.amountCents,
      payment_status: e.paymentStatus,
      row_version: 1,
      auto_booked: e.id === trip.financeEntryId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const raw = new TextEncoder().encode(JSON.stringify([trip, rows]));
  const fingerprint = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  const canReview = ["completed", "cancelled"].includes(
    String(trip.data.status),
  );
  if (action === "review") {
    if (!canReview || data.expected_fingerprint !== fingerprint)
      throw Error(
        "El viaje o sus movimientos han cambiado. Revisa los datos actuales.",
      );
    s.reviews.set(id, fingerprint);
  }
  const income = rows
      .filter((r) => r.kind === "income")
      .reduce((n, r) => n + r.amount_cents, 0),
    expense = rows
      .filter((r) => r.kind === "expense")
      .reduce((n, r) => n + r.amount_cents, 0);
  const reviewed = s.reviews.get(id) === fingerprint;
  return tripFinanceSchema.parse({
    schema_version: 1,
    organization_id: fleet.organization.id,
    trip_id: id,
    quoted_net_cents: Number(trip.data.amountCents),
    income_cents: income,
    expense_cents: expense,
    income_count: rows.filter((r) => r.kind === "income").length,
    expense_count: rows.filter((r) => r.kind === "expense").length,
    recorded_margin_cents: income - expense,
    reviewed_margin_cents: reviewed ? income - expense : null,
    reviewed,
    fingerprint,
    can_review: canReview,
    rows: rows.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    ),
    rows_partial: false,
    basis:
      "Fictitious demo only. Linked EUR accrual entries; excludes unallocated truck costs, taxes and overhead.",
  });
}
