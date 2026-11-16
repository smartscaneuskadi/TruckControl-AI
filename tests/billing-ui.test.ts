import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionProvider } from "../src/app/SubscriptionContext";
import { WorkspaceContext } from "../src/app/WorkspaceContext";
import { Billing, BillingNavigation } from "../src/pages/Billing";
import { Finance } from "../src/pages/Finance";
import { EntityEditor } from "../src/components/Editors";
import { createDemo } from "../src/data/demo";
import type { FleetSnapshot } from "../src/domain/models";
import { demoFeatures } from "../src/domain/subscriptions";
import type { Features } from "../src/domain/subscriptions";
import { money } from "../src/lib/format";

const fixture = vi.hoisted(() => ({
  snapshot: null as unknown as FleetSnapshot,
  execute: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../src/app/FleetProvider", () => ({
  useFleet: () => ({ ...fixture, busy: false }),
  errorMessage: () => "Error de prueba",
}));
vi.mock("../src/components/EntityDocuments", () => ({
  EntityDocuments: () => null,
}));

function render(
  children: ReactNode,
  {
    features = demoFeatures,
    enabled = true,
    path = "/billing",
  }: { features?: Features; enabled?: boolean; path?: string } = {},
) {
  return renderToStaticMarkup(
    createElement(SubscriptionProvider, {
      value: {
        enabled,
        features,
        access: null,
        refresh() {},
        openPlans() {},
      },
      children: createElement(WorkspaceContext.Provider, {
        value: {
          period: fixture.snapshot.demoMonth,
          setPeriod() {},
          edit() {},
          viewTruck() {},
        },
        children: createElement(MemoryRouter, {
          initialEntries: [path],
          children,
        }),
      }),
    }),
  );
}

beforeEach(() => {
  const fleet = createDemo();
  const base = {
    truckId: fleet.trucks[0].id,
    kind: "income" as const,
    category: "transport" as const,
    date: `${fleet.demoMonth}-15`,
    distanceKm: 100,
    paymentStatus: "pending" as const,
  };
  fleet.entries = [
    {
      ...base,
      id: "d1000000-0000-4000-8000-000000000001",
      concept: "Servicio con factura",
      amountCents: 12345,
      documentType: "invoice",
    },
    {
      ...base,
      id: "d1000000-0000-4000-8000-000000000002",
      concept: "Servicio con ticket",
      amountCents: 2789,
      documentType: "ticket",
    },
    {
      ...base,
      id: "d1000000-0000-4000-8000-000000000003",
      concept: "Servicio histórico sin propiedad",
      amountCents: 901,
    },
    {
      ...base,
      id: "d1000000-0000-4000-8000-000000000004",
      concept: "Servicio histórico sin clasificar",
      amountCents: 402,
      documentType: null,
    },
    {
      ...base,
      id: "d1000000-0000-4000-8000-000000000005",
      kind: "expense",
      category: "maintenance",
      distanceKm: 0,
      concept: "Gasto con albarán",
      amountCents: 10010,
      documentType: "delivery_note",
    },
  ];
  fixture.snapshot = fleet;
  fixture.execute.mockClear();
  fixture.notify.mockClear();
});

