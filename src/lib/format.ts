const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const euroPrecise = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});
export const money = (cents: number, precise = false) =>
  (precise ? euroPrecise : euro).format(cents / 100);
export const number = (value: number) =>
  new Intl.NumberFormat("es-ES").format(value);
export const percent = (value: number | null) =>
  value === null
    ? "—"
    : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value)} %`;
export const date = (value: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
export const monthLabel = (value: string, short = false) =>
  value === "all"
    ? "Todo el historial"
    : new Intl.DateTimeFormat("es-ES", {
        month: short ? "short" : "long",
        ...(short ? {} : { year: "numeric" }),
        timeZone: "UTC",
      }).format(new Date(`${value}-15T12:00:00Z`));
export const today = () => new Date().toISOString().slice(0, 10);
export const initials = (name: string) =>
  name
    .split(" ")
    .filter((part) => part !== "Demo")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

export function daysUntil(value: string) {
  return Math.ceil(
    (Date.parse(`${value}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) /
      86_400_000,
  );
}
