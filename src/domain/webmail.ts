/** Only public HTTPS webmail addresses; never accept credentials in a URL. */
export function webmailUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      (typeof window !== "undefined" &&
        url.origin === window.location.origin) ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes(".") ||
      url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".localhost") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
