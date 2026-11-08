import en from "./locales/en.json";
import ro from "./locales/ro.json";
import fr from "./locales/fr.json";
export const supportedLanguages = ["es", "ro", "en", "fr"] as const;
export type Language = (typeof supportedLanguages)[number];
export const languagePreferenceKey = "truckcontrol.ui.language";
export const languageMeta = {
  es: { name: "Español", locale: "es-ES", label: "Idioma" },
  ro: { name: "Română", locale: "ro-RO", label: "Limbă" },
  en: { name: "English", locale: "en-GB", label: "Language" },
  fr: { name: "Français", locale: "fr-FR", label: "Langue" },
} as const;
const dictionaries: Record<Exclude<Language, "es">, Record<string, string>> = {
  en,
  ro,
  fr,
};
const event = "truckcontrol-language-change";
export function validLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" &&
    (supportedLanguages as readonly string[]).includes(value)
  );
}
function savedLanguage(): Language {
  try {
    const saved =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(languagePreferenceKey)
        : null;
    return validLanguage(saved) ? saved : "es";
  } catch {
    return "es";
  }
}
let language: Language = savedLanguage();
export const currentLanguage = () => language;
export const currentLocale = () => languageMeta[language].locale;
function updateDocument() {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}
updateDocument();
export function setLanguage(next: Language) {
  if (!validLanguage(next) || next === language) return;
  language = next;
  updateDocument();
  try {
    localStorage.setItem(languagePreferenceKey, next);
  } catch {
    /* Local preference is still active in memory. */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(event));
}
export function subscribeLanguage(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const storage = (e: StorageEvent) => {
    if (e.key !== languagePreferenceKey) return;
    const next = validLanguage(e.newValue) ? e.newValue : "es";
    if (next !== language) {
      language = next;
      updateDocument();
      listener();
    }
  };
  window.addEventListener(event, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener("storage", storage);
  };
}
export const normalizeMessage = (value: string) =>
  value.replace(/\s+/g, " ").trim();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type Pattern = {
  key: string;
  expression: RegExp;
  indices: number[];
  weight: number;
};
let patterns: Pattern[] | null = null;
function messagePatterns() {
  if (patterns) return patterns;
  patterns = [];
  for (const key of Object.keys(en)) {
    if (!/\{\d+\}/.test(key)) continue;
    const parts = key.split(/(\{\d+\})/g),
      indices: number[] = [];
    const weight = key.replace(/\{\d+\}/g, "").length;
    if (weight < 6) continue;
    const expression = new RegExp(
      "^" +
        parts
          .map((part) =>
            /^\{\d+\}$/.test(part)
              ? (indices.push(Number(part.slice(1, -1))), "([\\s\\S]*?)")
              : escaped(part),
          )
          .join("") +
        "$",
    );
    patterns.push({ key, expression, indices, weight });
  }
  patterns.sort((a, b) => b.weight - a.weight);
  return patterns;
}
function interpolate(value: string, params: readonly unknown[]) {
  return value.replace(/\{(\d+)\}/g, (token, index: string) =>
    Number(index) < params.length ? String(params[Number(index)]) : token,
  );
}
export function t(value: string, params?: readonly unknown[]): string;
export function t<T>(value: T): T;
export function t(value: unknown, params?: readonly unknown[]): unknown {
  if (typeof value !== "string") return value;
  if (language === "es") return params ? interpolate(value, params) : value;
  const key = normalizeMessage(value),
    dict = dictionaries[language];
  const translated = dict[key];
  if (translated !== undefined) {
    const result = params ? interpolate(translated, params) : translated;
    return (
      (/^\s/.test(value) ? " " : "") + result + (/\s$/.test(value) ? " " : "")
    );
  }
  if (params) return interpolate(value, params);
  // Only callers rendering known UI labels/errors use pattern matching. User records
  // and email bodies are deliberately not sent through the UI translator.
  for (const pattern of messagePatterns()) {
    const match = pattern.expression.exec(key);
    if (!match) continue;
    const target = dict[pattern.key];
    if (target === undefined) continue;
    const values: unknown[] = [];
    pattern.indices.forEach((index, i) => {
      values[index] = match[i + 1];
    });
    return interpolate(target, values);
  }
  return value;
}
export function localizedNumberFormat(
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const cache = new Map<string, Intl.NumberFormat>();
  return new Proxy({} as Intl.NumberFormat, {
    get(_target, property) {
      const locale = currentLocale();
      let formatter = cache.get(locale);
      if (!formatter) {
        formatter = new Intl.NumberFormat(locale, options);
        cache.set(locale, formatter);
      }
      const value = Reflect.get(formatter, property, formatter);
      return typeof value === "function" ? value.bind(formatter) : value;
    },
  });
}
export function localizedDateFormat(
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cache = new Map<string, Intl.DateTimeFormat>();
  return new Proxy({} as Intl.DateTimeFormat, {
    get(_target, property) {
      const locale = currentLocale();
      let formatter = cache.get(locale);
      if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, options);
        cache.set(locale, formatter);
      }
      const value = Reflect.get(formatter, property, formatter);
      return typeof value === "function" ? value.bind(formatter) : value;
    },
  });
}
export function updateDocumentTitle() {
  if (typeof document === "undefined") return;
  const suffix = " · TruckControl AI";
  if (!document.title.endsWith(suffix)) return;
  const text = document.title.slice(0, -suffix.length);
  let key = text;
  for (const dict of Object.values(dictionaries)) {
    const found = Object.entries(dict).find(([, value]) => value === text);
    if (found) {
      key = found[0];
      break;
    }
  }
  document.title = String(t(key)) + suffix;
}
