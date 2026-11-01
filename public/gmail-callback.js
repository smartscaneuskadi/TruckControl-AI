/* OAuth transport only. No refresh/access tokens, passwords or API keys in this page. */
(() => {
  const params = new URLSearchParams(location.search);
  const state = params.get("state");
  const code = params.get("code");
  const error = params.get("error");
  history.replaceState(null, "", location.pathname);
  const result = document.getElementById("result");
  const fail = () => {
    result.textContent =
      "No se ha podido conectar Gmail. Vuelve a TruckControl e inicia de nuevo la conexión desde tu empresa.";
  };
  if (
    !state ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    (!code && !error) ||
    (code && code.length > 4096) ||
    (error && error.length > 256)
  )
    return fail();
  fetch(
    "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-gmail/oauth-callback",
    {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, ...(error ? { error } : { code }) }),
      signal: AbortSignal.timeout(30000),
    },
  )
    .then(async (response) => {
      if (!response.ok) throw new Error("Exchange unavailable");
      const data = await response.json();
      const next = new URL(data.url);
      if (
        ![
          "https://truckcontrolai.com",
          "https://www.truckcontrolai.com",
          "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
        ].includes(next.origin) ||
        next.username ||
        next.password ||
        next.pathname !== "/" ||
        next.search ||
        !/^#\/invoices\?(?:gmail_ticket=[A-Za-z0-9_-]{43}|gmail_error=[a-z_]+)$/.test(
          next.hash,
        )
      )
        throw new Error("Invalid destination");
      location.replace(next.href);
    })
    .catch(fail);
})();
