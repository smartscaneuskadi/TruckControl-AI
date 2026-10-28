import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const run = mkdtempSync(join(tmpdir(), "truckcontrol-company-tests-"));
const env = {
  ...process.env,
  VITE_COMMERCIAL_MODE: "false",
  VITE_SUPABASE_URL: "http://127.0.0.1:9999",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_browser_fixture",
  TRUCKCONTROL_COMPANY_TEST_DIST: join(run, "dist"),
  TRUCKCONTROL_COMPANY_TEST_ARTIFACTS:
    process.env.TRUCKCONTROL_COMPANY_TEST_ARTIFACTS ?? join(run, "results"),
};
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this test through npm.");
let result = spawnSync(
  process.execPath,
  [npm, "run", "build", "--", "--outDir", env.TRUCKCONTROL_COMPANY_TEST_DIST],
  { env, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
result = spawnSync(
  process.execPath,
  [
    npm,
    "exec",
    "--",
    "playwright",
    "test",
    "--config",
    "playwright.companies.config.ts",
  ],
  { env, stdio: "inherit" },
);
console.log(`Company browser test artifacts: ${run}`);
process.exit(result.status ?? 1);
