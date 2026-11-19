import { defineConfig } from "@playwright/test";
import config from "./playwright.unified-mail.config";

export default defineConfig({
  ...config,
  testDir: "./tests/google-origin-browser",
  outputDir: process.env.TRUCKCONTROL_GOOGLE_ORIGIN_ARTIFACTS,
});
