import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

test("biblioteca de prueba: valida, conserva, vincula y descarga sin enviar archivos", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() !== "GET" &&
      new URL(r.url()).origin !== "http://127.0.0.1:4173"
    )
      external.push(r.url());
  });
  await page.goto("/#/documents");
  const pdf = Buffer.from("%PDF-1.4\n% DOCUMENTO FICTICIO TRUCKCONTROL\n%%EOF");
  await page
    .getByLabel("Documento PDF o imagen", { exact: true })
    .setInputFiles({
      name: "permiso-ficticio.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
  await page
    .getByLabel("Camión de demostración", { exact: true })
    .selectOption({ index: 1 });
  const plate = await page
    .getByLabel("Camión de demostración", { exact: true })
    .locator("option:checked")
    .textContent();
  await page
    .getByLabel("Confirmo que el archivo contiene únicamente datos ficticios.")
    .check();
  await page
    .getByRole("button", { name: "Guardar documento de prueba", exact: true })
    .click();
  const card = page
    .getByRole("article")
    .filter({ hasText: "permiso-ficticio.pdf" });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(plate!);
  await page.reload();
  await expect(card).toHaveCount(1);
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Descargar", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("permiso-ficticio.pdf");
  expect(await readFile((await file.path())!)).toEqual(pdf);
  await page
    .getByLabel("Documento PDF o imagen", { exact: true })
    .setInputFiles({
      name: "falso.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("<html>Datos ficticios</html>"),
    });
  await page
    .getByLabel("Confirmo que el archivo contiene únicamente datos ficticios.")
    .check();
  await page
    .getByRole("button", { name: "Guardar documento de prueba", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("válida");
  await expect(card).toHaveCount(1);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Vaciar biblioteca de prueba", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(card).toHaveCount(1);
  await page
    .getByRole("button", { name: "Vaciar biblioteca de prueba", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar vaciado", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Sin documentos de prueba", { exact: true }),
  ).toBeVisible();
  expect(external).toEqual([]);
});
