import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./tests/manual-full-browser",
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: [["list"]],
  outputDir: process.env.TRUCKCONTROL_MANUAL_FULL_ARTIFACTS,
  use: {
    baseURL: "http://127.0.0.1:4214",
    locale: "es-ES",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "full-windows",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "full-android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/preview-companies.mjs",
    url: "http://127.0.0.1:4214",
    reuseExistingServer: false,
  },
});
