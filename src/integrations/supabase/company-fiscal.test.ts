import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  loadCompanyFiscal,
  loadFiscalAdminPage,
  saveCompanyFiscal,
  saveFiscalPolicy,
} from "./company-fiscal";
import { disabledFiscalPolicy } from "../../domain/company-fiscal";
import type { CompanyFiscalState } from "../../domain/company-fiscal";
const org = "fc200000-0000-4000-8000-000000000001",
  foreign = "fc200000-0000-4000-8000-000000000002",
  stamp = "2026-11-06T10:00:00Z";
function state(id = org): CompanyFiscalState {
  return {
    schema_version: 1,
    phase: "preparation",
    emission_available: false,
    organization_id: id,
    organization_name: "Empresa fiscal ficticia",
    policy: {
      ...structuredClone(disabledFiscalPolicy),
      enabled: true,
      options: {
        ticketbai: true,
        verifactu: true,
        no_verifactu: true,
        external: true,
        facturae: true,
      },
      version: 1,
      updated_at: stamp,
    },
    profile: null,
    configured_option_allowed: false,
  };
}
function client(
  data: unknown,
  error: { code?: string; message?: string } | null = null,
) {
  const aborted = vi.fn();
  const rpc = vi.fn(() => {
    const pending = Promise.resolve({ data, error });
    return Object.assign(pending, {
      abortSignal: (signal: AbortSignal) => {
        aborted(signal);
        return pending;
      },
    });
  });
  return {
    value: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
    aborted,
  };
}
describe("contrato de configuración fiscal sin credenciales ni autoridad del navegador", () => {
  it("verifica la empresa de la respuesta y propaga cancelación de lecturas", async () => {
    const f = client(state()),
      signal = new AbortController().signal;
    expect(
      (await loadCompanyFiscal(f.value, org, signal)).organization_id,
    ).toBe(org);
    expect(f.aborted).toHaveBeenCalledWith(signal);
    await expect(
      loadCompanyFiscal(client(state(foreign)).value, org),
    ).rejects.toThrow("empresa activa");
  });
  it("no acepta un servidor que anuncie emisión o una fase desconocida", async () => {
    await expect(
      loadCompanyFiscal(
        client({ ...state(), emission_available: true }).value,
        org,
      ),
    ).rejects.toThrow();
    await expect(
      loadCompanyFiscal(client({ ...state(), phase: "production" }).value, org),
    ).rejects.toThrow();
  });
  it("solo envía el perfil, el identificador de empresa y su versión, nunca poderes administrativos", async () => {
    const current = state();
    current.profile = {
      regime: "external",
      territory: null,
      document_format: "pdf",
      version: 7,
      updated_at: stamp,
    };
    current.configured_option_allowed = true;
    const f = client({
      ...current,
      profile: {
        regime: "ticketbai",
        territory: "bizkaia",
        document_format: "facturae",
        version: 8,
        updated_at: stamp,
      },
    });
    await saveCompanyFiscal(f.value, current, {
      regime: "ticketbai",
      territory: "bizkaia",
      document_format: "facturae",
    });
    expect(f.rpc).toHaveBeenCalledWith("tc_company_fiscal_control", {
      p_org: org,
      p_action: "save",
      p_expected: 7,
      p_after: null,
      p_data: {
        regime: "ticketbai",
        territory: "bizkaia",
        document_format: "facturae",
      },
    });
  });
  it("bloquea opciones sin permiso y perfiles con territorio o claves indebidas antes de la red", async () => {
    const current = state();
    current.policy.options.ticketbai = false;
    const f = client(current);
    await expect(
      saveCompanyFiscal(f.value, current, {
        regime: "ticketbai",
        territory: "araba",
        document_format: "pdf",
      }),
    ).rejects.toThrow("administración");
    await expect(
      saveCompanyFiscal(f.value, current, {
        regime: "external",
        territory: "gipuzkoa",
        document_format: "pdf",
      }),
    ).rejects.toThrow();
    await expect(
      saveCompanyFiscal(f.value, current, {
        regime: "external",
        territory: null,
        document_format: "pdf",
        api_key: "synthetic-do-not-store",
      } as never),
    ).rejects.toThrow();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("exige permisos versionados y no permite activar facturación desde un campo extra", async () => {
    const current = state(),
      f = client({
        ...current,
        policy: {
          ...structuredClone(disabledFiscalPolicy),
          version: 2,
          updated_at: stamp,
        },
      });
    await saveFiscalPolicy(f.value, current, {
      ...disabledFiscalPolicy,
      enabled: false,
    });
    expect(f.rpc.mock.calls[0]).toEqual([
      "tc_company_fiscal_control",
      {
        p_org: org,
        p_action: "admin_set",
        p_expected: 1,
        p_after: null,
        p_data: disabledFiscalPolicy,
      },
    ]);
    f.rpc.mockClear();
    await expect(
      saveFiscalPolicy(f.value, current, {
        ...disabledFiscalPolicy,
        emission_available: true,
      } as never),
    ).rejects.toThrow();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rechaza páginas repetidas, desordenadas o cursores que no progresan", async () => {
    for (const data of [
      { items: [state(), state()], next_cursor: org },
      { items: [state(foreign), state()], next_cursor: null },
      { items: [state()], next_cursor: foreign },
    ])
      await expect(loadFiscalAdminPage(client(data).value)).rejects.toThrow();
    await expect(
      loadFiscalAdminPage(
        client({ items: [state()], next_cursor: org }).value,
        org,
      ),
    ).rejects.toThrow();
    expect(
      (
        await loadFiscalAdminPage(
          client({ items: [state(), state(foreign)], next_cursor: foreign })
            .value,
        )
      ).items,
    ).toHaveLength(2);
  });
  it("muestra un conflicto seguro sin filtrar errores privados del servidor", async () => {
    const f = client(null, {
      code: "40001",
      message: "private synthetic credential must never be surfaced",
    });
    await expect(loadCompanyFiscal(f.value, org)).rejects.toThrow(
      "otro dispositivo",
    );
    await expect(loadCompanyFiscal(f.value, org)).rejects.not.toThrow(
      "credential",
    );
  });
});
