import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/production-browser",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: [["list"]],
  outputDir: process.env.TRUCKCONTROL_PRODUCTION_TEST_ARTIFACTS,
  use: {
    baseURL: "http://127.0.0.1:4196",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "production-windows",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "production-android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port 4196 --outDir ${process.env.TRUCKCONTROL_COMPANY_TEST_DIST}`,
    url: "http://127.0.0.1:4196",
    reuseExistingServer: false,
  },
});
