/** Public bundle + real browser SDK; ALL auth/company HTTP uses fictitious fixtures.
 * Does not log into CargoTrack, create native users or call paid providers.
 * Reuses the original regression assertions without committing duplicate tests.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const hosting = JSON.parse(readFileSync(join(root, "docs/deployment/candidate-hosting.json"), "utf8"));
if (hosting.primary_url !== "https://truckcontrolai.com" ||
    hosting.expected_channel !== "production" ||
    !/^[0-9a-f]{40}$/.test(hosting.published_commit || "")) {
  throw new Error("Verified production configuration is required");
}
const original = readFileSync(join(root, "tests/saas-browser/platform.spec.ts"), "utf8");
const selection = "CargoTrack y cierre|una página restaurada de la caché|cerrar sesión bloquea la clave offline|cerrar sesión desde otra pestaña bloquea";
if (!original.includes('test.describe("CargoTrack y cierre de sesión del menú"')) {
  throw new Error("Original CargoTrack regression suite missing");
}
const artifacts = resolve(process.env.TRUCKCONTROL_PUBLIC_CARGOTRACK_ARTIFACTS || "public-cargotrack-results");
mkdirSync(artifacts, { recursive: true });
// Below tests/ so the unchanged ../../src imports resolve to the existing source.
const temporary = mkdtempSync(join(root, "tests/.published-cargotrack-"));
let status = 1;
try {
  writeFileSync(join(temporary, "platform.spec.ts"), original
    .replaceAll("http://127.0.0.1:9999", "https://kkkemaycedexymrpaqtp.supabase.co")
    .replaceAll("http://127.0.0.1:4194", hosting.primary_url));
  const config = {
    testDir: temporary,
    workers: 2,
    timeout: 60000,
    expect: { timeout: 8000 },
    outputDir: join(artifacts, "results"),
    reporter: [["list"], ["json", { outputFile: join(artifacts, "results.json") }]],
    use: {
      baseURL: hosting.primary_url,
      locale: "es-ES",
      serviceWorkers: "block",
      screenshot: "only-on-failure",
      trace: "retain-on-failure",
      launchOptions: {
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
        args: ["--no-sandbox"],
      },
    },
  };
  writeFileSync(join(temporary, "playwright.config.ts"),
    'import { defineConfig, devices } from "@playwright/test";\n' +
    "const config = " + JSON.stringify(config) + ";\n" +
    'export default defineConfig({ ...config, projects: [{ name: "published-windows", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }, { name: "published-android", use: { ...devices["Pixel 7"] } }] });\n');
  const result = spawnSync(process.execPath, [join(root, "node_modules/@playwright/test/cli.js"),
    "test", "--config", join(temporary, "playwright.config.ts"), "--grep", selection], {
    cwd: root, stdio: "inherit", env: process.env,
  });
  if (result.error) throw result.error;
  status = result.status ?? 1;
  writeFileSync(join(artifacts, "scope.json"), JSON.stringify({
    checked_at: new Date().toISOString(),
    origin: hosting.primary_url,
    expected_source_commit: hosting.published_commit,
    browser_sdk: "real pinned Supabase SDK",
    backend_transport: "fictitious intercepted HTTP, no native accounts",
    external_provider: "navigation intercepted, no CargoTrack login",
    devices: "Desktop Chrome / Pixel 7 emulation, not physical devices",
    assertions: "original eight regression cases unchanged; only fixture URL and CORS origin adapted",
    exit_code: status,
  }, null, 2) + "\n");
} finally {
  // Only remove the unique directory this invocation created, never the database or fixtures.
  rmSync(temporary, { recursive: true, force: true });
}
process.exitCode = status;
