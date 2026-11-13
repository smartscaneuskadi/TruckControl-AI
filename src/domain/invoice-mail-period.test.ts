import { describe, expect, it } from "vitest";
import {
  presetReceivedPeriod,
  resolveMailPeriod,
} from "../../supabase/functions/_shared/mail-period";
import { requestedInvoiceMailPeriod } from "./invoice-mail-period";

describe("invoice mail range at an explicit read action", () => {
  const before = Date.parse("2026-11-13T22:59:59Z");
  const after = Date.parse("2026-11-13T23:00:01Z");

  it("refreshes a held thirty-day preset after Madrid midnight", () => {
    const held = presetReceivedPeriod("30d", before);
    expect(held).toEqual({ from: "2026-10-15", to: "2026-11-13" });
    expect(requestedInvoiceMailPeriod("30d", held, after)).toEqual({
      from: "2026-10-16",
      to: "2026-11-14",
    });
    expect(held).toEqual({ from: "2026-10-15", to: "2026-11-13" });
  });

  it("rebuilds an expired full twelve-month preset instead of blocking the read action", () => {
    const held = presetReceivedPeriod("12m", before);
    expect(() => resolveMailPeriod(held, after)).toThrow();
    expect(requestedInvoiceMailPeriod("12m", held, after)).toEqual({
      from: "2025-11-15",
      to: "2026-11-14",
    });
  });

  it.each([
    ["3m", "2026-03-31T22:00:01Z", "2026-01-02", "2026-04-01"],
    ["6m", "2026-08-31T22:00:01Z", "2026-03-02", "2026-09-01"],
    ["12m", "2024-02-29T12:00:00Z", "2023-03-01", "2024-02-29"],
    ["12m", "2025-02-28T23:00:01Z", "2024-03-02", "2025-03-01"],
  ] as const)(
    "preserves %s calendar semantics at %s",
    (preset, clock, from, to) => {
      expect(
        requestedInvoiceMailPeriod(
          preset,
          { from: "2000-01-01", to: "2000-01-02" },
          Date.parse(clock),
        ),
      ).toEqual({ from, to });
    },
  );

  it("never expands a valid custom range, including after another day passes", () => {
    const selected = { from: "2026-10-28", to: "2026-11-01" };
    expect(requestedInvoiceMailPeriod("custom", selected, after)).toEqual(
      selected,
    );
    expect(
      requestedInvoiceMailPeriod("custom", selected, after + 86400000),
    ).toEqual(selected);
  });

  it("strictly rejects an overnight custom range that has aged outside twelve months", () => {
    const custom = presetReceivedPeriod("12m", before);
    expect(() => requestedInvoiceMailPeriod("custom", custom, after)).toThrow(
      "invalid_received_period",
    );
  });

  it("keeps a prepared confirmation unchanged and rejects it if its boundary ages out", () => {
    const confirmation = requestedInvoiceMailPeriod(
      "12m",
      presetReceivedPeriod("12m", before),
      before,
    );
    expect(() => resolveMailPeriod(confirmation, after)).toThrow(
      "invalid_received_period",
    );
    expect(confirmation).toEqual({ from: "2025-11-14", to: "2026-11-13" });
  });
});
