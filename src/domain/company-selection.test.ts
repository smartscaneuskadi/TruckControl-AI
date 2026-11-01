import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseCompany,
  companySelectionKey,
  readCompanySelection,
  rememberCompanySelection,
} from "./company-selection";

afterEach(() => vi.unstubAllGlobals());
describe("empresa activa al regresar de OAuth", () => {
  it("recupera la empresa elegida solo dentro de las membresías verificadas", () => {
    const allowed = [{ id: "company-a" }, { id: "company-a2" }];
    expect(chooseCompany(allowed, null, "company-a2")).toBe("company-a2");
    expect(chooseCompany(allowed, "company-a", "company-a2")).toBe("company-a");
    expect(chooseCompany(allowed, "revoked", "company-b")).toBe("company-a");
    expect(chooseCompany([], "company-b", "company-a")).toBeNull();
  });
  it("separa la preferencia de cada usuario sin guardar nombres ni credenciales", () => {
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v),
    });
    rememberCompanySelection("user-a", "company-a2");
    expect(readCompanySelection("user-a")).toBe("company-a2");
    expect(readCompanySelection("user-b")).toBeNull();
    expect(companySelectionKey("user-a")).not.toBe(
      companySelectionKey("user-b"),
    );
    expect([...map.values()]).toEqual(["company-a2"]);
  });
  it("un almacenamiento bloqueado no cambia los permisos ni interrumpe el acceso", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    });
    expect(readCompanySelection("user-a")).toBeNull();
    expect(() => rememberCompanySelection("user-a", "company-a")).not.toThrow();
    expect(chooseCompany([{ id: "company-a" }], null, null)).toBe("company-a");
  });
});
