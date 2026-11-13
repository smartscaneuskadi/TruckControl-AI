/** Identify mode only. Stripe authenticates the entire unmodified bearer credential. */
export function stripeServerKeyMode(key?: string): "test" | "live" | null {
  if (!key || key.length > 512 || key.trim() !== key || key.includes("...")) return null;
  const mode = /^(?:sk|rk)_(live|test)_[A-Za-z0-9._~+\/-]{16,}={0,2}$/.exec(key)?.[1];
  return mode === "live" || mode === "test" ? mode : null;
}
