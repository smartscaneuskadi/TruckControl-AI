import { useSyncExternalStore } from "react";
import { Globe2 } from "lucide-react";
import {
  currentLanguage,
  languageMeta,
  setLanguage,
  subscribeLanguage,
  supportedLanguages,
} from "./runtime";
import type { Language } from "./runtime";
import "./language.css";
export function LanguageSwitcher() {
  const language = useSyncExternalStore(
    subscribeLanguage,
    currentLanguage,
    () => "es" as Language,
  );
  return (
    <label className="language-switcher">
      <Globe2 size={17} aria-hidden="true" />
      <span className="sr-only">{languageMeta[language].label}</span>
      <select
        aria-label={languageMeta[language].label}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        {supportedLanguages.map((code) => (
          <option key={code} value={code}>
            {languageMeta[code].name}
          </option>
        ))}
      </select>
    </label>
  );
}
