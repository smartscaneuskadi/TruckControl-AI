import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/company-browser",
  workers: 2,
  timeout: 30000,
  outputDir: process.env.TRUCKCONTROL_COMPANY_TEST_ARTIFACTS,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4184",
    locale: "es-ES",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "company-windows",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "company-android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/preview-companies.mjs",
    url: "http://127.0.0.1:4184",
    reuseExistingServer: false,
  },
});
