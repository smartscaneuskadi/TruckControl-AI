import { Field } from "./ui";
export function TotpCodeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange(value: string): void;
  disabled: boolean;
}) {
  return (
    <Field label="Código de 6 dígitos">
      <input
        className="mfa-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
        }
      />
    </Field>
  );
}
