import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function appearance(page: Page, theme: string, motion = "off") {
  await page
    .getByRole("button", { name: "Cambiar apariencia", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Apariencia de TruckControl",
  });
  await dialog.getByRole("radio", { name: theme, exact: true }).check();
  await dialog.getByLabel("Animaciones", { exact: true }).selectOption(motion);
  await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
  await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
}
test("la vista previa no aplica cambios; el tema conserva el formulario y los datos", async ({
  page,
}) => {
  await page.goto("/#/dashboard");
  const before = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await page
    .getByRole("button", { name: "Registrar ingreso", exact: true })
    .click();
  const editor = page
    .getByRole("dialog")
    .filter({ has: page.getByLabel("Concepto", { exact: true }) });
  await editor
    .getByLabel("Concepto", { exact: true })
    .fill("Borrador conservado al cambiar tema");
  await editor.getByRole("button", { name: "Cambiar apariencia" }).click();
  let dialog = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
  await dialog.getByRole("radio", { name: "Fleet Light", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cockpit");
  await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
  await expect(editor.getByLabel("Concepto", { exact: true })).toHaveValue(
    "Borrador conservado al cambiar tema",
  );
  await editor.getByRole("button", { name: "Cambiar apariencia" }).click();
  dialog = page.getByRole("dialog", { name: "Apariencia de TruckControl" });
  await dialog.getByRole("radio", { name: "Fleet Light", exact: true }).check();
  await dialog.getByLabel("Animaciones", { exact: true }).selectOption("off");
  await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
  await expect(editor.getByLabel("Concepto", { exact: true })).toHaveValue(
    "Borrador conservado al cambiar tema",
  );
  await editor.getByRole("button", { name: "Cerrar ventana" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(before);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
});

test("sigue el dispositivo inmediatamente y respeta reducir movimiento", async ({
  page,
}) => {
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await page.goto("/#/settings");
  const settings = page.getByRole("region", {
    name: "Apariencia",
    exact: true,
  });
  await settings
    .getByRole("radio", { name: "Seguir configuración del dispositivo" })
    .check();
  await settings.getByRole("button", { name: "Aplicar apariencia" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cockpit");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.goto("/#/dashboard");
  expect(
    await page
      .locator(".income-bar")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});

for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
  test(`${theme}: todas las pantallas mantienen contraste y tamaño móvil`, async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await page.goto("/#/dashboard");
    await appearance(page, theme);
    for (const path of [
      "dashboard",
      "trucks",
      "drivers",
      "trailers",
      "clients",
      "trips",
      "income",
      "expenses",
      "profitability",
      "maintenance",
      "fuel",
      "deadlines",
      "alerts",
      "documents",
      "invoices",
      "reports",
      "team",
      "assistant",
      "settings",
    ]) {
      await page.evaluate((path) => {
        location.hash = `/${path}`;
      }, path);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
        path,
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations, path).toEqual([]);
      if (
        ["dashboard", "drivers", "invoices", "assistant", "settings"].includes(
          path,
        )
      ) {
        await page.locator(".page-footer").scrollIntoViewIfNeeded();
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
          `${path}: parte inferior`,
        ).toEqual([]);
        await page.evaluate(() => document.body.scrollTo(0, 0));
      }
      if (path === "dashboard" || path === "settings") {
        const screenshot = info.outputPath(
          `${theme.replace(" ", "-")}-${path}.png`,
        );
        await page.screenshot({ path: screenshot });
        await info.attach(`${theme} · ${path}`, {
          path: screenshot,
          contentType: "image/png",
        });
      }
    }
  });
}

test("los objetivos usan la contabilidad y el mapa no inventa posiciones ni envía datos", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (/openstreetmap|tile\./.test(request.url()))
      external.push(request.url());
  });
  await page.goto("/#/dashboard");
  await expect(
    page.getByText("Sin fuente GPS conectada", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".route-map-card iframe")).toHaveCount(0);
  expect(external).toEqual([]);
  await expect(page.locator(".goal-actual")).toContainText(
    "sin objetivo definido",
  );
  const financial = await page.evaluate(() =>
    localStorage.getItem("truckcontrol.demo.v1"),
  );
  await page
    .getByRole("button", { name: "Definir objetivo", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Mi objetivo de beneficio mensual",
  });
  await dialog.getByLabel("Objetivo de beneficio (€)").fill("150000");
  await dialog.getByRole("button", { name: "Guardar objetivo" }).click();
  const [actual, goal] = await page
    .locator(".goal-actual")
    .evaluate((e) => [
      e.childNodes[0].textContent,
      e.querySelector("small")!.textContent,
    ]);
  expect(actual).toContain("138.055");
  expect(goal).toContain("150.000");
  await expect(
    page.getByRole("progressbar", { name: "Progreso de mi objetivo mensual" }),
  ).toHaveAttribute("aria-valuenow", "92");
  expect(
    await page.evaluate(() => localStorage.getItem("truckcontrol.demo.v1")),
  ).toBe(financial);
  await page.getByRole("button", { name: "Cargar mapa interactivo" }).click();
  await expect(
    page.getByTitle("Mapa interactivo de referencia de España"),
  ).toHaveAttribute("src", /bbox=-9\.6%2C35\.7%2C4\.5%2C44\.3&layer=mapnik$/);
  await expect(page.locator(".map-disclaimer")).toContainText(
    "no representa seguimiento GPS",
  );
});

test("los dos temas y la fotografía están disponibles sin conexión", async ({
  page,
}) => {
  await page.goto("/#/dashboard");
  await appearance(page, "Fleet Light");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("main h1")).toBeVisible();
  expect(
    await page
      .locator(".fleet-welcome-photo")
      .evaluate(
        (img) =>
          img instanceof HTMLImageElement &&
          img.complete &&
          img.naturalWidth > 0,
      ),
  ).toBe(true);
  await appearance(page, "Fleet Cockpit");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cockpit");
  await expect(
    page.getByRole("heading", { name: "Mapa sin conexión" }),
  ).toBeVisible();
});

test("las pantallas estrechas de 320 px conservan filtros e indicadores en ambos temas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/#/dashboard");
  for (const theme of ["Fleet Light", "Fleet Cockpit"]) {
    await appearance(page, theme);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await expect(page.getByLabel("Periodo", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Filtrar camión", exact: true }),
    ).toBeVisible();
  }
});
