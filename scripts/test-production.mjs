import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const run = mkdtempSync(join(tmpdir(), "truckcontrol-production-tests-"));
const env = {
  ...process.env,
  VITE_RELEASE_CHANNEL: "production",
  VITE_COMMERCIAL_MODE: "true",
  VITE_AUTH_MAIL_PROVIDER: "resend",
  VITE_SUPABASE_URL: "https://kkkemaycedexymrpaqtp.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_production_fixture",
  TRUCKCONTROL_COMPANY_TEST_DIST: join(run, "dist"),
  TRUCKCONTROL_TEST_PREVIEW_PORT: "4196",
  TRUCKCONTROL_PRODUCTION_TEST_ARTIFACTS:
    process.env.TRUCKCONTROL_PRODUCTION_TEST_ARTIFACTS ?? join(run, "results"),
};
const npm = process.env.npm_execpath;
if (!npm) throw Error("Run through npm.");
let r = spawnSync(
  process.execPath,
  [npm, "run", "build", "--", "--outDir", env.TRUCKCONTROL_COMPANY_TEST_DIST],
  { env, stdio: "inherit" },
);
if (r.status === 0)
  r = spawnSync(
    process.execPath,
    [
      npm,
      "exec",
      "--",
      "playwright",
      "test",
      "--config",
      "playwright.production.config.ts",
    ],
    { env, stdio: "inherit" },
  );
console.log(`Production browser test artifacts: ${run}`);
process.exit(r.status ?? 1);
