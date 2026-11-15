import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./tests/mfa-browser",
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  outputDir: process.env.TRUCKCONTROL_MFA_TEST_ARTIFACTS,
  reporter: [["list"]],
  use: {
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
      name: "mfa-windows",
      testMatch: "native.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        baseURL: "http://127.0.0.1:4204",
      },
    },
    {
      name: "mfa-android",
      testMatch: "native.spec.ts",
      use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:4204" },
    },
    {
      name: "mfa-default-off",
      testMatch: "default-off.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4205" },
    },
    {
      name: "mfa-legacy",
      testMatch: "legacy.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4206" },
    },
  ],
  webServer: [
    ["TRUCKCONTROL_MFA_ON_DIST", "4204"],
    ["TRUCKCONTROL_MFA_OFF_DIST", "4205"],
    ["TRUCKCONTROL_MFA_LEGACY_DIST", "4206"],
  ].map(([key, port]) => ({
    command: "node scripts/preview-companies.mjs",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      TRUCKCONTROL_COMPANY_TEST_DIST: process.env[key] ?? "",
      TRUCKCONTROL_TEST_PREVIEW_PORT: port,
    },
  })),
});
