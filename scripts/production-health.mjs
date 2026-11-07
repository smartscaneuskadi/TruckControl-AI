import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const origins = [
  "https://truckcontrolai.com",
  "https://www.truckcontrolai.com",
  "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
];
const api = "https://kkkemaycedexymrpaqtp.supabase.co";
async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("invalid_json");
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 32768) {
      await reader.cancel();
      throw Error("oversized_json");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(data));
}
/** Public, non-billable probes. Never supply account credentials or retain bodies. */
export async function checkProduction(config, transport = fetch) {
  if (
    config.project_id !== "appgprj_6ae655e56db481918fe18adfe9df8b66" ||
    config.expected_channel !== "production" ||
    !/^[a-f0-9]{40}$/.test(config.published_commit) ||
    !/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(config.app_version)
  )
    throw Error("invalid_monitor_configuration");
  const specs = [
    ...origins.map((origin) => ({
      name: "release",
      url: origin + "/release.json",
    })),
    {
      name: "copilot_health",
      url: api + "/functions/v1/company-copilot/specialists/health",
    },
    {
      name: "anonymous_database_gateway",
      url: api + "/rest/v1/trucks?select=id&limit=1",
    },
  ];
  const checks = await Promise.all(
    specs.map(async (spec) => {
      let response;
      try {
        response = await transport(spec.url, {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(12000),
          headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        });
      } catch {
        return { ...spec, passed: false, code: "request_failed" };
      }
      if (spec.name === "anonymous_database_gateway") {
        await response.body?.cancel();
        return {
          ...spec,
          status: response.status,
          passed: [401, 403].includes(response.status),
          code: [401, 403].includes(response.status)
            ? "protected"
            : "anonymous_access_unexpected",
        };
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        return {
          ...spec,
          status: response.status,
          passed: false,
          code: "unexpected_status",
        };
      }
      let body;
      try {
        body = await boundedJson(response);
      } catch {
        return {
          ...spec,
          status: 200,
          passed: false,
          code: "invalid_or_oversized_json",
        };
      }
      if (spec.name === "release")
        return {
          ...spec,
          status: 200,
          passed:
            body.app === "TruckControl AI" &&
            body.channel === "production" &&
            body.sourceCommit === config.published_commit &&
            body.version === config.app_version &&
            body.sourceDirty === false &&
            body.companyConnectionBundled === true,
          code: "release_identity_check",
        };
      const ids = [
        "general",
        "documents",
        "finance",
        "fuel",
        "maintenance",
        "drivers",
        "trips",
        "management",
      ];
      const passed =
        body.service === "company-copilot-specialists" &&
        body.schema_version === 2 &&
        Array.isArray(body.profiles) &&
        body.profiles.length === 8 &&
        new Set(body.profiles.map((p) => p.id)).size === 8 &&
        body.profiles.every((p) => ids.includes(p.id)) &&
        body.human_confirmation === true &&
        body.scheduled_paid_model_calls === 0;
      return {
        ...spec,
        status: 200,
        passed,
        code: "protected_copilot_contract",
        configured: body.configured === true,
        enabled: body.enabled === true,
        provider_probe_performed: false,
      };
    }),
  );
  return {
    checked_at: new Date().toISOString(),
    scope: "public_http_availability_only",
    expected_source: config.published_commit,
    passed: checks.every((c) => c.passed),
    checks,
    authenticated_customer_data_read: false,
    model_calls: 0,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const output =
    process.env.TRUCKCONTROL_HEALTH_REPORT ||
    "production-health-results/health.json";
  try {
    const report = await checkProduction(
      JSON.parse(
        readFileSync("docs/deployment/candidate-hosting.json", "utf8"),
      ),
    );
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
    process.exitCode = report.passed ? 0 : 1;
  } catch {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(
      output,
      JSON.stringify({ passed: false, code: "monitor_configuration_failed" }) +
        "\n",
    );
    console.error(
      "Monitor configuration failed; no payloads or credentials logged.",
    );
    process.exitCode = 1;
  }
}
