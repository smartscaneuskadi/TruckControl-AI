import { expect, test as base } from "@playwright/test";
import type { Download, Page, TestInfo } from "@playwright/test";
import type { FleetSnapshot } from "../../src/domain/models";
import { actor, nativeFixture, other } from "../mfa-browser/fixture";

export type NativeAuth = Awaited<ReturnType<typeof nativeFixture>>;

export function selectedTheme(info: TestInfo): "light" | "cockpit" {
  return info.project.metadata.theme === "light" ? "light" : "cockpit";
}

/** Real app/SDK, synthetic private HTTP. No provider or managed-service claim. */
export const test = base.extend<{ nativeAuth: NativeAuth }>({
  nativeAuth: [
    async ({ context, baseURL }, use) => {
      const auth = await nativeFixture(context, { company: true });
      const origin = new URL(baseURL!).origin;
      // The retained MFA fixture owns Auth/API denial behavior. Only the local
      // preview origin is extended; unknown HTTP and every WebSocket stay denied.
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.fallback(),
      );
      await use(auth);
      expect(auth.blocked, "No unhandled external HTTP or WebSocket").toEqual(
        [],
      );
    },
    { auto: true },
  ],
  page: async ({ page, nativeAuth }, use, info) => {
    void nativeAuth;
    await page.addInitScript(
      ({ theme, actors }) => {
        for (const id of ["demo", ...actors])
          localStorage.setItem(
            `truckcontrol-appearance-v1:${id}`,
            JSON.stringify({
              preference: { theme, motion: "off" },
              pending: false,
            }),
          );
        if (!localStorage.getItem("truckcontrol.ui.language"))
          localStorage.setItem("truckcontrol.ui.language", "es");
      },
      { theme: selectedTheme(info), actors: [actor, other] },
    );
    await use(page);
  },
});

export { expect };

export async function demoNavigate(page: Page, path: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await page.evaluate((next) => {
    location.hash = next;
  }, path);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`#${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  );
}

export async function demoReload(page: Page) {
  const hash = new URL(page.url()).hash.slice(1) || "/dashboard";
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar la demo", exact: true })
    .click();
  await page.evaluate((next) => {
    location.hash = next;
  }, hash);
  await expect(page.locator("main h1")).toBeVisible();
}

export async function demoSnapshot(page: Page): Promise<FleetSnapshot> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("truckcontrol.demo.v1")!),
  );
}

export async function downloadedBytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw Error("Missing authenticated document download");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
