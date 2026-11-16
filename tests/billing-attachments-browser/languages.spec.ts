import AxeBuilder from "@axe-core/playwright";
import {
  demoNavigate,
  demoReload,
  demoSnapshot,
  expect,
  selectedTheme,
  test,
} from "./fixture";
import { originalPdf } from "./documents-fixture";

const translations = [
  {
    language: "ro",
    billing: "Facturare",
    income: "Venituri",
    expenses: "Cheltuieli",
    newIncome: "Venit nou",
    type: "Tip de document",
    invoice: "Factură",
    ticket: "Bon fiscal",
    delivery: "Aviz de însoțire",
    description: "Descrierea documentului (opțional)",
    technical: "Fișă tehnică",
    identity: "Identitate",
    licence: "Permis de conducere",
    file: "Document PDF sau imagine",
    documents: "Documentele flotei tale",
    cancel: "Anulează",
    explore: "Explorează demonstrația",
    selected: "Fișiere selectate",
  },
  {
    language: "en",
    billing: "Billing",
    income: "Income",
    expenses: "Expenses",
    newIncome: "New income",
    type: "Document type",
    invoice: "Invoice",
    ticket: "Receipt",
    delivery: "Delivery note",
    description: "Document description (optional)",
    technical: "Technical data sheet",
    identity: "Identity",
    licence: "Driving licence",
    file: "PDF document or image",
    documents: "Your fleet documents",
    cancel: "Cancel",
    explore: "Explore the demo",
    selected: "Selected files",
  },
  {
    language: "fr",
    billing: "Facturation",
    income: "Recettes",
    expenses: "Dépenses",
    newIncome: "Nouvelle recette",
    type: "Type de document",
    invoice: "Facture",
    ticket: "Ticket",
    delivery: "Bon de livraison",
    description: "Description du document (facultative)",
    technical: "Fiche technique",
    identity: "Identité",
    licence: "Permis de conduire",
    file: "Document PDF ou image",
    documents: "Documents de votre flotte",
    cancel: "Annuler",
    explore: "Explorer la démo",
    selected: "Fichiers sélectionnés",
  },
] as const;

for (const tr of translations)
  test(`facturación y adjuntos se traducen y conservan la preferencia ${tr.language}`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await demoNavigate(page, "/billing");
    // Seed synthetic ledger records to exercise all rendered classifications;
    // the separate billing flow already creates them through the actual editor.
    const initial = await demoSnapshot(page);
    const template = initial.entries.find((entry) => entry.kind === "income")!;
    await page.evaluate(
      (records) => {
        const saved = JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!);
        saved.entries.push(...records);
        localStorage.setItem("truckcontrol.demo.v1", JSON.stringify(saved));
      },
      (["invoice", "ticket", "delivery_note"] as const).map(
        (documentType, i) => ({
          ...template,
          id: `d5000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
          date: `${initial.demoMonth}-15`,
          concept: `Clasificación contable ficticia ${documentType}`,
          documentType,
        }),
      ),
    );
    await demoReload(page);
    const before = await demoSnapshot(page);
    await page
      .getByRole("combobox", { name: "Idioma", exact: true })
      .selectOption(tr.language);
    await expect(page.locator("html")).toHaveAttribute("lang", tr.language);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      selectedTheme(info),
    );
    await expect(
      page.getByRole("heading", { name: tr.billing, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".billing-sections")).toContainText(tr.income);
    await expect(page.locator(".billing-sections")).toContainText(tr.expenses);
    await page.evaluate(() => {
      location.hash = "/income?search=Clasificaci%C3%B3n%20contable%20ficticia";
    });
    await expect(page.locator("tbody tr")).toHaveCount(3);
    for (const label of [tr.invoice, tr.ticket, tr.delivery])
      await expect(
        page.getByRole("cell", { name: label, exact: true }),
      ).toHaveCount(1);
    await page.getByRole("button", { name: tr.newIncome, exact: true }).click();
    const editor = page.getByRole("dialog");
    const type = editor.getByLabel(tr.type, { exact: true });
    await expect(type.locator("option")).toHaveText([
      tr.invoice,
      tr.ticket,
      tr.delivery,
    ]);
    await type.selectOption("delivery_note");
    await editor.getByRole("button", { name: tr.cancel, exact: true }).click();
    await page.evaluate(() => {
      location.hash = "/documents";
    });
    await expect(
      page.getByRole("heading", { name: tr.documents, exact: true }),
    ).toBeVisible();
    await page.getByLabel(tr.file, { exact: true }).setInputFiles({
      name: "muestra.pdf",
      mimeType: "application/pdf",
      buffer: originalPdf("traducción ficticia"),
    });
    const queue = page.getByRole("group", { name: tr.selected, exact: true });
    const row = queue.getByRole("group", {
      name: "1. muestra.pdf",
      exact: true,
    });
    await row
      .getByLabel(tr.description, { exact: true })
      .fill("Descripción ficticia del usuario");
    const category = row.getByLabel(tr.type, { exact: true });
    await expect(category.locator('option[value="technical_card"]')).toHaveText(
      tr.technical,
    );
    await expect(category.locator('option[value="identity"]')).toHaveText(
      tr.identity,
    );
    await expect(
      category.locator('option[value="driving_license"]'),
    ).toHaveText(tr.licence);
    await expect(category.locator('option[value="delivery_note"]')).toHaveText(
      tr.delivery,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await demoSnapshot(page)).toEqual(before);
    await page.reload();
    await page.getByRole("button", { name: tr.explore, exact: true }).click();
    await page.evaluate(() => {
      location.hash = "/billing";
    });
    await expect(
      page.getByRole("heading", { name: tr.billing, exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", tr.language);
    expect(await demoSnapshot(page)).toEqual(before);
  });
