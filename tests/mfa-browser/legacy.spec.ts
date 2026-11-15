import { expect, test } from "@playwright/test";
import {
  factor,
  goodCode,
  login,
  nativeFixture,
  noSecretStorage,
} from "./fixture";
test("the second signInWithPassword form challenges TOTP before organization or fleet reads", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, {
    factors: [factor()],
    company: true,
  });
  await login(page, { legacy: true });
  await expect(
    page.getByRole("heading", { name: "Confirma tu autenticador" }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(f.privateCalls().every((c) => c.aal === "aal2")).toBe(true);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
