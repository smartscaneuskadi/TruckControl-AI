/** Reuses the existing verified-session/global-admin RPC, pinning the original JWT per request. */
export interface ProviderPermissionClient {
  rpc(
    name: "tc_provider_control",
    data: { p_action: "status"; p_data: Record<string, never> },
  ): {
    setHeader(
      name: string,
      value: string,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
}
export async function canInspectProviderConfiguration(
  client: ProviderPermissionClient,
  token: string,
) {
  try {
    const { data, error } = await client
      .rpc("tc_provider_control", { p_action: "status", p_data: {} })
      .setHeader("Authorization", "Bearer " + token);
    if (
      error !== null ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    )
      return false;
    const google = (data as Record<string, unknown>).google;
    return Boolean(
      google &&
      typeof google === "object" &&
      !Array.isArray(google) &&
      typeof (google as Record<string, unknown>).vault_available === "boolean",
    );
  } catch {
    return false;
  }
}
