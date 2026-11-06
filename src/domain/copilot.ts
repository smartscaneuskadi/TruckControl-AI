import { z } from "zod";
import { truckSchema, driverSchema, entrySchema } from "./models";
import { operationSchemas, operationLabels } from "./operations";
export const entitySchema = z.enum([
  "truck",
  "driver",
  "income",
  "expense",
  "trailers",
  "customers",
  "trips",
  "maintenance",
  "fuel",
  "deadlines",
  "alerts",
]);
export type CopilotEntity = z.infer<typeof entitySchema>;
export const copilotLabels: Record<CopilotEntity, string> = {
  truck: "Camión",
  driver: "Conductor",
  income: "Ingreso",
  expense: "Gasto",
  ...operationLabels,
};
const uuid = z.uuid(),
  stamp = z.iso.datetime({ offset: true });
const fields = z.record(z.string().max(60), z.unknown());
export const copilotActionSchema = z
  .strictObject({
    id: uuid,
    organization_id: uuid,
    entity: entitySchema,
    mode: z.enum(["create", "update"]),
    record_id: uuid,
    fields,
    previous: fields.nullable(),
    expected_version: z.number().int().positive().nullable(),
    state: z.enum(["pending", "applied", "cancelled"]),
    created_at: stamp,
    expires_at: stamp,
    applied_at: stamp.nullable(),
  })
  .superRefine((a, context) => {
    if (
      a.mode === "create"
        ? a.previous !== null || a.expected_version !== null
        : a.previous === null || a.expected_version === null
    )
      context.addIssue({
        code: "custom",
        message: "Identidad de propuesta no válida",
      });
    if ((a.state === "applied") !== (a.applied_at !== null))
      context.addIssue({
        code: "custom",
        message: "Confirmación de guardado no válida",
      });
    try {
      const check = (data: Record<string, unknown>) => {
        if (a.entity === "truck")
          return truckSchema.strict().parse({ ...data, id: a.record_id });
        if (a.entity === "driver")
          return driverSchema.strict().parse({ ...data, id: a.record_id });
        if (a.entity === "income" || a.entity === "expense")
          return entrySchema
            .strict()
            .parse({ ...data, id: a.record_id, kind: a.entity });
        return operationSchemas[a.entity].strict().parse(data);
      };
      if (
        Object.keys(a.fields).some((k) =>
          ["id", "organization_id", "user_id", "row_version", "kind"].includes(
            k,
          ),
        )
      )
        throw Error("Campo protegido");
      check(a.fields);
      if (a.previous) check(a.previous);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Los datos de la propuesta no son válidos",
      });
    }
  });
export type CopilotAction = z.infer<typeof copilotActionSchema>;
export const copilotStatusSchema = z.strictObject({
  schema_version: z.literal(1),
  organization_id: uuid,
  allowed: z.boolean(),
  can_write: z.boolean(),
  configured: z.boolean(),
});
export type CopilotStatus = z.infer<typeof copilotStatusSchema>;
export const copilotTurnSchema = z
  .strictObject({
    request_id: uuid,
    organization_id: uuid,
    state: z.enum(["pending", "complete", "failed"]),
    reply: z.string().min(1).max(6000).nullable(),
    actions: z.array(copilotActionSchema).max(3),
  })
  .superRefine((t, c) => {
    if (
      (t.state === "complete") !== (t.reply !== null) ||
      (t.state !== "complete" && t.actions.length)
    )
      c.addIssue({
        code: "custom",
        message: "Respuesta de consulta no confirmada",
      });
    if (
      new Set(t.actions.map((a) => a.id)).size !== t.actions.length ||
      t.actions.some((a) => a.organization_id !== t.organization_id)
    )
      c.addIssue({ code: "custom", message: "Propuesta fuera de empresa" });
  });
export type CopilotTurn = z.infer<typeof copilotTurnSchema>;
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export function conversationInput(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-20).map((m) => ({
    role: m.role,
    content:
      m.content.length > 2000
        ? m.content.slice(0, 1950) + "\n[Respuesta anterior abreviada]"
        : m.content,
  }));
  const encoder = new TextEncoder();
  while (
    recent.length > 1 &&
    encoder.encode(JSON.stringify(recent)).length > 24000
  )
    recent.shift();
  return recent;
}
export function changedCopilotFields(action: CopilotAction) {
  return Object.entries(action.fields).filter(
    ([key, value]) =>
      action.mode === "create" ||
      JSON.stringify(action.previous?.[key]) !== JSON.stringify(value),
  );
}
