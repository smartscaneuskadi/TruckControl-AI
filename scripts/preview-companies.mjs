import { spawn } from "node:child_process";
const directory = process.env.TRUCKCONTROL_COMPANY_TEST_DIST;
if (!directory || !process.env.npm_execpath)
  throw new Error("Missing isolated company test build.");
const child = spawn(
  process.execPath,
  [
    process.env.npm_execpath,
    "run",
    "preview",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    "4184",
    "--outDir",
    directory,
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
