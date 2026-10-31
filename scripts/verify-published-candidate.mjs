/** Read-only QA of the published, fictitious-data candidate. No account or provider access. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";
const config = JSON.parse(
  readFileSync("docs/deployment/candidate-hosting.json", "utf8"),
);
if (
  config.audience !== "public" ||
  !config.current_live_url ||
  !config.published_commit
) {
  console.log(
    "Published candidate browser QA: pending publication; not counted as passed.",
  );
  process.exit(0);
}
const expected = new URL(config.expected_url);
const target = new URL(config.current_live_url);
if (
  target.origin !== expected.origin ||
  target.protocol !== "https:" ||
  target.username ||
  target.password ||
  !/^[0-9a-f]{40}$/.test(config.published_commit)
)
  throw new Error("Unrecognized candidate destination or source");
const dir =
  process.env.TRUCKCONTROL_PUBLIC_TEST_ARTIFACTS || "public-test-results";
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const [name, settings] of [
    [
      "windows",
      { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    ],
    ["android", devices["Pixel 7"]],
  ]) {
    const context = await browser.newContext({
      ...settings,
      locale: "es-ES",
      serviceWorkers: "allow",
    });
    try {
      const page = await context.newPage();
      await page.goto(target.origin, { waitUntil: "networkidle" });
      await page
        .getByRole("region", { name: "Estado de la versión candidata" })
        .waitFor();
      const metadata = await page.evaluate(async () =>
        (await fetch("release.json", { cache: "no-store" })).json(),
      );
      if (
        metadata.sourceCommit !== config.published_commit ||
        metadata.sourceDirty !== false ||
        metadata.channel !== "candidate" ||
        metadata.companyConnectionBundled !== false ||
        metadata.registrationForcedClosed !== true
      )
        throw new Error("Published provenance or isolation mismatch");
      if (
        !(await page
          .getByRole("button", {
            name: "Probar Full gratis 30 días",
            exact: true,
          })
          .isDisabled())
      )
        throw new Error("Registration unexpectedly available");
      await page.screenshot({ path: `${dir}/${name}-published-portal.png` });
      await page
        .getByRole("heading", {
          name: "Empieza con todo. Elige tu plan después.",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      if (
        !(await page
          .getByRole("button", { name: "Elegir Inicial", exact: true })
          .isDisabled())
      )
        throw new Error("Plan registration unexpectedly available");
      await page.screenshot({ path: `${dir}/${name}-published-plans.png` });
      await page
        .getByRole("button", { name: "Explorar la demo", exact: true })
        .click();
      await page
        .getByText("Candidata · datos ficticios", { exact: true })
        .waitFor();
      if (await page.evaluate(() => document.body.scrollWidth > innerWidth))
        throw new Error("Layout exceeds viewport");
      await page.screenshot({ path: `${dir}/${name}-published.png` });
      results.push({
        profile: name,
        sourceCommit: metadata.sourceCommit,
        passed: true,
      });
      console.log(
        `Published candidate ${name}: HTTPS, source, closed registration and demo passed`,
      );
    } finally {
      await context.close();
    }
  }
  writeFileSync(
    `${dir}/verification.json`,
    JSON.stringify(
      { url: target.origin, results, physicalDevices: false },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
