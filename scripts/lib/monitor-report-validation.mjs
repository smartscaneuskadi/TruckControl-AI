// Fail closed when the local health artifact is missing, forged or incomplete.
// Never forward untrusted report values to the issue reporter.
const endpoints = [
  ["release", "https://truckcontrolai.com/release.json"],
  ["release", "https://www.truckcontrolai.com/release.json"],
  ["release", "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site/release.json"],
  ["copilot_health", "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-copilot/specialists/health"],
  ["anonymous_database_gateway", "https://kkkemaycedexymrpaqtp.supabase.co/rest/v1/trucks?select=id&limit=1"],
];
const sharedCodes = ["request_failed", "unexpected_status", "invalid_or_oversized_json", "invalid_json_shape"];
const releaseCodes = new Set([...sharedCodes, "release_identity_check"]);
const copilotCodes = new Set([...sharedCodes, "protected_copilot_contract"]);
const gatewayCodes = new Set(["request_failed", "missing_api_key_denied", "anonymous_access_unexpected"]);
const invalid = () => ({ passed: false, code: "invalid_monitor_report" });

// A configuration failure is produced intentionally by production-health.mjs.
// Keep it reportable, but it must never be interpreted as a successful check.
export function normalizeMonitorReport(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 65536) return invalid();
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    return invalid();
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) return invalid();
  if (
    report.passed === false &&
    report.code === "monitor_configuration_failed" &&
    !("checks" in report)
  ) return { passed: false, code: "monitor_configuration_failed" };
  if (
    report.scope !== "public_http_availability_only" ||
    !/^[0-9a-f]{40}$/.test(report.expected_source) ||
    report.authenticated_customer_data_read !== false ||
    report.rls_verified !== false ||
    report.model_calls !== 0 ||
    !Array.isArray(report.checks) ||
    report.checks.length !== endpoints.length ||
    typeof report.passed !== "boolean"
  ) return invalid();
  for (const [index, [name, url]] of endpoints.entries()) {
    const item = report.checks[index];
    const codes = name === "release" ? releaseCodes : name === "copilot_health" ? copilotCodes : gatewayCodes;
    if (
      !item || typeof item !== "object" || Array.isArray(item) ||
      item.name !== name || item.url !== url ||
      typeof item.passed !== "boolean" || !codes.has(item.code) ||
      ("status" in item && (!Number.isInteger(item.status) || item.status < 100 || item.status > 599)) ||
      (name === "anonymous_database_gateway" &&
        item.code !== "request_failed" && item.rls_verified !== false) ||
      // A positive boolean alone is insufficient: the recorded outcome
      // must also be the exact successful HTTP and contract result.
      (item.passed === true && !(
        (name === "release" && item.code === "release_identity_check" && item.status === 200) ||
        (name === "copilot_health" && item.code === "protected_copilot_contract" && item.status === 200) ||
        (name === "anonymous_database_gateway" &&
          item.code === "missing_api_key_denied" && [401, 403].includes(item.status))
      ))
    ) return invalid();
  }
  if (report.passed !== report.checks.every((item) => item.passed === true)) return invalid();
  return report;
}
