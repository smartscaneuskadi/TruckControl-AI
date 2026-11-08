import { describe, it, expect, vi } from "vitest";
// The monitor runs in Node without installed application dependencies.
// @ts-expect-error JavaScript operational script is intentionally outside TS app compilation.
import { checkProduction } from "../scripts/production-health.mjs";
const sha = "a".repeat(40),
  config = {
    project_id: "appgprj_6ae655e56db481918fe18adfe9df8b66",
    expected_channel: "production",
    published_commit: sha,
    app_version: "0.5.20-rc.1",
  };
const profiles = [
  "general",
  "documents",
  "finance",
  "fuel",
  "maintenance",
  "drivers",
  "trips",
  "management",
].map((id) => ({ id, verified: true }));
function transport(change?: (url: string) => Response | undefined) {
  return vi.fn(async (url: string, init: any) => {
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers.apikey).toBeUndefined();
    const override = change?.(url);
    if (override) return override;
    return url.endsWith("/release.json")
      ? Response.json({
          app: "TruckControl AI",
          channel: "production",
          sourceCommit: sha,
          version: config.app_version,
          sourceDirty: false,
          companyConnectionBundled: true,
        })
      : url.includes("/rest/")
        ? new Response("", { status: 401 })
        : Response.json({
            service: "company-copilot-specialists",
            schema_version: 2,
            profiles,
            human_confirmation: true,
            scheduled_paid_model_calls: 0,
            configured: true,
            enabled: true,
          });
  });
}
describe("monitor público sin secretos ni consumo", () => {
  it("contrasta tres releases,contrato y rechazo anónimo sin credenciales", async () => {
    const f = transport();
    const r = await checkProduction(config, f);
    expect(r.passed).toBe(true);
    expect(r.checks).toHaveLength(5);
    expect(r.model_calls).toBe(0);
    expect(f).toHaveBeenCalledTimes(5);
  });
  it("no certifica disponibilidad del proveedor por tener una clave configurada", async () => {
    const r = await checkProduction(
      config,
      transport((url) =>
        url.includes("/health")
          ? Response.json({
              service: "company-copilot-specialists",
              schema_version: 2,
              profiles,
              human_confirmation: true,
              scheduled_paid_model_calls: 0,
              configured: false,
              enabled: false,
            })
          : undefined,
      ),
    );
    expect(r.passed).toBe(true);
    expect(
      r.checks.find((c: any) => c.name === "copilot_health"),
    ).toMatchObject({ configured: false, provider_probe_performed: false });
  });
  it("rechaza fuentes diferentes y gateway abierto sin guardar datos", async () => {
    const r = await checkProduction(
      config,
      transport((url) =>
        url.includes("/rest/")
          ? Response.json([{ id: "private-synthetic" }])
          : url.includes("www.")
            ? Response.json({ sourceCommit: "b".repeat(40) })
            : undefined,
      ),
    );
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r)).not.toContain("private-synthetic");
  });
  it("los errores de red no exponen mensajes con posibles secretos", async () => {
    const r = await checkProduction(config, async () => {
      throw Error("synthetic-sensitive-token");
    });
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r)).not.toContain("synthetic-sensitive-token");
  });
  it("descarta cuerpos arbitrarios y demasiado grandes sin volcarlos al informe", async () => {
    for (const body of [
      "sensitive-invalid-json",
      "sensitive" + "x".repeat(40000),
    ]) {
      const r = await checkProduction(
        config,
        transport(() => new Response(body)),
      );
      expect(r.passed).toBe(false);
      expect(JSON.stringify(r)).not.toContain("sensitive");
    }
  });
  it("no ejecuta peticiones con configuración ajena al proyecto", async () => {
    const f = transport();
    await expect(
      checkProduction({ ...config, project_id: "other" }, f),
    ).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});
