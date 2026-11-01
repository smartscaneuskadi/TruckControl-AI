import { z } from "zod";

export const appearanceSchema = z.object({
  theme: z.enum(["light", "cockpit", "system"]),
  motion: z.enum(["system", "reduced", "off"]),
});
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = {
  theme: "cockpit",
  motion: "system",
};
export const appearanceMetadataKey = "truckcontrol_appearance";
export function parseAppearance(value: unknown): Appearance | null {
  const parsed = appearanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function resolveAppearance(
  preference: Appearance,
  darkDevice: boolean,
  reducedDevice: boolean,
) {
  return {
    theme:
      preference.theme === "system"
        ? darkDevice
          ? "cockpit"
          : "light"
        : preference.theme,
    motion:
      preference.motion === "off"
        ? "off"
        : preference.motion === "reduced" || reducedDevice
          ? "reduced"
          : "full",
  } as const;
}
export function appearanceCacheKey(account: string | null) {
  return `truckcontrol-appearance-v1:${account ?? "demo"}`;
}
export function readAppearanceCache(account: string | null) {
  try {
    const value = JSON.parse(
      localStorage.getItem(appearanceCacheKey(account)) ?? "null",
    );
    const preference = parseAppearance(value?.preference);
    return preference ? { preference, pending: value.pending === true } : null;
  } catch {
    return null;
  }
}
export function writeAppearanceCache(
  account: string | null,
  preference: Appearance,
  pending = false,
) {
  try {
    localStorage.setItem(
      appearanceCacheKey(account),
      JSON.stringify({
        preference: appearanceSchema.parse(preference),
        pending,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function setAppearanceDocument(preference: Appearance) {
  const resolved = resolveAppearance(
    preference,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  document.documentElement.dataset.theme = resolved.theme;
  document.documentElement.dataset.motion = resolved.motion;
  document.documentElement.style.colorScheme =
    resolved.theme === "light" ? "light" : "dark";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      resolved.theme === "light" ? "#f4f8fc" : "#102a3b",
    );
  return resolved;
}
