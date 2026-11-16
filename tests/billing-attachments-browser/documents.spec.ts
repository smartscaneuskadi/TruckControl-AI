import type { BrowserContext, Locator, Page, TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  actor,
  broadcast,
  factor,
  goodCode,
  login,
  other,
} from "../mfa-browser/fixture";
import { downloadedBytes, expect, selectedTheme, test } from "./fixture";
import type { NativeAuth } from "./fixture";
import {
  documentsFixture,
  driverA,
  expenseA,
  originalPdf,
  truckA,
  truckB,
} from "./documents-fixture";

async function company(
  page: Page,
  context: BrowserContext,
  auth: NativeAuth,
  info: TestInfo,
) {
  const data = await documentsFixture(context, auth);
  await login(page, { theme: selectedTheme(info) });
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    selectedTheme(info),
  );
  return data;
}
async function path(page: Page, next: string) {
  await page.evaluate((value) => {
    location.hash = value;
  }, next);
}
async function openTruck(page: Page, plate = "DEMO-1001") {
  await path(page, "/trucks");
  await page
    .getByRole("button", { name: `Ver ficha de ${plate}`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: `Ficha de ${plate}`, exact: true }),
  ).toBeVisible();
  return page.getByRole("region", {
    name: "Documentación del camión",
    exact: true,
  });
}
function chosen(panel: Locator, index: number, name: string) {
  return panel.getByRole("group", { name: `${index}. ${name}`, exact: true });
}
async function pick(panel: Locator, files: { name: string; buffer: Buffer }[]) {
  await panel
    .getByLabel("Documento PDF o imagen", { exact: true })
    .setInputFiles(
      files.map((file) => ({ ...file, mimeType: "application/pdf" })),
    );
  await expect(panel.locator(".document-upload-item")).toHaveCount(
    files.length,
  );
}
const registerCalls = (data: Awaited<ReturnType<typeof documentsFixture>>) =>
  data.observed.filter((call) =>
    call.path.endsWith("/tc_register_document_v2"),
  );
const storageWrites = (data: Awaited<ReturnType<typeof documentsFixture>>) =>
  data.observed.filter(
    (call) => call.path.startsWith("/storage/") && call.method === "POST",
  );

test("camión: originales múltiples con nombre repetido, tipos y descripciones independientes", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  const before = structuredClone(data.entries);
  const panel = await openTruck(page);
  const first = originalPdf("ficha técnica primera"),
    second = originalPdf("anexo segundo");
  await pick(panel, [
    { name: "original.pdf", buffer: first },
    { name: "original.pdf", buffer: second },
  ]);
  await expect(
    chosen(panel, 1, "original.pdf").getByLabel("Tipo de documento", {
      exact: true,
    }),
  ).toHaveValue("technical_card");
  await chosen(panel, 1, "original.pdf")
    .getByLabel("Descripción del documento (opcional)", { exact: true })
    .fill("Ficha técnica del camión A");
  await chosen(panel, 2, "original.pdf")
    .getByLabel("Tipo de documento", { exact: true })
    .selectOption("other");
  await chosen(panel, 2, "original.pdf")
    .getByLabel("Descripción del documento (opcional)", { exact: true })
    .fill("Anexo libre <sin HTML>");
  await panel
    .getByRole("button", { name: "Guardar documentos", exact: true })
    .click();
  await expect(panel.locator("article.document-card")).toHaveCount(2);
  expect(new Set(data.documents.map((doc) => doc.id)).size).toBe(2);
  expect(new Set(data.documents.map((doc) => doc.object_path)).size).toBe(2);
  expect(data.documents.map((doc) => doc.name)).toEqual([
    "original.pdf",
    "original.pdf",
  ]);
  expect(
    data.documents.every(
      (doc) => doc.truck_id === truckA && doc.driver_id === null,
    ),
  ).toBe(true);
  expect(data.documents.map((doc) => doc.tracking?.category)).toEqual([
    "technical_card",
    "other",
  ]);
  expect(data.documents.map((doc) => doc.tracking?.label)).toEqual([
    "Ficha técnica del camión A",
    "Anexo libre <sin HTML>",
  ]);
  expect(data.documents.every((doc) => !doc.tracking?.finance_entry_id)).toBe(
    true,
  );
  expect(storageWrites(data).every((call) => call.upsert === "false")).toBe(
    true,
  );
  for (const [label, bytes] of [
    ["Ficha técnica del camión A", first],
    ["Anexo libre <sin HTML>", second],
  ] as const) {
    const card = panel
      .locator("article.document-card")
      .filter({ hasText: label });
    const download = page.waitForEvent("download");
    await card.getByRole("button", { name: "Descargar", exact: true }).click();
    expect(await downloadedBytes(await download)).toEqual(bytes);
  }
  expect(data.entries).toEqual(before);
  expect(
    await page
      .locator(".document-description")
      .filter({ hasText: "Anexo libre <sin HTML>" })
      .innerHTML(),
  ).toContain("&lt;sin HTML&gt;");
  await panel
    .getByRole("button", { name: "Retirar guardados de la cola", exact: true })
    .click();
  await expect(panel.locator(".document-upload-item")).toHaveCount(0);
  await expect(panel.locator("article.document-card")).toHaveCount(2);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
  ).toBe(true);
});

