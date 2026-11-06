import { z } from "zod";

export const fiscalOptions = {
  ticketbai: {
    label: "TicketBAI",
    description:
      "Álava, Bizkaia o Gipuzkoa, con el software garante y la conexión de tu empresa.",
  },
  verifactu: {
    label: "VERI*FACTU · AEAT",
    description:
      "Preparación para un sistema de facturación verificable, cuando sea aplicable a tu empresa.",
  },
  no_verifactu: {
    label: "SIF NO VERI*FACTU · AEAT",
    description:
      "Requiere un programa compatible con esta modalidad y sus requisitos de registros, firma y conservación.",
  },
  external: {
    label: "Programa externo / otro régimen",
    description:
      "Tu programa habitual y los supuestos que requieren otra integración, como Navarra o SII. Su aplicación debe comprobarse con tu asesoría.",
  },
  facturae: {
    label: "Formato Facturae",
    description:
      "Formato electrónico adicional. La firma y entrega a FACe requieren una conexión compatible.",
  },
} as const;
export const fiscalTerritories = {
  araba: "Álava / Araba",
  bizkaia: "Bizkaia",
  gipuzkoa: "Gipuzkoa",
} as const;
export const fiscalPolicyInputSchema = z
  .strictObject({
    enabled: z.boolean(),
    options: z.strictObject({
      ticketbai: z.boolean(),
      verifactu: z.boolean(),
      no_verifactu: z.boolean(),
      external: z.boolean(),
      facturae: z.boolean(),
    }),
  })
  .refine(
    (v) =>
      !v.enabled ||
      v.options.ticketbai ||
      v.options.verifactu ||
      v.options.no_verifactu ||
      v.options.external,
    {
      message:
        "Permite al menos una opción de facturación antes de habilitar la configuración.",
    },
  );
export type FiscalPolicyInput = z.infer<typeof fiscalPolicyInputSchema>;
export const disabledFiscalPolicy: FiscalPolicyInput = {
  enabled: false,
  options: {
    ticketbai: false,
    verifactu: false,
    no_verifactu: false,
    external: false,
    facturae: false,
  },
};
export const fiscalProfileInputSchema = z
  .strictObject({
    regime: z.enum(["ticketbai", "verifactu", "no_verifactu", "external"]),
    territory: z.enum(["araba", "bizkaia", "gipuzkoa"]).nullable(),
    document_format: z.enum(["pdf", "facturae"]),
  })
  .refine(
    (v) =>
      v.regime === "ticketbai" ? v.territory !== null : v.territory === null,
    {
      message:
        "TicketBAI requiere un territorio. Las demás opciones no utilizan territorio TicketBAI.",
    },
  );
export type FiscalProfileInput = z.infer<typeof fiscalProfileInputSchema>;
const version = z.number().int().positive();
const stamp = z.iso.datetime({ offset: true });
export const companyFiscalStateSchema = z.strictObject({
  schema_version: z.literal(1),
  phase: z.literal("preparation"),
  emission_available: z.literal(false),
  organization_id: z.uuid(),
  organization_name: z.string().max(240),
  policy: z
    .object({
      enabled: z.boolean(),
      options: z.strictObject({
        ticketbai: z.boolean(),
        verifactu: z.boolean(),
        no_verifactu: z.boolean(),
        external: z.boolean(),
        facturae: z.boolean(),
      }),
      version: version.nullable(),
      updated_at: stamp.nullable(),
    })
    .strict(),
  profile: z
    .object({
      regime: z.enum(["ticketbai", "verifactu", "no_verifactu", "external"]),
      territory: z.enum(["araba", "bizkaia", "gipuzkoa"]).nullable(),
      document_format: z.enum(["pdf", "facturae"]),
      version,
      updated_at: stamp,
    })
    .strict()
    .nullable(),
  configured_option_allowed: z.boolean(),
});
export type CompanyFiscalState = z.infer<typeof companyFiscalStateSchema>;
export const companyFiscalPageSchema = z.strictObject({
  items: z.array(companyFiscalStateSchema).max(50),
  next_cursor: z.uuid().nullable(),
});
export type CompanyFiscalPage = z.infer<typeof companyFiscalPageSchema>;

export function validateFiscalProfile(
  value: unknown,
  policy: FiscalPolicyInput,
): FiscalProfileInput {
  const profile = fiscalProfileInputSchema.parse(value);
  if (
    !policy.enabled ||
    !policy.options[profile.regime] ||
    (profile.document_format === "facturae" && !policy.options.facturae)
  )
    throw Error(
      "La administración no ha permitido esta opción para tu empresa.",
    );
  return profile;
}
