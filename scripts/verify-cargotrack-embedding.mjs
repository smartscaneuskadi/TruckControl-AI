/** Live unauthenticated CargoTrack form only. No credentials entered or submitted. */
import { chromium, devices } from "@playwright/test";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const hosting = JSON.parse(
  readFileSync("docs/deployment/candidate-hosting.json", "utf8"),
);
const target = new URL(
  process.env.TRUCKCONTROL_CARGOTRACK_PROBE_URL || "https://truckcontrolai.com",
);
const allowed = new Set([
  "https://truckcontrolai.com",
  "https://www.truckcontrolai.com",
  new URL(hosting.expected_url).origin,
  "http://127.0.0.1:4194",
]);
if (
  !allowed.has(target.origin) ||
  target.username ||
  target.password ||
  target.search ||
  target.hash ||
  target.pathname !== "/"
)
  throw Error("Unrecognized app destination");
const local = target.hostname === "127.0.0.1";
const source =
  process.env.TRUCKCONTROL_CARGOTRACK_SOURCE_COMMIT || hosting.published_commit;
if (!/^[0-9a-f]{40}$/.test(source))
  throw Error("Expected exact source is required");
const artifacts = resolve(
  process.env.TRUCKCONTROL_CARGOTRACK_LIVE_ARTIFACTS ||
    "cargotrack-live-results",
);
mkdirSync(artifacts, { recursive: true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const launch = {
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox"],
};

// Playwright disables Chrome's third-party storage partitioning for test isolation.
// Restore ONLY this browser-default protection, preserving every other switch.
// Do not disable cookie controls, TLS, same-origin checks or vendor restrictions.
const server = await chromium.launchServer(launch);
const override = server
  .process()
  .spawnargs.find(
    (arg) =>
      arg.startsWith("--disable-features=") &&
      arg.includes("ThirdPartyStoragePartitioning"),
  );
await server.close();
const privacy = override
  ? {
      ignoreDefaultArgs: [override],
      args: [
        "--no-sandbox",
        "--disable-features=" +
          override
            .split("=")[1]
            .split(",")
            .filter((feature) => feature !== "ThirdPartyStoragePartitioning")
            .join(","),
      ],
    }
  : {};
const results = [];
let failed = false;
for (const [device, settings] of [
  ["windows", { viewport: { width: 1440, height: 1000 } }],
  ["android", devices["Pixel 7"]],
]) {
  const profile = mkdtempSync(join(tmpdir(), "truckcontrol-provider-public-"));
  const context = await chromium.launchPersistentContext(profile, {
    ...launch,
    ...privacy,
    ...settings,
    locale: "es-ES",
  });
  const page = context.pages()[0] || (await context.newPage());
  const result = {
    device,
    physical: false,
    credentials_entered: false,
    login_submitted: false,
    native_storage_partitioning: true,
  };
  let documents = 0;
  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      request.url().startsWith("https://on7.cargotrack.ro/")
    )
      documents++;
  });
  try {
    await page.goto(target.origin, { waitUntil: "domcontentloaded" });
    const release = await page.evaluate(async () =>
      (await fetch("/release.json", { cache: "no-store" })).json(),
    );
    if (
      !local &&
      (release.sourceCommit !== source ||
        release.sourceDirty !== false ||
        release.channel !== "production")
    )
      throw Error("Published source mismatch");
    const demo = page.getByRole("button", {
      name: "Explorar la demo",
      exact: true,
    });
    try {
      await demo.waitFor({ state: "visible", timeout: 12000 });
    } catch {
      if (!local) throw Error("Public portal not ready");
    }
    if (await demo.isVisible()) await demo.click();
    async function openMenu() {
      const button = page.getByRole("button", {
        name: "Abrir menú",
        exact: true,
      });
      if (await button.isVisible()) await button.click();
    }
    await openMenu();
    await page.getByRole("link", { name: "CargoTrack", exact: true }).click();
    const pages = context.pages().length;
    await page
      .getByRole("button", { name: "Entrar en CargoTrack", exact: true })
      .click();
    const element = page.locator("iframe.cargotrack-frame");
    const frame = page.frameLocator("iframe.cargotrack-frame");
    await frame
      .locator("input[type=password]")
      .waitFor({ state: "visible", timeout: 30000 });
    if (
      (await element.getAttribute("src")) !== "https://on7.cargotrack.ro/signin"
    )
      throw Error("Unexpected provider destination");
    await element.evaluate((node) => {
      node.dataset.probeInstance = "same-frame";
    });
    const initialDocuments = documents;
    await page
      .getByRole("link", { name: "Volver al resumen", exact: true })
      .click();
    if (await element.isVisible())
      throw Error("Provider view remains visible outside its route");
    await openMenu();
    await page.getByRole("link", { name: "CargoTrack", exact: true }).click();
    await frame
      .locator("input[type=password]")
      .waitFor({ state: "visible", timeout: 10000 });
    if (
      (await element.getAttribute("data-probe-instance")) !== "same-frame" ||
      documents !== initialDocuments
    )
      throw Error("Provider document reloaded during navigation");
    if (
      context.pages().length !== pages ||
      new URL(page.url()).origin !== target.origin
    )
      throw Error("Unexpected external tab or navigation");
    if ((await element.getAttribute("referrerpolicy")) !== "no-referrer")
      throw Error("Missing referrer protection");
    await page.screenshot({ path: join(artifacts, device + ".png") });
    Object.assign(result, {
      passed: true,
      source_commit: release.sourceCommit,
      live_login_form_visible: true,
      same_document_retained: true,
      new_tabs: 0,
      authenticated_provider_session_verified: false,
    });
  } catch (error) {
    failed = true;
    Object.assign(result, {
      passed: false,
      error: String(error)
        .replace(/[A-Za-z0-9_-]{45,}/g, "[omitted]")
        .slice(0, 500),
    });
  } finally {
    await context.close();
  }
  results.push(result);
}
const receipt = {
  checked_at: new Date().toISOString(),
  origin: target.origin,
  expected_source_commit: source,
  authentication_scope:
    "public provider login and document lifetime, no account login",
  framework_partitioning_override_removed: Boolean(override),
  privacy_controls_weakened: false,
  results,
};
writeFileSync(
  join(artifacts, "verification.json"),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
if (failed) process.exitCode = 1;