test("conductor: identidad, permiso y otro documento no se mezclan con otro expediente", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  await path(page, "/drivers");
  const card = page
    .locator("article.driver-card")
    .filter({ hasText: "Conductor ficticio A" });
  await card
    .getByRole("button", { name: "Documentos del conductor", exact: true })
    .click();
  const detail = page.getByRole("dialog", {
    name: "Ficha de Conductor ficticio A",
    exact: true,
  });
  const panel = detail.getByRole("region", {
    name: "Documentación del conductor",
    exact: true,
  });
  const files = ["identidad.pdf", "permiso.pdf", "otro.pdf"].map((name) => ({
    name,
    buffer: originalPdf(name),
  }));
  await pick(panel, files);
  const categories = ["identity", "driving_license", "other"];
  for (const [index, file] of files.entries()) {
    const row = chosen(panel, index + 1, file.name);
    await row
      .getByLabel("Tipo de documento", { exact: true })
      .selectOption(categories[index]);
    await row
      .getByLabel("Descripción del documento (opcional)", { exact: true })
      .fill(`Expediente independiente ${index + 1}`);
  }
  await panel
    .getByRole("button", { name: "Guardar documentos", exact: true })
    .click();
  await expect(panel.locator("article.document-card")).toHaveCount(3);
  expect(
    data.documents.every(
      (doc) => doc.driver_id === driverA && doc.truck_id === null,
    ),
  ).toBe(true);
  expect(data.documents.map((doc) => doc.tracking?.category)).toEqual(
    categories,
  );
  for (const doc of data.documents)
    expect(data.originals.get(doc.object_path)).toEqual(
      files.find((file) => file.name === doc.name)!.buffer,
    );
  await detail
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  await page
    .locator("article.driver-card")
    .filter({ hasText: "Conductor ficticio B" })
    .getByRole("button", { name: "Documentos del conductor", exact: true })
    .click();
  const otherDetail = page.getByRole("dialog", {
    name: "Ficha de Conductor ficticio B",
    exact: true,
  });
  await expect(otherDetail.locator("article.document-card")).toHaveCount(0);
  await otherDetail
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  const truck = await openTruck(page);
  await expect(truck.locator("article.document-card")).toHaveCount(0);
});

