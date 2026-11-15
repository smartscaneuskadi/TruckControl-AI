import { describe, it, expect } from "vitest";
// The monitor helper runs in plain Node outside the app compilation.
// @ts-expect-error Operational JavaScript has no separate TS declarations.
import { normalizeMonitorReport } from "../scripts/lib/monitor-report-validation.mjs";

const urls = [
  "https://truckcontrolai.com/release.json",
  "https://www.truckcontrolai.com/release.json",
  "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site/release.json",
  "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-copilot/specialists/health",
  "https://kkkemaycedexymrpaqtp.supabase.co/rest/v1/trucks?select=id&limit=1",
];
function fixture() {
  return {
    checked_at: "2026-11-15T07:23:00Z",
    scope: "public_http_availability_only",
    expected_source: "a".repeat(40),
    passed: true,
    checks: [
      ...urls.slice(0, 3).map((url) => ({ name: "release", url, status: 200, code: "release_identity_check", passed: true })),
      { name: "copilot_health", url: urls[3], status: 200, code: "protected_copilot_contract", passed: true },
      { name: "anonymous_database_gateway", url: urls[4], status: 401, code: "missing_api_key_denied", passed: true, rls_verified: false },
    ],
    authenticated_customer_data_read: false,
    rls_verified: false,
    model_calls: 0,
  };
}
describe("monitor health artifact integrity before GitHub incident reporting", () => {
  it("accepts the complete five-probe public report", () => {
    expect(normalizeMonitorReport(JSON.stringify(fixture())).passed).toBe(true);
  });
  it("keeps genuine failing probes reportable without treating them as success", () => {
    const report = fixture();
    report.passed = false;
    report.checks[1] = { ...report.checks[1], passed: false, code: "unexpected_status", status: 503 };
    expect(normalizeMonitorReport(JSON.stringify(report))).toMatchObject({ passed: false, checks: report.checks });
  });
  it("never closes an incident for a forged true flag without all checks", () => {
    for (const value of [
      { passed: true },
      { ...fixture(), checks: [] },
      { ...fixture(), checks: fixture().checks.slice(0, 4) },
      { ...fixture(), checks: [...fixture().checks, fixture().checks[4]] },
      { ...fixture(), model_calls: 1 },
      { ...fixture(), rls_verified: true },
      { ...fixture(), authenticated_customer_data_read: true },
    ]) {
      expect(normalizeMonitorReport(JSON.stringify(value))).toEqual({ passed: false, code: "invalid_monitor_report" });
    }
  });
  it("rejects wrong URLs and provider outcomes as forged reports", () => {
    const wrongUrl = fixture();
    wrongUrl.checks[0].url = "https://other.example/release.json";
    const wrongCode = fixture();
    wrongCode.checks[4].code = "synthetic-private-token";
    const omittedRls = fixture();
    delete (omittedRls.checks[4] as { rls_verified?: boolean }).rls_verified;
    for (const value of [wrongUrl, wrongCode, omittedRls]) {
      expect(normalizeMonitorReport(JSON.stringify(value))).toEqual({ passed: false, code: "invalid_monitor_report" });
    }
  });
  it("rejects contradictory aggregate status and malformed JSON", () => {
    const inconsistent = fixture();
    inconsistent.checks[0].passed = false;
    for (const raw of [JSON.stringify(inconsistent), "{sensitive-token", "x".repeat(65537), "null", "[]"]) {
      expect(normalizeMonitorReport(raw)).toEqual({ passed: false, code: "invalid_monitor_report" });
    }
  });
  it("preserves explicit monitor configuration failures as reportable failures", () => {
    expect(normalizeMonitorReport('{"passed":false,"code":"monitor_configuration_failed"}')).toEqual({
      passed: false, code: "monitor_configuration_failed",
    });
  });
});
