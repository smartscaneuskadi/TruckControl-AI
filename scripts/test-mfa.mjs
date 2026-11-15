import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const run = mkdtempSync(join(tmpdir(), "truckcontrol-mfa-tests-"));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run through npm.");
const env = {
  ...process.env,
  VITE_RELEASE_CHANNEL: "demo",
  VITE_SUPABASE_URL: "http://127.0.0.1:9999",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_mfa_fixture",
  TRUCKCONTROL_MFA_ON_DIST: join(run, "on"),
  TRUCKCONTROL_MFA_OFF_DIST: join(run, "off"),
  TRUCKCONTROL_MFA_LEGACY_DIST: join(run, "legacy"),
  TRUCKCONTROL_MFA_TEST_ARTIFACTS:
    process.env.TRUCKCONTROL_MFA_TEST_ARTIFACTS ?? join(run, "results"),
};
for (const [directory, commercial, enrollment] of [
  [env.TRUCKCONTROL_MFA_ON_DIST, "true", "true"],
  [env.TRUCKCONTROL_MFA_OFF_DIST, "true", ""],
  [env.TRUCKCONTROL_MFA_LEGACY_DIST, "false", "true"],
]) {
  const result = spawnSync(
    process.execPath,
    [npm, "run", "build", "--", "--outDir", directory],
    {
      env: {
        ...env,
        VITE_COMMERCIAL_MODE: commercial,
        VITE_MFA_ENROLLMENT_ENABLED: enrollment,
      },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const result = spawnSync(
  process.execPath,
  [
    npm,
    "exec",
    "--",
    "playwright",
    "test",
    "--config",
    "playwright.mfa.config.ts",
    ...process.argv.slice(2),
  ],
  { env, stdio: "inherit" },
);
console.log(`Native MFA browser artifacts: ${run}`);
process.exit(result.status ?? 1);
