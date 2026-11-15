import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const run = mkdtempSync(join(tmpdir(), "truckcontrol-manual-full-"));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run through npm.");
const env = {
  ...process.env,
  VITE_RELEASE_CHANNEL: "demo",
  VITE_COMMERCIAL_MODE: "true",
  VITE_SUPABASE_URL: "http://127.0.0.1:9999",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_manual_full",
  TRUCKCONTROL_COMPANY_TEST_DIST: join(run, "dist"),
  TRUCKCONTROL_TEST_PREVIEW_PORT: "4214",
  TRUCKCONTROL_MANUAL_FULL_ARTIFACTS:
    process.env.TRUCKCONTROL_MANUAL_FULL_ARTIFACTS ?? join(run, "results"),
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
      "playwright.manual-full.config.ts",
      ...process.argv.slice(2),
    ],
    { env, stdio: "inherit" },
  );
console.log(`Manual company Full artifacts: ${run}`);
process.exit(result.status ?? 1);