test("reintenta únicamente archivos rechazados y conserva los originales ya guardados", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  const panel = await openTruck(page);
  data.controls.failUploadAt = 2;
  await pick(panel, [
    { name: "guardado.pdf", buffer: originalPdf("uno") },
    { name: "rechazado.pdf", buffer: originalPdf("dos") },
  ]);
  await panel
    .getByRole("button", { name: "Guardar documentos", exact: true })
    .click();
  await expect(chosen(panel, 1, "guardado.pdf")).toContainText(
    "Original guardado",
  );
  await expect(chosen(panel, 2, "rechazado.pdf")).toContainText("No guardado");
  expect(data.documents).toHaveLength(1);
  const kept = structuredClone(data.documents[0]);
  const keptBytes = data.originals.get(kept.object_path);
  await panel
    .getByRole("button", { name: "Reintentar archivos fallidos", exact: true })
    .click();
  await expect(panel.locator("article.document-card")).toHaveCount(2);
  expect(storageWrites(data)).toHaveLength(3);
  expect(registerCalls(data)).toHaveLength(2);
  expect(data.documents.find((doc) => doc.id === kept.id)).toEqual(kept);
  expect(data.originals.get(kept.object_path)).toEqual(keptBytes);
});

test("un resultado incierto bloquea el reintento sin eliminar ni sobrescribir el original", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  data.controls.uncertainUploadAt = 1;
  const panel = await openTruck(page);
  const original = originalPdf("acuse perdido");
  await pick(panel, [{ name: "incierto.pdf", buffer: original }]);
  await panel
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  await expect(chosen(panel, 1, "incierto.pdf")).toContainText(
    "Sin confirmar · no repetir",
  );
  await expect(
    panel.getByRole("button", {
      name: "Reintentar archivos fallidos",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Guardar documento", exact: true }),
  ).toBeDisabled();
  await expect(
    chosen(panel, 1, "incierto.pdf").getByLabel("Tipo de documento", {
      exact: true,
    }),
  ).toBeDisabled();
  expect(storageWrites(data)).toHaveLength(1);
  expect(registerCalls(data)).toHaveLength(0);
  expect([...data.originals.values()]).toEqual([original]);
  expect(data.observed.some((call) => call.method === "DELETE")).toBe(false);
});

test("cambiar de camión durante la subida no registra el archivo en la ficha nueva", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  data.controls.holdUpload = true;
  const panel = await openTruck(page);
  await pick(panel, [
    { name: "anterior.pdf", buffer: originalPdf("camión anterior") },
  ]);
  await panel
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  await expect.poll(() => data.controls.uploadPending).toBe(true);
  try {
    await page
      .getByRole("dialog", { name: "Ficha de DEMO-1001", exact: true })
      .getByRole("button", { name: "Cerrar ventana", exact: true })
      .click();
    const next = await openTruck(page, "DEMO-2002");
    await expect(next.locator(".document-upload-item")).toHaveCount(0);
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/storage/v1/object/") &&
        r.request().method() === "POST",
    );
    data.controls.holdUpload = false;
    data.controls.releaseUpload();
    await response;
    await pick(next, [
      { name: "nuevo.pdf", buffer: originalPdf("camión nuevo") },
    ]);
    await next
      .getByRole("button", { name: "Guardar documento", exact: true })
      .click();
    await expect(next.locator("article.document-card")).toHaveCount(1);
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0].truck_id).toBe(truckB);
    expect(data.documents[0].name).toBe("nuevo.pdf");
    expect(data.originals.size).toBe(2);
    expect(registerCalls(data)).toHaveLength(1);
  } finally {
    data.controls.releaseUpload();
  }
});

