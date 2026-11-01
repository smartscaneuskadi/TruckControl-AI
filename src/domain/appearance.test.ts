import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appearanceCacheKey,
  defaultAppearance,
  parseAppearance,
  readAppearanceCache,
  resolveAppearance,
  setAppearanceDocument,
  writeAppearanceCache,
} from "./appearance";

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("apariencia personal y accesibilidad", () => {
  it("solo acepta temas y movimiento conocidos; descarta permisos ajenos", () => {
    expect(
      parseAppearance({
        theme: "light",
        motion: "off",
        role: "admin",
        organization_id: "otra",
      }),
    ).toEqual({ theme: "light", motion: "off" });
    for (const value of [
      null,
      {},
      { theme: "neon", motion: "system" },
      { theme: "light", motion: "fast" },
    ])
      expect(parseAppearance(value)).toBeNull();
  });
  it("sigue el dispositivo y respeta una elección explícita", () => {
    expect(
      resolveAppearance({ theme: "system", motion: "system" }, true, false)
        .theme,
    ).toBe("cockpit");
    expect(
      resolveAppearance({ theme: "system", motion: "system" }, false, false)
        .theme,
    ).toBe("light");
    expect(
      resolveAppearance({ theme: "light", motion: "system" }, true, false)
        .theme,
    ).toBe("light");
    expect(resolveAppearance(defaultAppearance, false, false).theme).toBe(
      "cockpit",
    );
  });
  it("prioriza reducir movimiento y permite desactivarlo por completo", () => {
    expect(resolveAppearance(defaultAppearance, false, true).motion).toBe(
      "reduced",
    );
    expect(
      resolveAppearance({ theme: "light", motion: "reduced" }, false, false)
        .motion,
    ).toBe("reduced");
    expect(
      resolveAppearance({ theme: "light", motion: "off" }, false, true).motion,
    ).toBe("off");
    expect(resolveAppearance(defaultAppearance, false, false).motion).toBe(
      "full",
    );
  });
  it("aísla la caché de cada cuenta y de la demostración", () => {
    writeAppearanceCache("a", { theme: "light", motion: "off" }, true);
    writeAppearanceCache("b", defaultAppearance);
    expect(readAppearanceCache("a")).toEqual({
      preference: { theme: "light", motion: "off" },
      pending: true,
    });
    expect(readAppearanceCache("b")).toEqual({
      preference: defaultAppearance,
      pending: false,
    });
    expect(readAppearanceCache(null)).toBeNull();
    expect(appearanceCacheKey(null)).not.toBe(appearanceCacheKey("a"));
  });
  it("ignora cachés dañadas y soporta almacenamiento bloqueado", () => {
    localStorage.setItem(appearanceCacheKey("a"), "{invalid");
    expect(readAppearanceCache("a")).toBeNull();
    localStorage.setItem(
      appearanceCacheKey("a"),
      JSON.stringify({ preference: { theme: "unknown", motion: "system" } }),
    );
    expect(readAppearanceCache("a")).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readAppearanceCache("a")).toBeNull();
    expect(writeAppearanceCache("a", defaultAppearance)).toBe(false);
  });
  it("aplica variables al documento y al color del navegador sin navegar", () => {
    const html = {
      dataset: {} as Record<string, string>,
      style: { colorScheme: "" },
    };
    const meta = { setAttribute: vi.fn() };
    vi.stubGlobal("document", {
      documentElement: html,
      querySelector: () => meta,
    });
    vi.stubGlobal("window", {
      matchMedia: (q: string) => ({ matches: q.includes("reduced-motion") }),
    });
    expect(
      setAppearanceDocument({ theme: "system", motion: "system" }),
    ).toEqual({ theme: "light", motion: "reduced" });
    expect(html.dataset).toEqual({ theme: "light", motion: "reduced" });
    expect(html.style.colorScheme).toBe("light");
    expect(meta.setAttribute).toHaveBeenLastCalledWith("content", "#f4f8fc");
  });
});
