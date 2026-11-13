import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  RecurringSubscription,
  recurringStatusSchema,
  type RecurringStatus,
} from "../components/RecurringSubscription";

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => null,
}));

function status(subscription: Record<string, unknown> = {}) {
  return recurringStatusSchema.parse({
    configured: false,
    invoice_delivery_ready: false,
    management_available: true,
    terms_version: null,
    terms_url: null,
    subscription: {
      state: "active",
      plan_id: "limited",
      monthly_cents: 36300,
      currency: "EUR",
      period_end: "2026-12-13T00:00:00Z",
      cancel_at_period_end: false,
      ...subscription,
    },
    invoices: [],
  });
}
const render = (data: RecurringStatus, canResume = false) =>
  renderToStaticMarkup(
    createElement(RecurringSubscription, {
      status: data,
      canResume,
      onRefresh: () => undefined,
    }),
  );
const cancelButton = (html: string) =>
  html.match(/<button\b[^>]*>Cancelar renovación<\/button>/)?.[0];

describe("subscription reconciliation state in the status adapter and UI", () => {
  it.each([false, true])(
    "shows uncertainty and keeps cancellation available when saved cancel=%s",
    (cancel) => {
      const data = status({
        reconciliation_required: true,
        cancel_at_period_end: cancel,
      });
      const html = render(data);
      expect(html).toContain("Estado pendiente de confirmar");
      expect(html).toContain("Fin del último periodo registrado");
      expect(html).toContain('role="status"');
      expect(html).toContain("pendiente de confirmar con el proveedor");
      expect(html).not.toContain("<strong>Activa</strong>");
      expect(html).not.toContain("Renovación desactivada");
      expect(html).not.toContain("Reactivar renovación");
      expect(cancelButton(html)).toBeDefined();
      expect(cancelButton(html)).not.toContain("disabled");
    },
  );

  it.each(["canceled", "incomplete_expired", "past_due"])(
    "does not present saved %s as a confirmed current state",
    (state) => {
      const html = render(
        status({
          state,
          reconciliation_required: true,
          cancel_at_period_end: true,
        }),
      );
      expect(html).toContain("<strong>Estado pendiente de confirmar</strong>");
      expect(html).not.toContain("<strong>Cancelada</strong>");
      expect(html).not.toContain("<strong>Alta caducada</strong>");
      expect(html).not.toContain(
        "<strong>Renovación pendiente de pago</strong>",
      );
      expect(html).not.toContain("Renovación desactivada");
      if (state !== "past_due") {
        expect(cancelButton(html)).toBeUndefined();
        expect(html).not.toContain("Reactivar renovación");
        expect(html).toContain("contacta con soporte");
      }
    },
  );

  it("returns to the confirmed cancelled-renewal view only after the server clears the pending flag", () => {
    const pending = status({
      reconciliation_required: true,
      cancel_at_period_end: true,
    });
    expect(render(pending)).not.toContain("Renovación desactivada");
    const confirmed = status({
      reconciliation_required: false,
      cancel_at_period_end: true,
    });
    const html = render(confirmed);
    expect(html).not.toContain("Estado pendiente de confirmar");
    expect(html).toContain("<strong>Activa</strong>");
    expect(html).toContain("Renovación desactivada. Fin del periodo");
    expect(html).toContain("Reactivar renovación");
    expect(html).toMatch(
      /<button\b[^>]*disabled=""[^>]*>Reactivar renovación<\/button>/,
    );
  });

  it("returns to the confirmed resumed view only after the server clears the pending flag", () => {
    expect(render(status({ reconciliation_required: true }))).toContain(
      "Estado pendiente de confirmar",
    );
    const html = render(status({ reconciliation_required: false }));
    expect(html).not.toContain("Estado pendiente de confirmar");
    expect(html).toContain("Fin del periodo actual");
    expect(cancelButton(html)).toBeDefined();
    expect(html).not.toContain("Reactivar renovación");
  });

  it("accepts a prior backend omitting the new field and defaults it to confirmed", () => {
    const oldBackend = status({ cancel_at_period_end: true });
    expect(oldBackend.subscription?.reconciliation_required).toBe(false);
    const html = render(oldBackend, true);
    expect(html).not.toContain("Estado pendiente de confirmar");
    expect(html).toContain("Renovación desactivada");
    expect(html).toContain("Reactivar renovación");
  });

  it("does not invent management availability from a pending state", () => {
    const data = status({
      reconciliation_required: true,
      cancel_at_period_end: true,
    });
    data.management_available = false;
    expect(cancelButton(render(data))).toContain('disabled=""');
  });
});
