/** Exact origins of the existing connected application; never wildcard subdomains. */
export const productionAppOrigins = [
  "https://truckcontrolai.com",
  "https://www.truckcontrolai.com",
  "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
] as const;

// Retain the already allowed origin while older installed applications update.
export const legacyDemoOrigin =
  "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site";