describe("Facturación con los permisos económicos existentes", () => {
  it.each([
    { income: true, expenses: false, label: "ingresos", amount: 16437 },
    { income: false, expenses: true, label: "gastos", amount: 10010 },
  ])("permite la consulta con $label como único módulo", (value) => {
    const html = render(createElement(Billing), {
      features: {
        ...demoFeatures,
        income: value.income,
        expenses: value.expenses,
      },
    });
    expect(html).toContain("<h1>Facturación</h1>");
    expect(html).toContain(`aria-label="Ver ${value.label} de facturación"`);
    expect(html).toContain(money(value.amount, true));
    expect(html).not.toContain(
      `aria-label="Ver ${value.income ? "gastos" : "ingresos"} de facturación"`,
    );
    expect(html).not.toContain("Módulo desactivado");
  });

  it("cierra el acceso cuando Ingresos y Gastos están desactivados", () => {
    const html = render(createElement(Billing), {
      features: { ...demoFeatures, income: false, expenses: false },
    });
    expect(html).toContain("Módulo desactivado");
    expect(html).not.toContain("billing-section-total");
  });

  it("conserva los dos apartados en modo demostración", () => {
    const html = render(createElement(Billing), {
      enabled: false,
      features: { ...demoFeatures, income: false, expenses: false },
    });
    expect(html).toContain('href="/income"');
    expect(html).toContain('href="/expenses"');
  });

  it("mantiene las rutas de los apartados y oculta las pestañas sin permiso", () => {
    const html = render(createElement(BillingNavigation), {
      path: "/expenses",
      features: { ...demoFeatures, income: false },
    });
    expect(html).toContain('href="/billing"');
    expect(html).toContain('href="/expenses"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/income"');
  });
});

describe("consulta de tipos sin cambios en contabilidad", () => {
  it("combina tipo, estado y camión y conserva los céntimos de origen", () => {
    const before = structuredClone(fixture.snapshot);
    const html = render(createElement(Finance, { kind: "income" }), {
      path: `/income?documentType=ticket&payment=pending&truck=${fixture.snapshot.trucks[0].id}`,
    });
    expect(html).toContain("Servicio con ticket");
    expect(html).toContain(money(2789, true));
    expect(html).not.toContain("Servicio con factura");
    expect(html).not.toContain("Servicio histórico");
    expect(fixture.snapshot).toEqual(before);
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it("trata undefined y null como sin clasificar sin asumir una factura", () => {
    const html = render(createElement(Finance, { kind: "income" }), {
      path: "/income?documentType=unclassified",
    });
    expect(html).toContain("Servicio histórico sin propiedad");
    expect(html).toContain("Servicio histórico sin clasificar");
    expect(html).toContain(money(1303, true));
    expect(html).not.toContain("Servicio con factura");
    expect(html).not.toContain("Servicio con ticket");
  });

  it("ofrece documentos solo con el permiso documental", () => {
    const allowed = render(createElement(Finance, { kind: "expense" }));
    expect(allowed).toContain("Ver o adjuntar documentos de Gasto con albarán");
    const denied = render(createElement(Finance, { kind: "expense" }), {
      features: { ...demoFeatures, documents: false },
    });
    expect(denied).not.toContain("Ver o adjuntar documentos de");
    expect(denied).toContain("Gasto con albarán");
  });
});

describe("clasificación explícita en el editor", () => {
  for (const kind of ["income", "expense"] as const)
    it(`propone factura en un nuevo ${kind} y exige uno de los tres tipos`, () => {
      const html = render(
        createElement(EntityEditor, { editor: { kind }, onClose() {} }),
      );
      expect(html).toMatch(/<select[^>]*name="documentType"[^>]*required=""/);
      expect(html).toContain(
        '<option value="invoice" selected="">Factura</option>',
      );
      expect(html).toContain('<option value="ticket">Ticket</option>');
      expect(html).toContain('<option value="delivery_note">Albarán</option>');
      expect(html).not.toContain("Sin clasificar");
      expect(html).not.toContain('type="file"');
    });

  it.each([2, 3])("conserva Sin clasificar para el histórico %s", (index) => {
    const html = render(
      createElement(EntityEditor, {
        editor: { kind: "income", value: fixture.snapshot.entries[index] },
        onClose() {},
      }),
    );
    expect(html).toContain(
      '<option value="" selected="">Sin clasificar</option>',
    );
    expect(html).not.toMatch(/<select[^>]*name="documentType"[^>]*required=""/);
  });

  it("conserva el tipo existente al abrir la edición", () => {
    const html = render(
      createElement(EntityEditor, {
        editor: { kind: "income", value: fixture.snapshot.entries[1] },
        onClose() {},
      }),
    );
    expect(html).toContain(
      '<option value="ticket" selected="">Ticket</option>',
    );
    expect(html).not.toContain("Sin clasificar");
  });
});
