import { z } from "zod";

export const featureLabels = {
  dashboard: "Panel principal",
  trucks: "Camiones",
  drivers: "Conductores",
  income: "Ingresos",
  expenses: "Gastos",
  profitability: "Rentabilidad",
  documents: "Documentos",
  gmail: "Facturas Gmail",
  assistant: "Copiloto",
  invoice_ai: "Lectura IA de facturas",
  document_ai: "Consulta IA de documentos",
  trailers: "Remolques",
  customers: "Clientes",
  trips: "Viajes",
  maintenance: "Mantenimiento",
  fuel: "Combustible",
  deadlines: "Vencimientos",
  alerts: "Alertas",
  team: "Usuarios de empresa",
} as const;
export type Feature = keyof typeof featureLabels;
export type Features = Record<Feature, boolean>;
export const demoFeatures = Object.fromEntries(
  Object.keys(featureLabels).map((k) => [k, true]),
) as Features;
export const noFeatures = Object.fromEntries(
  Object.keys(featureLabels).map((k) => [k, false]),
) as Features;
export interface Plan {
  id: "limited" | "full";
  name: string;
  monthly_cents: number;
  currency: "EUR";
  max_trucks: number | null;
  modules: Features;
  revision: number;
  published?: boolean;
}
export interface Catalog {
  app_name: string;
  trial_days: number;
  prices_are_examples: boolean;
  payments_enabled: boolean;
  sms_ready: boolean;
  registration_open: boolean;
  plans: Plan[];
}
export const subscriptionVatBasisPoints = 2100;
/** Prices are net euro cents; round VAT once before adding it to the base. */
export function subscriptionPrice(netCents: number) {
  if (!Number.isSafeInteger(netCents) || netCents < 0 || netCents > 100000000)
    throw new Error("Precio mensual no válido");
  const vatCents = Math.floor(
    (netCents * subscriptionVatBasisPoints + 5000) / 10000,
  );
  return { netCents, vatCents, totalCents: netCents + vatCents };
}
export const exampleCatalog: Catalog = {
  app_name: "TruckControl AI",
  trial_days: 10,
  prices_are_examples: false,
  payments_enabled: false,
  sms_ready: false,
  registration_open: true,
  plans: [
    {
      id: "limited",
      name: "Básico",
      monthly_cents: 30000,
      currency: "EUR",
      max_trucks: 50,
      modules: {
        ...demoFeatures,
        invoice_ai: false,
      },
      revision: 1,
    },
    {
      id: "full",
      name: "Full",
      published: true,
      monthly_cents: 70000,
      currency: "EUR",
      max_trucks: 50,
      modules: { ...demoFeatures },
      revision: 1,
    },
  ],
};
export const registrationSchema = z.object({
  contact_name: z.string().trim().min(2).max(100),
  company_name: z.string().trim().min(2).max(100),
  tax_id: z.string().trim().min(3).max(30),
  address: z.string().trim().min(5).max(240),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+[1-9][0-9]{7,14}$/,
      "Incluye el prefijo internacional, por ejemplo +34.",
    ),
  requested_plan: z.enum(["limited", "full"]),
});
export type Registration = z.infer<typeof registrationSchema>;
export interface Customer extends Registration {
  user_id: string;
  email: string;
  paid_plan: Plan["id"] | null;
  status: "trial" | "active" | "suspended";
  trial_started_at: string;
  trial_ends_at: string;
  paid_until: string | null;
  ai_allowed: boolean;
  ai_opt_in: boolean;
  module_overrides: Partial<Features>;
  created_at: string;
  updated_at: string;
}
export interface SubscriptionAccess {
  is_admin: boolean;
  active: boolean;
  features: Features;
  profile: Customer | null;
  plan: string;
  max_trucks: number | null;
  sms_ready: boolean;
  requires_phone_verification?: boolean;
  company_role?: "owner" | "admin" | "operator" | "viewer";
  can_write?: boolean;
  can_manage?: boolean;
  organization_id?: string;
  prices_are_examples: boolean;
  payments_enabled: boolean;
}
export interface PaymentRequest {
  id: string;
  user_id: string;
  plan_id: Plan["id"];
  quoted_cents: number;
  net_cents?: number | null;
  vat_rate_bps?: number | null;
  vat_cents?: number | null;
  plan_revision: number;
  currency: string;
  status: string;
  created_at: string;
}
export interface AdminSnapshot {
  settings: {
    prices_are_examples: boolean;
    payments_enabled: boolean;
    sms_ready: boolean;
    registration_open: boolean;
  };
  pending_registrations: {
    id: string;
    email: string;
    company_name: string | null;
    email_confirmed: boolean;
    phone_confirmed: boolean;
  }[];
  plans: Plan[];
  modules: { id: Feature; label: string; enabled: boolean }[];
  customers: Customer[];
  payment_requests: PaymentRequest[];
  audit: {
    id: string;
    actor_id: string;
    action: string;
    target_id: string | null;
    created_at: string;
    details: unknown;
  }[];
}
/** Device clocks are only used to display a countdown, never to grant access. */
export function trialDaysLeft(until: string, now = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(until) - now) / 86400000));
}
export function accountLabel(customer: Customer, now = Date.now()) {
  if (customer.status === "suspended") return "Suspendida";
  if (customer.status === "active")
    return customer.paid_until && Date.parse(customer.paid_until) > now
      ? "Activa"
      : "Pago pendiente";
  const days = trialDaysLeft(customer.trial_ends_at, now);
  return days ? `Prueba · ${days} días` : "Prueba finalizada";
}
export const commercialEnabled = () =>
  import.meta.env.VITE_COMMERCIAL_MODE === "true";
