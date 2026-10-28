import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/saas-browser",
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  outputDir: process.env.TRUCKCONTROL_SAAS_TEST_ARTIFACTS,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4194",
    locale: "es-ES",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "saas-windows",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "saas-android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/preview-companies.mjs",
    url: "http://127.0.0.1:4194",
    reuseExistingServer: false,
  },
});
