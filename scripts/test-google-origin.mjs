import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run through npm.");
const run = mkdtempSync(join(tmpdir(), "truckcontrol-google-origin-"));
const env = {
  ...process.env,
  VITE_RELEASE_CHANNEL: "demo",
  VITE_COMMERCIAL_MODE: "true",
  VITE_MFA_ENROLLMENT_ENABLED: "true",
  // Synthetic key; all private traffic is fulfilled by closed test doubles.
  // The dedicated project URL preserves the app's real origin security guard.
  VITE_SUPABASE_URL: "https://kkkemaycedexymrpaqtp.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_google_origin",
  TRUCKCONTROL_COMPANY_TEST_DIST: join(run, "dist"),
  TRUCKCONTROL_TEST_PREVIEW_PORT: "4228",
  TRUCKCONTROL_GOOGLE_ORIGIN_ARTIFACTS:
    process.env.TRUCKCONTROL_GOOGLE_ORIGIN_ARTIFACTS ?? join(run, "results"),
};
let result = spawnSync(
  process.execPath,
  [npm, "run", "build", "--", "--outDir", env.TRUCKCONTROL_COMPANY_TEST_DIST],
  { env, stdio: "inherit" },
);
if (result.status === 0)
  result = spawnSync(
    process.execPath,
    [
      npm,
      "exec",
      "--",
      "playwright",
      "test",
      "--config",
      "playwright.google-origin.config.ts",
      ...process.argv.slice(2),
    ],
    { env, stdio: "inherit" },
  );
console.log(`Google origin browser artifacts: ${run}`);
process.exit(result.status ?? 1);
