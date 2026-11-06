/** Exact production origins; the preserved demo cannot start a commercial purchase. */
export const productionBillingOrigins = [
  "https://truckcontrolai.com",
  "https://www.truckcontrolai.com",
  "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
] as const;

export function productionBillingOrigin(configured?: string) {
  return (
    productionBillingOrigins.find((origin) => origin === configured) ??
    productionBillingOrigins[0]
  );
}