test("cambiar a otra cuenta de la misma empresa no continúa la subida ni reutiliza su token", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  data.controls.holdUpload = true;
  const panel = await openTruck(page);
  await pick(panel, [
    { name: "cuenta-anterior.pdf", buffer: originalPdf("actor anterior") },
  ]);
  await panel
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  await expect.poll(() => data.controls.uploadPending).toBe(true);
  try {
    await broadcast(
      page,
      "SIGNED_IN",
      nativeAuth.session(other, "aal1", "attachments-new-actor-session"),
    );
    await expect(
      page.getByRole("dialog", { name: "Ficha de DEMO-1001", exact: true }),
    ).toHaveCount(0);
    await path(page, "/settings");
    await expect(
      page.getByRole("heading", { name: "Configuración", exact: true }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/storage/v1/object/") &&
        r.request().method() === "POST",
    );
    data.controls.holdUpload = false;
    data.controls.releaseUpload();
    await response;
    const next = await openTruck(page);
    await pick(next, [
      { name: "cuenta-nueva.pdf", buffer: originalPdf("actor nuevo") },
    ]);
    await next
      .getByRole("button", { name: "Guardar documento", exact: true })
      .click();
    await expect(next.locator("article.document-card")).toHaveCount(1);
    expect(registerCalls(data)).toHaveLength(1);
    expect(registerCalls(data)[0].actor).toBe(other);
    expect(registerCalls(data)[0].sid).toBe("attachments-new-actor-session");
    expect(storageWrites(data).map((call) => call.actor)).toEqual([
      actor,
      other,
    ]);
    expect(registerCalls(data)[0].authorization).toBe(
      storageWrites(data)[1].authorization,
    );
    expect(data.documents[0].name).toBe("cuenta-nueva.pdf");
  } finally {
    data.controls.releaseUpload();
  }
});

test("una exigencia MFA durante la subida desmonta los adjuntos y no registra el resultado tardío", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  data.controls.holdUpload = true;
  const panel = await openTruck(page);
  await pick(panel, [
    { name: "antes-mfa.pdf", buffer: originalPdf("sesión limitada") },
  ]);
  await panel
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  await expect.poll(() => data.controls.uploadPending).toBe(true);
  try {
    nativeAuth.controls.factors.set(actor, [factor()]);
    await broadcast(page, "USER_UPDATED", nativeAuth.session(actor, "aal1"));
    await expect(
      page.getByRole("heading", {
        name: "Confirma tu autenticador",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".entity-documents")).toHaveCount(0);
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/storage/v1/object/") &&
        r.request().method() === "POST",
    );
    data.controls.holdUpload = false;
    data.controls.releaseUpload();
    await response;
    await expect(
      page.getByRole("heading", {
        name: "Confirma tu autenticador",
        exact: true,
      }),
    ).toBeVisible();
    expect(registerCalls(data)).toHaveLength(0);
    expect(data.documents).toHaveLength(0);
    expect(data.originals.size).toBe(1);
    await page
      .getByLabel("Código de 6 dígitos", { exact: true })
      .fill(goodCode);
    await page
      .getByRole("button", { name: "Confirmar código", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tu flota de camiones", exact: true }),
    ).toBeVisible();
    const next = await openTruck(page);
    await pick(next, [
      { name: "con-mfa.pdf", buffer: originalPdf("operación nueva AAL2") },
    ]);
    await next
      .getByRole("button", { name: "Guardar documento", exact: true })
      .click();
    await expect(next.locator("article.document-card")).toHaveCount(1);
    expect(registerCalls(data)).toHaveLength(1);
    expect(registerCalls(data)[0].authorization?.split(".")[1]).toBeTruthy();
    const claims = JSON.parse(
      Buffer.from(
        registerCalls(data)[0].authorization!.split(".")[1],
        "base64url",
      ).toString(),
    );
    expect(claims.aal).toBe("aal2");
    expect(data.documents[0].name).toBe("con-mfa.pdf");
  } finally {
    data.controls.releaseUpload();
  }
});

