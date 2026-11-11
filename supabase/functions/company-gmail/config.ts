export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
}
type Environment = {
  clientId?: string;
  clientSecret?: string;
  encryptionKey?: string;
};
type StoredConfig = {
  client_id?: unknown;
  client_secret?: unknown;
  encryption_key?: unknown;
};

/** Public OAuth identifier only. No client secret or token is exposed to the browser. */
export function gmailBrowserClientId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let id = value.trim();
  if (id.length > 32768) return undefined;
  if (id.startsWith("{")) {
    try {
      const parsed = JSON.parse(id);
      id = parsed.web?.client_id ?? "";
    } catch {
      return undefined;
    }
  }
  return typeof id === "string" &&
    /^468881730124-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)
    ? id
    : undefined;
}

export function createGmailBrowserConfigResolver(
  environmentId: string | undefined,
  readVault: () => Promise<StoredConfig | null>,
  now: () => number = Date.now,
) {
  let cached: string | undefined;
  let expiresAt = 0;
  let pending: Promise<string | undefined> | null = null;
  return async () => {
    const environment = gmailBrowserClientId(environmentId);
    if (environment) return environment;
    if (now() < expiresAt) return cached;
    pending ??= (async () => {
      try {
        return gmailBrowserClientId((await readVault())?.client_id);
      } catch {
        return undefined;
      }
    })();
    try {
      cached = await pending;
      expiresAt = now() + 60000;
      return cached;
    } finally {
      pending = null;
    }
  };
}

function valid(
  value: Environment,
  expectedProjectNumber?: string,
): value is GmailOAuthConfig {
  if (
    !value.clientId ||
    !/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value.clientId)
  )
    return false;
  if (
    expectedProjectNumber &&
    !value.clientId.startsWith(`${expectedProjectNumber}-`)
  )
    return false;
  if (
    !value.clientSecret ||
    value.clientSecret.length < 16 ||
    value.clientSecret.length > 512 ||
    /\s/.test(value.clientSecret)
  )
    return false;
  if (!value.encryptionKey || !/^[A-Za-z0-9+/]{43}=$/.test(value.encryptionKey))
    return false;
  try {
    return atob(value.encryptionKey).length === 32;
  } catch {
    return false;
  }
}

/** Server only. No API key, OAuth secret or encryption material leaves this resolver. */
export function createGmailConfigResolver(
  environment: Environment,
  readVault: () => Promise<StoredConfig | null>,
  now: () => number = Date.now,
  expectedProjectNumber?: string,
) {
  let cached: GmailOAuthConfig | undefined;
  let expiresAt = 0;
  let pending: Promise<GmailOAuthConfig | undefined> | null = null;
  let generation = 0;
  return async function resolve(
    fresh = false,
  ): Promise<GmailOAuthConfig | undefined> {
    if (valid(environment, expectedProjectNumber)) return { ...environment };
    if (fresh) {
      generation++;
      expiresAt = 0;
      pending = null;
    }
    const currentGeneration = generation;
    if (now() < expiresAt) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        // An incomplete environment pair must not be mixed with another OAuth client.
        if (Boolean(environment.clientId) !== Boolean(environment.clientSecret))
          return undefined;
        const stored = await readVault();
        const pair =
          environment.clientId && environment.clientSecret
            ? {
                clientId: environment.clientId,
                clientSecret: environment.clientSecret,
              }
            : {
                clientId:
                  typeof stored?.client_id === "string"
                    ? stored.client_id
                    : undefined,
                clientSecret:
                  typeof stored?.client_secret === "string"
                    ? stored.client_secret
                    : undefined,
              };
        const result = {
          ...pair,
          encryptionKey:
            environment.encryptionKey ||
            (typeof stored?.encryption_key === "string"
              ? stored.encryption_key
              : undefined),
        };
        return valid(result, expectedProjectNumber) ? result : undefined;
      } catch {
        // Provider configuration failures must never echo secret values or remote errors.
        return undefined;
      }
    })();
    const attempt = pending;
    try {
      const resolved = await attempt;
      if (generation === currentGeneration) {
        cached = resolved;
        expiresAt = now() + 60_000;
      }
      return resolved;
    } finally {
      if (pending === attempt) pending = null;
    }
  };
}
