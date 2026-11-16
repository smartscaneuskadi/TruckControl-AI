import {
  expect,
  test,
  demoNavigate as goto,
  demoSnapshot as snapshot,
  demoReload,
  downloadedBytes,
  selectedTheme,
} from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type {
  FinanceDocumentType,
  FinanceEntry,
} from "../../src/domain/models";
import { filterEntries, summarize } from "../../src/domain/finance";
import { money } from "../../src/lib/format";

test("Facturación agrupa las rutas existentes y es accesible en ambos temas", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const theme = selectedTheme(info);
  await goto(page, "/dashboard");
  if (info.project.name.includes("android"))
    await page.getByRole("button", { name: "Abrir menú" }).click();
  const sidebar = page.locator(".sidebar");
  const group = sidebar.getByRole("group", {
    name: "Facturación",
    exact: true,
  });
  await expect(
    group.getByRole("link", { name: "Ingresos", exact: true }),
  ).toHaveAttribute("href", "#/income");
  await expect(
    group.getByRole("link", { name: "Gastos", exact: true }),
  ).toHaveAttribute("href", "#/expenses");
  await sidebar.getByRole("link", { name: "Facturación", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Facturación", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const before = await snapshot(page);
  const summary = summarize(filterEntries(before.entries, before.demoMonth));
  await expect(page.locator(".billing-sections")).toContainText(
    money(summary.incomeCents, true),
  );
  await expect(page.locator(".billing-sections")).toContainText(
    money(summary.expenseCents, true),
  );
  for (const path of ["/billing", "/income", "/expenses"]) {
    await goto(page, path);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect(await snapshot(page)).toEqual(before);
});

test("guarda los tres tipos en ingresos y gastos y exporta el filtro sin cambiar los céntimos", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await goto(page, "/billing");
  const before = await snapshot(page);
  const baseline = summarize(filterEntries(before.entries, before.demoMonth));
  const types: FinanceDocumentType[] = ["invoice", "ticket", "delivery_note"];
  for (const kind of ["income", "expense"] as const) {
    for (const documentType of types) {
      await goto(page, kind === "income" ? "/income" : "/expenses");
      await page
        .getByRole("button", {
          name: kind === "income" ? "Nuevo ingreso" : "Nuevo gasto",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      const classification = dialog.getByLabel("Tipo de documento", {
        exact: true,
      });
      await expect(classification).toHaveValue("invoice");
      await expect(classification).toHaveAttribute("required", "");
      await expect(classification.locator("option")).toHaveCount(3);
      await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
      await classification.selectOption(documentType);
      await dialog
        .getByLabel("Concepto", { exact: true })
        .fill(`Documento económico ficticio ${kind} ${documentType}`);
      await dialog
        .getByLabel("Camión", { exact: true })
        .selectOption(before.trucks[0].id);
      await dialog
        .getByLabel("Fecha de devengo")
        .fill(`${before.demoMonth}-15`);
      await dialog
        .getByLabel("Importe (€)")
        .fill(kind === "income" ? "500,25" : "100,10");
      if (kind === "income")
        await dialog.getByLabel("Kilómetros del servicio").fill("100");
      await dialog
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
    }
  }
  await demoReload(page);
  const after = await snapshot(page);
  const additions = after.entries.filter((entry) =>
    entry.concept.startsWith("Documento económico ficticio"),
  );
  expect(additions).toHaveLength(6);
  for (const kind of ["income", "expense"] as const) {
    expect(
      additions
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.documentType)
        .sort(),
    ).toEqual([...types].sort());
    expect(
      additions
        .filter((entry) => entry.kind === kind)
        .every(
          (entry) => entry.amountCents === (kind === "income" ? 50025 : 10010),
        ),
    ).toBe(true);
  }
  const result = summarize(filterEntries(after.entries, before.demoMonth));
  expect(result.incomeCents).toBe(baseline.incomeCents + 150075);
  expect(result.expenseCents).toBe(baseline.expenseCents + 30030);
  expect(result.profitCents).toBe(baseline.profitCents + 120045);
  await goto(
    page,
    "/income?search=Documento%20econ%C3%B3mico%20ficticio%20income",
  );
  await page
    .getByRole("combobox", { name: "Filtrar tipo de documento" })
    .selectOption("ticket");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Ticket");
  await expect(page.locator(".metrics-grid")).toContainText(money(50025, true));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const download = await downloadPromise;
  const path = info.outputPath("facturacion-ticket.csv");
  await download.saveAs(path);
  const csv = await readFile(path, "utf8");
  expect(csv).toContain('"Tipo de documento"');
  expect(csv).toContain('"Ticket"');
  expect(csv).toContain('"500.25"');
  expect(csv.split("\r\n")).toHaveLength(2);
  expect(await snapshot(page)).toEqual(after);
});

test("editar otros campos mantiene los históricos sin clasificar hasta una elección explícita", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await goto(page, "/income");
  const fleet = await snapshot(page);
  const template = fleet.entries.find((entry) => entry.kind === "income")!;
  const legacy: FinanceEntry[] = [
    {
      ...template,
      id: "d2000000-0000-4000-8000-000000000001",
      date: `${fleet.demoMonth}-15`,
      concept: "Legado facturación ingreso",
      amountCents: 8765,
      documentType: undefined,
    },
    {
      ...template,
      id: "d2000000-0000-4000-8000-000000000002",
      date: `${fleet.demoMonth}-15`,
      kind: "expense",
      category: "other",
      concept: "Legado facturación gasto",
      amountCents: 4321,
      distanceKm: 0,
      documentType: null,
    },
  ];
  await page.evaluate((entries) => {
    const saved = JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!);
    saved.entries.push(...entries);
    localStorage.setItem("truckcontrol.demo.v1", JSON.stringify(saved));
  }, legacy);
  for (const entry of legacy) {
    await goto(
      page,
      `${entry.kind === "income" ? "/income" : "/expenses"}?search=Legado%20facturaci%C3%B3n&documentType=unclassified`,
    );
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Sin clasificar");
    await page
      .getByRole("button", { name: `Editar ${entry.concept}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByLabel("Tipo de documento", { exact: true }),
    ).toHaveValue("");
    await dialog
      .getByLabel("Concepto", { exact: true })
      .fill(`${entry.concept} revisado`);
    await dialog
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await demoReload(page);
    const saved = (await snapshot(page)).entries.find(
      (row) => row.id === entry.id,
    )!;
    expect(saved.documentType).toBe(entry.documentType);
    expect(saved.amountCents).toBe(entry.amountCents);
    if (entry.documentType === undefined)
      expect(Object.hasOwn(saved, "documentType")).toBe(false);
  }
  await goto(page, "/income?search=Legado%20facturaci%C3%B3n");
  await page
    .getByRole("button", {
      name: "Editar Legado facturación ingreso revisado",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Tipo de documento", { exact: true })
    .selectOption("ticket");
  await dialog
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await demoReload(page);
  const classified = (await snapshot(page)).entries.find(
    (entry) => entry.id === legacy[0].id,
  )!;
  expect(classified.documentType).toBe("ticket");
  expect(classified.amountCents).toBe(8765);
});

test("adjunta varios originales al movimiento guardado sin modificar su importe ni otras fichas", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await goto(page, "/income");
  const fleet = await snapshot(page);
  const base = fleet.entries.find((entry) => entry.kind === "income")!;
  const entries: FinanceEntry[] = [
    {
      ...base,
      id: "d3000000-0000-4000-8000-000000000001",
      date: `${fleet.demoMonth}-15`,
      concept: "Movimiento ficticio con varios adjuntos",
      amountCents: 12345,
      documentType: "ticket",
    },
    {
      ...base,
      id: "d3000000-0000-4000-8000-000000000002",
      date: `${fleet.demoMonth}-15`,
      concept: "Movimiento ficticio sin adjuntos",
      amountCents: 6789,
      documentType: "invoice",
    },
  ];
  await page.evaluate((rows) => {
    const saved = JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!);
    saved.entries.push(...rows);
    localStorage.setItem("truckcontrol.demo.v1", JSON.stringify(saved));
  }, entries);
  await goto(
    page,
    "/income?search=Movimiento%20ficticio%20con%20varios%20adjuntos",
  );
  const before = await snapshot(page);
  await page
    .getByRole("button", {
      name: `Ver o adjuntar documentos de ${entries[0].concept}`,
      exact: true,
    })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Documentos del movimiento",
    exact: true,
  });
  const pdf = Buffer.from(
    "%PDF-1.4\n% ORIGINAL FICTICIO DE FACTURACION\n%%EOF",
  );
  await dialog
    .getByLabel("Documento PDF o imagen", { exact: true })
    .setInputFiles([
      { name: "ticket-ficticio.pdf", mimeType: "application/pdf", buffer: pdf },
      {
        name: "albaran-ficticio.pdf",
        mimeType: "application/pdf",
        buffer: pdf,
      },
    ]);
  const first = dialog.getByRole("group", {
    name: "1. ticket-ficticio.pdf",
    exact: true,
  });
  const second = dialog.getByRole("group", {
    name: "2. albaran-ficticio.pdf",
    exact: true,
  });
  await expect(
    first.getByLabel("Tipo de documento", { exact: true }),
  ).toHaveValue("ticket");
  await first
    .getByLabel("Descripción del documento (opcional)", { exact: true })
    .fill("Ticket ficticio del servicio");
  await second
    .getByLabel("Tipo de documento", { exact: true })
    .selectOption("delivery_note");
  await second
    .getByLabel("Descripción del documento (opcional)", { exact: true })
    .fill("Albarán ficticio de entrega");
  await dialog
    .getByLabel("Confirmo que el archivo contiene únicamente datos ficticios.")
    .check();
  await dialog
    .getByRole("button", { name: "Guardar documento de prueba", exact: true })
    .click();
  const ticket = dialog
    .getByRole("article")
    .filter({ hasText: "ticket-ficticio.pdf" });
  await expect(ticket).toContainText("Ticket ficticio del servicio");
  await expect(dialog.getByRole("article")).toHaveCount(2);
  await expect(
    dialog.getByRole("article").filter({ hasText: "albaran-ficticio.pdf" }),
  ).toContainText("Albarán ficticio de entrega");
  expect(await snapshot(page)).toEqual(before);
  const links = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("truckcontrol-demo-documents-v1", 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      return await new Promise<
        {
          name: string;
          truckId: string;
          driverId: string;
          tracking: {
            category: string;
            label: string;
            finance_entry_id: string;
          };
        }[]
      >((resolve, reject) => {
        const request = database
          .transaction("files", "readonly")
          .objectStore("files")
          .getAll();
        request.onsuccess = () =>
          resolve(
            request.result.map((row) => ({
              name: row.name,
              truckId: row.truckId,
              driverId: row.driverId,
              tracking: row.tracking,
            })),
          );
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
  expect(links).toHaveLength(2);
  expect(
    links.every(
      (document) =>
        document.truckId === "" &&
        document.driverId === "" &&
        document.tracking.finance_entry_id === entries[0].id,
    ),
  ).toBe(true);
  expect(links.map((document) => document.tracking.category).sort()).toEqual([
    "delivery_note",
    "ticket",
  ]);
  const downloadPromise = page.waitForEvent("download");
  await ticket.getByRole("button", { name: "Descargar", exact: true }).click();
  expect(await downloadedBytes(await downloadPromise)).toEqual(pdf);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  await goto(page, "/income?search=Movimiento%20ficticio%20sin%20adjuntos");
  await page
    .getByRole("button", {
      name: `Ver o adjuntar documentos de ${entries[1].concept}`,
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Documentos del movimiento",
    exact: true,
  });
  await expect(dialog.getByRole("article")).toHaveCount(0);
  await expect(dialog).toContainText("Sin documentos de prueba");
  await dialog
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  await goto(
    page,
    "/income?search=Movimiento%20ficticio%20con%20varios%20adjuntos",
  );
  await page
    .getByRole("button", {
      name: `Ver o adjuntar documentos de ${entries[0].concept}`,
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Documentos del movimiento",
    exact: true,
  });
  await expect(dialog.getByRole("article")).toHaveCount(2);
  expect(await snapshot(page)).toEqual(before);
});