test("desactivar FULL durante una subida la detiene y reactivar conserva los datos", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  const fleetBefore = structuredClone([
    data.trucks,
    data.drivers,
    data.entries,
  ]);
  data.controls.holdUpload = true;
  const panel = await openTruck(page);
  await pick(panel, [
    { name: "antes-bloqueo.pdf", buffer: originalPdf("FULL pendiente") },
  ]);
  await panel
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  await expect.poll(() => data.controls.uploadPending).toBe(true);
  try {
    nativeAuth.controls.manualFullEnabled = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("heading", {
        name: "Pack Full de tu empresa",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".entity-documents")).toHaveCount(0);
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/storage/v1/object/") &&
        r.request().method() === "POST",
    );
    data.controls.holdUpload = false;
    data.controls.releaseUpload();
    await response;
    expect(data.documents).toHaveLength(0);
    nativeAuth.controls.manualFullEnabled = true;
    await page
      .getByRole("button", { name: "Comprobar acceso", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tu flota de camiones", exact: true }),
    ).toBeVisible();
    const next = await openTruck(page);
    await pick(next, [
      { name: "reactivado.pdf", buffer: originalPdf("FULL reactivado") },
    ]);
    await next
      .getByRole("button", { name: "Guardar documento", exact: true })
      .click();
    await expect(next.locator("article.document-card")).toHaveCount(1);
    expect(registerCalls(data)).toHaveLength(1);
    expect(data.documents[0].name).toBe("reactivado.pdf");
    expect(data.originals.size).toBe(2);
    expect([data.trucks, data.drivers, data.entries]).toEqual(fleetBefore);
    expect(data.observed.some((call) => call.method === "DELETE")).toBe(false);
  } finally {
    data.controls.releaseUpload();
  }
});

