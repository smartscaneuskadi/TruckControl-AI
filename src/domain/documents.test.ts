import { describe, it, expect } from "vitest";
import { createDemo } from "../data/demo";
import { operationalAlerts, parseOperation } from "./operations";
import {
  documentState,
  defaultDocumentTracking,
  filterDocuments,
  documentTrackingInput,
} from "./documents";
import type { TrackedDocument } from "./documents";
const day = "2026-11-02",
  fleet = createDemo();
function doc(
  date: string | null,
  status: "active" | "archived" = "active",
  days = 30,
): TrackedDocument {
  return {
    id: "d2200000-0000-4000-8000-000000000001",
    organization_id: fleet.organization.id,
    name: "Seguro ficticio.pdf",
    truck_id: null,
    driver_id: null,
    created_at: "2026-11-02T00:00:00Z",
    size_bytes: 100,
    tracking: {
      ...defaultDocumentTracking,
      expires_on: date,
      status,
      remind_days: days,
    },
  };
}
describe("vencimientos documentales", () => {
  it.each([
    ["2026-11-01", "expired"],
    ["2026-11-02", "due"],
    ["2026-12-02", "due"],
    ["2026-12-03", "valid"],
    [null, "undated"],
  ])("clasifica %s como %s sin inventar fechas", (date, state) =>
    expect(documentState(doc(date), day)).toBe(state),
  );
  it("archivar retira el aviso sin modificar la fecha", () => {
    const d = doc("2026-01-01", "archived");
    expect(documentState(d, day)).toBe("archived");
    expect(
      operationalAlerts(fleet, [], day, [d]).filter(
        (r) => r.source === "documents",
      ),
    ).toHaveLength(0);
    expect(d.tracking!.expires_on).toBe("2026-01-01");
  });
  it("respeta antelación cero y fechas de fin de mes", () => {
    expect(documentState(doc("2026-11-03", "active", 0), day)).toBe("valid");
    expect(documentState(doc("2026-11-02", "active", 0), day)).toBe("due");
  });
  it("revisar un aviso conserva el documento y una nueva fecha vuelve a avisar", () => {
    const d = doc("2026-11-01"),
      first = operationalAlerts(fleet, [], day, [d]).find(
        (r) => r.source === "documents",
      )!;
    const ack = parseOperation({
      id: crypto.randomUUID(),
      kind: "alerts",
      data: {
        title: first.title,
        dueOn: first.dueOn,
        truckId: null,
        priority: "urgent",
        status: "acknowledged",
        sourceKey: first.key,
      },
      version: 1,
      financeEntryId: null,
    });
    expect(
      operationalAlerts(fleet, [ack], day, [d]).filter(
        (r) => r.source === "documents",
      ),
    ).toHaveLength(0);
    expect(
      operationalAlerts(fleet, [ack], day, [doc("2026-11-20")]).filter(
        (r) => r.source === "documents",
      ),
    ).toHaveLength(1);
  });
  it("filtra nombre, categoría y estado sin mezclar archivados", () => {
    const rows = [
      doc("2026-11-01"),
      { ...doc(null), id: crypto.randomUUID(), name: "Contrato.pdf" },
      { ...doc("2026-11-01", "archived"), id: crypto.randomUUID() },
    ];
    expect(
      filterDocuments(rows, day, "SEGURO", "expired", "other"),
    ).toHaveLength(1);
    expect(filterDocuments(rows, day, "", "active", "all")).toHaveLength(2);
    expect(filterDocuments(rows, day, "", "all", "all")).toHaveLength(3);
  });
  it("rechaza fechas imposibles, avisos fraccionarios y campos ajenos", () => {
    for (const patch of [
      { expires_on: "2026-02-30" },
      { remind_days: 0.5 },
      { organization_id: crypto.randomUUID() },
    ])
      expect(() =>
        documentTrackingInput.parse({
          category: "other",
          status: "active",
          expires_on: null,
          remind_days: 30,
          ...patch,
        }),
      ).toThrow();
  });
});
