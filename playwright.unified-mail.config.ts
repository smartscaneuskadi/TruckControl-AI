import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./tests/unified-mail-browser",
  workers: 2,
  timeout: 40_000,
  expect: { timeout: 8_000 },
  outputDir: process.env.TRUCKCONTROL_UNIFIED_MAIL_ARTIFACTS,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4228",
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
  projects: ["light", "cockpit"].flatMap((theme) => [
    {
      name: `mail-windows-${theme}`,
      metadata: { theme },
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: `mail-android-${theme}`,
      metadata: { theme },
      use: { ...devices["Pixel 7"] },
    },
  ]),
  webServer: {
    command: "node scripts/preview-companies.mjs",
    url: "http://127.0.0.1:4228",
    reuseExistingServer: false,
  },
});
