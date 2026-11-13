import {
  presetReceivedPeriod,
  resolveMailPeriod,
} from "../../supabase/functions/_shared/mail-period";
import type { ReceivedPeriod } from "../../supabase/functions/_shared/mail-period";

export type InvoiceMailPreset = "30d" | "3m" | "6m" | "12m" | "custom";

/** Resolve rolling dates at the explicit read action; custom dates stay as entered. */
export function requestedInvoiceMailPeriod(
  preset: InvoiceMailPreset,
  selected: ReceivedPeriod,
  now = Date.now(),
): ReceivedPeriod {
  const checked = resolveMailPeriod(
    preset === "custom" ? selected : presetReceivedPeriod(preset, now),
    now,
  );
  return { from: checked.from, to: checked.to };
}
