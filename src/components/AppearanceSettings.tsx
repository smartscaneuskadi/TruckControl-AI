import { useEffect, useState } from "react";
import { Check, Monitor, MoonStar, Sun, Palette } from "lucide-react";
import { useAppearance } from "../app/AppearanceContext";
import type { Appearance } from "../domain/appearance";
import { Button } from "./ui";

export function AppearanceSettings({ compact = false }: { compact?: boolean }) {
  const appearance = useAppearance();
  const [draft, setDraft] = useState(appearance.preference);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(appearance.preference);
  }, [appearance.preference, dirty]);
  const options = [
    {
      id: "light",
      name: "Fleet Light",
      icon: Sun,
      description: "Blanco, azul claro y acentos verdes y dorados.",
    },
    {
      id: "cockpit",
      name: "Fleet Cockpit",
      icon: MoonStar,
      description: "Azul marino, verde bosque e instrumentación luminosa.",
    },
    {
      id: "system",
      name: "Seguir configuración del dispositivo",
      icon: Monitor,
      description: "Se adapta automáticamente al modo claro u oscuro.",
    },
  ] as const;
  return (
    <section
      className={`appearance-settings ${compact ? "" : "card"}`}
      aria-labelledby={
        compact ? "appearance-dialog-heading" : "appearance-heading"
      }
    >
      <div className="appearance-heading">
        <Palette size={24} />
        <div>
          <h2 id={compact ? "appearance-dialog-heading" : "appearance-heading"}>
            Apariencia
          </h2>
          <p>
            Tu espacio de trabajo, a tu manera. El cambio conserva tus datos y
            formularios.
          </p>
        </div>
      </div>
      <fieldset className="theme-options">
        <legend>Elige un tema</legend>
        {options.map((option) => (
          <label
            className={`theme-option ${draft.theme === option.id ? "selected" : ""}`}
            key={option.id}
          >
            <input
              type="radio"
              aria-label={option.name}
              name={compact ? "theme-dialog" : "theme-preference"}
              value={option.id}
              checked={draft.theme === option.id}
              onChange={() => {
                setDraft({ ...draft, theme: option.id });
                setDirty(true);
                setSaved(false);
              }}
            />
            <span
              className={`theme-preview preview-${option.id}`}
              aria-hidden="true"
            >
              <span className="preview-sidebar" />
              <span className="preview-content">
                <span className="preview-header" />
                <span className="preview-cards">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="preview-chart">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </span>
            <span className="theme-option-title">
              <option.icon size={18} />
              <strong>{option.name}</strong>
              {draft.theme === option.id && <Check size={17} />}
            </span>
            <span>{option.description}</span>
          </label>
        ))}
      </fieldset>
      <label className="appearance-motion">
        <span>
          <strong>Animaciones</strong>
          <small>
            Las preferencias de accesibilidad del dispositivo siempre se
            respetan.
          </small>
        </span>
        <select
          aria-label="Animaciones"
          value={draft.motion}
          onChange={(e) => {
            setDraft({
              ...draft,
              motion: e.target.value as Appearance["motion"],
            });
            setDirty(true);
            setSaved(false);
          }}
        >
          <option value="system">Seguir el dispositivo</option>
          <option value="reduced">Reducir animaciones</option>
          <option value="off">Desactivar animaciones</option>
        </select>
      </label>
      <div className="appearance-actions">
        <Button
          onClick={() => {
            appearance.apply(draft);
            setDirty(false);
            setSaved(true);
          }}
        >
          Aplicar apariencia
        </Button>
        <span role="status">
          {saved
            ? appearance.status === "synced"
              ? "Guardado en tu perfil. Disponible en tus otros dispositivos."
              : appearance.status === "saving"
                ? "Guardando en tu perfil…"
                : appearance.account
                  ? "Aplicado. Se sincronizará al recuperar la conexión."
                  : "Guardado en este dispositivo. Inicia sesión para sincronizarlo entre dispositivos."
            : "Vista previa: el tema se aplica al pulsar el botón."}
        </span>
      </div>
    </section>
  );
}
