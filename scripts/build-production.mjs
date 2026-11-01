import { spawnSync } from "node:child_process";
if (!process.env.npm_execpath) throw new Error("Run through npm.");
const result = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "run", "build"],
  {
    env: {
      ...process.env,
      VITE_RELEASE_CHANNEL: "production",
      VITE_COMMERCIAL_MODE: "true",
      VITE_AUTH_MAIL_PROVIDER: "resend",
    },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
