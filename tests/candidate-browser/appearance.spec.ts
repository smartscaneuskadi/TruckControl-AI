import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("el portal, los planes y el acceso cerrado respetan ambos temas", async ({
  page,
}) => {
  for (const [name, value] of [
    ["Fleet Light", "light"],
    ["Fleet Cockpit", "cockpit"],
  ]) {
    await page.goto("/");
    await page.getByRole("button", { name: "Cambiar apariencia" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Apariencia de TruckControl",
    });
    await dialog.getByRole("radio", { name, exact: true }).check();
    await dialog.getByRole("button", { name: "Aplicar apariencia" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", value);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    await page.locator("#planes").scrollIntoViewIfNeeded();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await expect(page.locator(".plan-total").nth(0)).toContainText("363,00");
    await expect(page.locator(".plan-total").nth(1)).toContainText("847,00");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Acceso comercial en preparación" }),
    ).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Volver a la entrada", exact: true })
      .click();
  }
});
