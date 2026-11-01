import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveOwnAppearance } from "./appearance";

function fixture(id = "account-a") {
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id } }, error: null });
  const updateUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id } }, error: null });
  const client = { auth: { getUser, updateUser } } as unknown as Pick<
    SupabaseClient,
    "auth"
  >;
  return { client, getUser, updateUser };
}
const preference = { theme: "light", motion: "off" } as const;
describe("sincronización de apariencia propia sin permisos nuevos", () => {
  it("actualiza exclusivamente metadatos cosméticos del usuario verificado", async () => {
    const f = fixture();
    await saveOwnAppearance(
      f.client,
      "account-a",
      { ...preference, role: "admin" } as typeof preference,
      () => true,
    );
    expect(f.updateUser).toHaveBeenCalledExactlyOnceWith({
      data: { truckcontrol_appearance: preference },
    });
  });
  it("no escribe tras cambiar de cuenta", async () => {
    const f = fixture("account-b");
    await expect(
      saveOwnAppearance(f.client, "account-a", preference, () => true),
    ).rejects.toThrow("cuenta ha cambiado");
    expect(f.updateUser).not.toHaveBeenCalled();
  });
  it("descarta un guardado superado por una preferencia nueva", async () => {
    const f = fixture();
    await expect(
      saveOwnAppearance(f.client, "account-a", preference, () => false),
    ).rejects.toThrow();
    expect(f.updateUser).not.toHaveBeenCalled();
  });
  it("no actualiza sin verificar la sesión", async () => {
    const f = fixture();
    f.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "offline" },
    });
    await expect(
      saveOwnAppearance(f.client, "account-a", preference, () => true),
    ).rejects.toThrow();
    expect(f.updateUser).not.toHaveBeenCalled();
  });
  it("no declara sincronizado un error ni una respuesta de otra cuenta", async () => {
    for (const response of [
      { data: { user: null }, error: { message: "unavailable" } },
      { data: { user: { id: "account-b" } }, error: null },
    ]) {
      const f = fixture();
      f.updateUser.mockResolvedValue(response);
      await expect(
        saveOwnAppearance(f.client, "account-a", preference, () => true),
      ).rejects.toThrow("se sincronizará");
    }
  });
  it("rechaza preferencias inválidas antes de llamar a Auth", async () => {
    const f = fixture();
    await expect(
      saveOwnAppearance(
        f.client,
        "account-a",
        { ...preference, theme: "invalid" } as unknown as typeof preference,
        () => true,
      ),
    ).rejects.toThrow();
    expect(f.getUser).not.toHaveBeenCalled();
  });
});
