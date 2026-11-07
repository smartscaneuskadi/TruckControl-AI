import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const repository = "smartscaneuskadi/TruckControl-AI";
if (
  process.env.GITHUB_REPOSITORY !== repository ||
  !process.env.GITHUB_TOKEN ||
  !/^\d+$/.test(process.env.GITHUB_RUN_ID || "")
)
  throw Error("Invalid monitor execution context");
const report = JSON.parse(
  readFileSync("production-health-results/health.json", "utf8"),
);
const marker = "<!-- truckcontrol-public-monitor:v1 -->",
  title = "[Monitor] Disponibilidad pública de TruckControl AI";
const run =
  "https://github.com/" +
  repository +
  "/actions/runs/" +
  process.env.GITHUB_RUN_ID;
const failures = Array.isArray(report.checks)
  ? report.checks
      .filter((c) => c.passed !== true)
      .map((c) => ({ name: c.name, status: c.status, code: c.code }))
  : ["monitor_configuration_failed"];
const fingerprint = createHash("sha256")
  .update(JSON.stringify(failures))
  .digest("hex");
async function api(path, method = "GET", data) {
  const r = await fetch(
    "https://api.github.com/repos/" + repository + "/" + path,
    {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + process.env.GITHUB_TOKEN,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    },
  );
  if (!r.ok) throw Error("GitHub monitor operation failed: " + r.status);
  return r.status === 204 ? null : r.json();
}
try {
  const issues = await api("issues?state=open&per_page=100");
  const issue = issues.find(
    (i) =>
      !i.pull_request &&
      i.title === title &&
      i.body?.includes(marker) &&
      i.user?.login === "github-actions[bot]",
  );
  if (report.passed === true) {
    if (issue) {
      await api("issues/" + issue.number + "/comments", "POST", {
        body:
          marker +
          "\nComprobación pública recuperada: " +
          run +
          ". No acredita proveedores de pago,datos privados,dispositivos físicos o disponibilidad del modelo.",
      });
      await api("issues/" + issue.number, "PATCH", {
        state: "closed",
        state_reason: "completed",
      });
    }
    console.log("Public availability passed.");
  } else {
    const body =
      marker +
      "\n<!-- fingerprint:" +
      fingerprint +
      " -->\nLa comprobación pública requiere revisión: " +
      run +
      "\n\nCódigos sin cuerpos de respuesta,credenciales o datos de clientes:\n```json\n" +
      JSON.stringify(failures, null, 2) +
      "\n```\nSolo disponibilidad HTTP; sin consultas IA de pago,envíos o cambios en empresas.";
    if (!issue) await api("issues", "POST", { title, body });
    else {
      const comments = await api(
        "issues/" + issue.number + "/comments?per_page=100",
      );
      const last = [...comments]
        .reverse()
        .find(
          (c) =>
            c.user?.login === "github-actions[bot]" && c.body?.includes(marker),
        );
      if (!(last?.body || issue.body).includes("fingerprint:" + fingerprint))
        await api("issues/" + issue.number + "/comments", "POST", { body });
    }
    console.log("Availability incident recorded or already tracked.");
  }
} catch {
  console.error(
    "Monitor issue reporting failed; inspect the workflow status and protected report. No credentials or payloads logged.",
  );
  process.exitCode = 1;
}
