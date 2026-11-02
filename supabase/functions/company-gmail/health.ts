/** Readiness only: never authenticates mailboxes, calls Google or returns key material. */
export const productionGmailOrigins = [
  "https://truckcontrolai.com",
  "https://www.truckcontrolai.com",
  "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
] as const;
export function withGmailHealth(
  handler: (request: Request) => Promise<Response>,
  resolve: () => Promise<unknown>,
) {
  return async (request: Request): Promise<Response> => {
    if (
      !new URL(request.url).pathname.endsWith("/health") ||
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
    let configured = false;
    try {
      configured = Boolean(await resolve());
    } catch {
      /* Never log a resolver error or secret-bearing object. */
    }
    return Response.json({ configured }, { headers });
  };
}
