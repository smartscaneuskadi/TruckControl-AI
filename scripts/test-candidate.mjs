import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const run = mkdtempSync(join(tmpdir(), "truckcontrol-candidate-tests-"));
const env = {
  ...process.env,
  VITE_RELEASE_CHANNEL: "candidate",
  VITE_COMMERCIAL_MODE: "true",
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_PUBLISHABLE_KEY: "",
  TRUCKCONTROL_COMPANY_TEST_DIST: join(run, "dist"),
  TRUCKCONTROL_TEST_PREVIEW_PORT: "4195",
  TRUCKCONTROL_CANDIDATE_TEST_ARTIFACTS:
    process.env.TRUCKCONTROL_CANDIDATE_TEST_ARTIFACTS ?? join(run, "results"),
};
if (!process.env.npm_execpath) throw new Error("Run through npm.");
const npm = process.env.npm_execpath;
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
      "playwright.candidate.config.ts",
    ],
    { env, stdio: "inherit" },
  );
console.log(`Candidate browser test artifacts: ${run}`);
process.exit(result.status ?? 1);
