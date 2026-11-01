import { expect, test } from "@playwright/test";

test("las marcas identifican la flota con imágenes locales disponibles también sin red", async ({
  page,
}, info) => {
  await page.goto("/");
  const makers = page.getByRole("region", { name: "Una flota. Una visión." });
  await expect(makers).toBeVisible();
  for (const name of ["Scania", "Mercedes-Benz", "MAN"])
    await expect(makers.getByText(name, { exact: true })).toBeVisible();
  await expect(makers.locator("img")).toHaveCount(3);
  await expect
    .poll(() =>
      makers
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0 &&
              new URL(image.src).origin === location.origin,
          ),
        ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  const screenshot = info.outputPath("fleet-identity.png");
  await page.screenshot({ path: screenshot });
  await info.attach("Flota multimarca", {
    path: screenshot,
    contentType: "image/png",
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.context().setOffline(true);
  await page.reload();
  await expect(makers).toBeVisible();
  await expect
    .poll(() =>
      makers
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
});
