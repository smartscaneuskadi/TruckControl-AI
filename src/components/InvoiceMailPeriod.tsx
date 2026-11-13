import { useId } from "react";
import { Field } from "./ui";
import {
  mailPeriodBounds,
  presetReceivedPeriod,
  resolveMailPeriod,
} from "../../supabase/functions/_shared/mail-period";
import type { ReceivedPeriod } from "../../supabase/functions/_shared/mail-period";
import type { InvoiceMailPreset } from "../domain/invoice-mail-period";

export function InvoiceMailPeriod({
  value,
  onChange,
  preset,
  onPresetChange,
  disabled,
}: {
  value: ReceivedPeriod;
  onChange(period: ReceivedPeriod): void;
  preset: InvoiceMailPreset;
  onPresetChange(preset: InvoiceMailPreset): void;
  disabled: boolean;
}) {
  const id = useId();
  const bounds = mailPeriodBounds();
  let valid = true;
  try {
    // Relative presets are resolved again when import confirmation is requested.
    // A stored overnight 12m selection must not disable that explicit action.
    if (preset === "custom") resolveMailPeriod(value);
  } catch {
    valid = false;
  }
  return (
    <section className="mail-received-period" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Período de recepción de facturas</h3>
      <p id={`${id}-help`}>
        Últimos 30 días por defecto. Puedes buscar hasta los últimos 12 meses.
        Se usa la fecha de recepción del correo, en horario de Madrid.
      </p>
      <div className="integration-fields">
        <Field label="Período de correo">
          <select
            value={preset}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value as InvoiceMailPreset;
              onPresetChange(next);
              if (next !== "custom") onChange(presetReceivedPeriod(next));
            }}
          >
            <option value="30d">Últimos 30 días</option>
            <option value="3m">Últimos 3 meses</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="12m">Últimos 12 meses</option>
            <option value="custom">Elegir fechas</option>
          </select>
        </Field>
        <Field label="Recibidas desde">
          <input
            type="date"
            value={value.from}
            min={bounds.earliest}
            max={value.to || bounds.today}
            disabled={disabled || preset !== "custom"}
            aria-invalid={!valid}
            aria-describedby={`${id}-help`}
            onChange={(event) =>
              onChange({ ...value, from: event.target.value })
            }
          />
        </Field>
        <Field label="Recibidas hasta">
          <input
            type="date"
            value={value.to}
            min={value.from || bounds.earliest}
            max={bounds.today}
            disabled={disabled || preset !== "custom"}
            aria-invalid={!valid}
            aria-describedby={`${id}-help`}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </Field>
      </div>
      {!valid && (
        <p className="form-error" role="alert">
          Elige fechas válidas dentro de los últimos 12 meses, sin días futuros
          y con el inicio anterior o igual al final.
        </p>
      )}
    </section>
  );
}
