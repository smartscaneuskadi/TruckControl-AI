const productionProject = "kkkemaycedexymrpaqtp";
/** Runtime fence: a sandbox key can never update the production project's licences. */
export function manualStripeRuntimeAllowed(
  supabaseUrl: string, mode: string | undefined, isolatedTestProjectRef?: string,
): boolean {
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash) return false;
    if (mode === "live") return url.hostname === productionProject + ".supabase.co";
    return mode === "test" && typeof isolatedTestProjectRef === "string" &&
      /^[a-z0-9]{20}$/.test(isolatedTestProjectRef) && isolatedTestProjectRef !== productionProject &&
      url.hostname === isolatedTestProjectRef + ".supabase.co";
  } catch { return false; }
}
