import { expect, test } from "@playwright/test";
import {
  factor,
  goodCode,
  login,
  nativeFixture,
  noSecretStorage,
  openSecurity,
} from "./fixture";
test("enrollment defaults off and ordinary native access stays available", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context);
  await login(page);
  await openSecurity(page);
  await expect(page.locator(".mfa-settings")).toContainText(
    "La activación de nuevos autenticadores todavía no está disponible",
  );
  await expect(
    page.getByRole("button", { name: "Añadir autenticador", exact: true }),
  ).toHaveCount(0);
  expect(
    f.calls.some(
      (c) =>
        c.path.endsWith("tc_mfa_protection_status") ||
        c.path === "/auth/v1/factors",
    ),
  ).toBe(false);
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
test("existing TOTP is challenged when rollout is off and capability is missing", async ({
  page,
  context,
}) => {
  const f = await nativeFixture(context, { factors: [factor()] });
  f.controls.capabilityStatus = 503;
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Confirma tu autenticador" }),
  ).toBeVisible();
  expect(f.privateCalls()).toEqual([]);
  await page.getByLabel("Código de 6 dígitos").fill(goodCode);
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu centro de administración" }),
  ).toBeVisible();
  expect(f.calls.some((c) => c.path.endsWith("tc_mfa_protection_status"))).toBe(
    false,
  );
  await noSecretStorage(page);
  expect(f.blocked).toEqual([]);
});
