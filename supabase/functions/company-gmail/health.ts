/** Readiness only: never authenticates mailboxes, calls Google or returns key material. */
export const productionGmailOrigins = [
  "https://truckcontrolai.com",
  "https://www.truckcontrolai.com",
  "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
] as const;
export function withGmailHealth(
  handler: (request: Request) => Promise<Response>,
  resolve: () => Promise<unknown>,
  resolveBrowserId?: () => Promise<string | undefined>,
) {
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const browserConfig = path.endsWith("/browser-config");
    if (
      !(path.endsWith("/health") || browserConfig) ||
      !["GET", "OPTIONS"].includes(request.method)
    )
      return handler(request);
    const origin = request.headers.get("Origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      Vary: "Origin",
    };
    if (origin && !productionGmailOrigins.some((o) => o === origin))
      return Response.json(
        { error: "origin_not_allowed" },
        { status: 403, headers },
      );
    if (origin)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "apikey,authorization,content-type,x-client-info",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (browserConfig) {
      let clientId: string | undefined;
      try {
        clientId = await resolveBrowserId?.();
      } catch {
        /* Never echo a resolver error. */
      }
      // Even a faulty resolver cannot return a secret or another project's identifier.
      if (
        !clientId ||
        !/^468881730124-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
          clientId,
        )
      )
        clientId = undefined;
      return Response.json(
        {
          configured: Boolean(clientId),
          client_id: clientId ?? null,
          provider: "google",
          mode: "personal_browser",
        },
        { headers },
      );
    }
    let configured = false;
    try {
      configured = Boolean(await resolve());
    } catch {
      /* Never log a resolver error or secret-bearing object. */
    }
    return Response.json({ configured }, { headers });
  };
}
