import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/candidate-browser",
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  outputDir: process.env.TRUCKCONTROL_CANDIDATE_TEST_ARTIFACTS,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4195",
    locale: "es-ES",
    serviceWorkers: "allow",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "candidate-windows",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "candidate-android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/preview-companies.mjs",
    url: "http://127.0.0.1:4195",
    reuseExistingServer: false,
  },
});