test("respuesta de otra empresa se rechaza y la edición CAS conserva los originales", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  const data = await company(page, context, nativeAuth, info);
  const panel = await openTruck(page);
  const original = originalPdf("metadata separada");
  await pick(panel, [{ name: "metadatos.pdf", buffer: original }]);
  await panel
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  const card = panel.locator("article.document-card");
  await expect(card).toHaveCount(1);
  const immutable = structuredClone(data.documents[0]);
  data.controls.conflictMetadata = true;
  await card
    .getByRole("button", { name: "Ficha y vencimiento", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Ficha documental · metadatos.pdf",
    exact: true,
  });
  await editor
    .getByLabel("Descripción del documento (opcional)", { exact: true })
    .fill("Edición rechazada");
  await editor
    .getByRole("button", { name: "Guardar ficha documental", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText("La ficha ha cambiado");
  expect(data.documents[0]).toEqual(immutable);
  expect(data.originals.get(immutable.object_path)).toEqual(original);
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  data.controls.foreignDocumentResponse = true;
  await panel
    .getByRole("button", { name: "Actualizar archivo", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "no corresponde a esta empresa",
  );
  await expect(panel.locator("article.document-card")).toHaveCount(0);
  expect(data.documents[0]).toEqual(immutable);
  expect(storageWrites(data)).toHaveLength(1);
  expect(registerCalls(data)).toHaveLength(1);
});

test("revocar solo Gastos invalida los documentos financieros, las lecturas tardías y una subida pendiente", async ({
  page,
  context,
  nativeAuth,
}, info) => {
  test.setTimeout(60_000);
  const data = await company(page, context, nativeAuth, info);
  const entriesBefore = structuredClone(data.entries);
  await path(page, "/expenses");
  await page
    .getByRole("button", {
      name: "Ver o adjuntar documentos de Gasto ficticio enlazado",
      exact: true,
    })
    .click();
  const finance = page.getByRole("dialog", {
    name: "Documentos del movimiento",
    exact: true,
  });
  const original = originalPdf("gasto autorizado inicialmente");
  await pick(finance, [{ name: "gasto-privado.pdf", buffer: original }]);
  await chosen(finance, 1, "gasto-privado.pdf")
    .getByLabel("Descripción del documento (opcional)", { exact: true })
    .fill("Descripción financiera privada");
  await finance
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  await expect(finance.locator("article.document-card")).toHaveCount(1);
  const preserved = structuredClone(data.documents[0]);
  expect(preserved.tracking?.finance_entry_id).toBe(expenseA);
  await finance
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  await path(page, "/documents");
  const library = page.getByRole("region", {
    name: "Documentos adjuntos",
    exact: true,
  });
  await expect(library.locator("article.document-card")).toContainText(
    "Descripción financiera privada",
  );

  // Capture a legitimate old response and an already-sent original while the
  // company remains active and Documents itself stays enabled throughout.
  data.controls.holdDocumentPages = true;
  await library
    .getByRole("button", { name: "Actualizar archivo", exact: true })
    .click();
  await expect.poll(() => data.controls.documentPagesHeld).toBe(1);
  data.controls.holdUpload = true;
  await pick(library, [
    {
      name: "pendiente-scope-anterior.pdf",
      buffer: originalPdf("scope antiguo"),
    },
  ]);
  await library
    .getByRole("button", { name: "Guardar documento", exact: true })
    .click();
  await expect.poll(() => data.controls.uploadPending).toBe(true);
  try {
    data.controls.blockedFinance = "expenses";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator('.sidebar a[href="#/expenses"]')).toHaveCount(0);
    await expect.poll(() => data.controls.documentPagesHeld).toBe(2);
    await expect(library.locator("article.document-card")).toHaveCount(0);
    await expect(library.locator(".document-upload-item")).toHaveCount(0);

    const oldPage = page.waitForResponse((response) =>
      response.url().endsWith("/tc_document_page_v2"),
    );
    data.controls.releaseDocumentPage();
    await (await oldPage).finished();
    await expect(library.locator("article.document-card")).toHaveCount(0);
    const oldUpload = page.waitForResponse(
      (response) =>
        response.url().includes("/storage/v1/object/") &&
        response.request().method() === "POST",
    );
    data.controls.holdUpload = false;
    data.controls.releaseUpload();
    await (await oldUpload).finished();
    data.controls.holdDocumentPages = false;
    data.controls.releaseAllDocumentPages();
    await expect(
      library.getByText("Cargando documentos…", { exact: true }),
    ).toHaveCount(0);
    await expect(library.locator("article.document-card")).toHaveCount(0);

    // A new nonfinancial document is still allowed. Its acknowledgment is an
    // explicit completion barrier before inspecting the old upload's counters.
    await pick(library, [
      {
        name: "biblioteca-permitida.pdf",
        buffer: originalPdf("permiso documental vigente"),
      },
    ]);
    await library
      .getByRole("button", { name: "Guardar documento", exact: true })
      .click();
    await expect(library.locator("article.document-card")).toHaveCount(1);
    await expect(library.locator("article.document-card")).toContainText(
      "biblioteca-permitida.pdf",
    );
    expect(registerCalls(data)).toHaveLength(2);
    expect(data.documents.map((document) => document.name)).toEqual([
      "gasto-privado.pdf",
      "biblioteca-permitida.pdf",
    ]);
    expect(data.originals.size).toBe(3);
    expect(
      data.documents.find((document) => document.id === preserved.id),
    ).toEqual(preserved);
    expect(data.originals.get(preserved.object_path)).toEqual(original);

    data.controls.blockedFinance = null;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator('.sidebar a[href="#/expenses"]')).toHaveCount(1);
    await expect(library.locator("article.document-card")).toHaveCount(2);
    const restored = library
      .locator("article.document-card")
      .filter({ hasText: "gasto-privado.pdf" });
    await expect(restored).toContainText("Descripción financiera privada");
    const downloaded = page.waitForEvent("download");
    await restored
      .getByRole("button", { name: "Descargar", exact: true })
      .click();
    expect(await downloadedBytes(await downloaded)).toEqual(original);
    expect(data.entries).toEqual(entriesBefore);
    expect(data.observed.some((call) => call.method === "DELETE")).toBe(false);
  } finally {
    data.controls.holdDocumentPages = false;
    data.controls.releaseAllDocumentPages();
    data.controls.releaseUpload();
  }
});
