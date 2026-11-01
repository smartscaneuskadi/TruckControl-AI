import { describe, expect, it, vi } from "vitest";
import { createAiRuntimeResolver } from "../../../supabase/functions/_shared/ai-runtime.ts";
const key = "sk-test-" + "x".repeat(40);
const context = {
  organization_id: "c1000000-0000-4000-8000-000000000001",
  user_id: "c1000000-0000-4000-8000-000000000002",
  kind: "invoice" as const,
};
const id = "c1000000-0000-4000-8000-000000000003";
function setup(
  options: {
    enabled?: boolean;
    value?: string;
    failBudget?: boolean;
    transport?: typeof fetch;
    failSettlement?: boolean;
  } = {},
) {
  const budget = vi.fn(async (action: string) => {
    if (action === "settle" && options.failSettlement) throw Error("offline");
    return action === "reserve"
      ? options.failBudget
        ? null
        : { id }
      : { settled: true };
  });
  const transport =
    options.transport ??
    vi.fn(async () =>
      Response.json({
        status: "completed",
        usage: { input_tokens: 1000, output_tokens: 100 },
      }),
    );
  const runtime = createAiRuntimeResolver(
    {
      config: async () => ({
        api_key: options.value ?? key,
        enabled: options.enabled ?? true,
        model: "gpt-6-luna",
        monthly_budget_cents: 1000,
      }),
      budget,
    },
    undefined,
    transport as typeof fetch,
  );
  return { runtime, transport, budget };
}
const request = (overrides: object = {}) => ({
  method: "POST",
  body: JSON.stringify({
    model: "gpt-6-luna",
    store: false,
    max_output_tokens: 1200,
    input: "Fictitious invoice",
    ...overrides,
  }),
});
describe("activación IA con credenciales privadas y límite global", () => {
  it("la disponibilidad publica solo dos booleanos y no habilita consumo por tener una clave", async () => {
    const { runtime, budget, transport } = setup({ enabled: false });
    expect(await runtime.health()).toEqual({
      configured: true,
      enabled: false,
    });
    expect(JSON.stringify(await runtime.health())).not.toContain(key);
    expect(await runtime.resolve(context)).toBeUndefined();
    expect(budget).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it("un placeholder o clave mal pegada deja cerrada la integración", async () => {
    const { runtime } = setup({ value: "pending" });
    expect(await runtime.health()).toEqual({
      configured: false,
      enabled: false,
    });
    expect(await runtime.resolve(context)).toBeUndefined();
  });
  it("admite la clave guardada en secretos de funciones sin exponerla", async () => {
    const runtime = createAiRuntimeResolver(
      { config: async () => null, budget: vi.fn() },
      key,
    );
    expect(await runtime.health()).toEqual({
      configured: true,
      enabled: false,
    });
    expect(await runtime.resolve(context)).toBeUndefined();
  });
  it("reserva para la empresa y usuario correctos antes de llamar; fija la tarifa estándar", async () => {
    const { runtime, budget, transport } = setup();
    const ai = (await runtime.resolve(context))!;
    await ai.fetcher!(
      "https://api.openai.com/v1/responses",
      request({ service_tier: "priority" }),
    );
    expect(budget.mock.calls[0]).toEqual([
      "reserve",
      { ...context, model: "gpt-6-luna" },
    ]);
    expect(budget.mock.invocationCallOrder[0]).toBeLessThan(
      (transport as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
    const init = (transport as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(init.body)).toMatchObject({
      store: false,
      service_tier: "default",
      reasoning: { effort: "none" },
      max_output_tokens: 1200,
    });
    expect(init.redirect).toBe("error");
    expect(budget.mock.calls[1]).toEqual([
      "settle",
      { id, input_tokens: 1000, output_tokens: 100 },
    ]);
  });
  it("denegar presupuesto no hace ninguna petición al modelo", async () => {
    const { runtime, transport } = setup({ failBudget: true });
    const ai = (await runtime.resolve(context))!;
    await expect(
      ai.fetcher!("https://api.openai.com/v1/responses", request()),
    ).rejects.toThrow("budget");
    expect(transport).not.toHaveBeenCalled();
  });
  it("rechaza destinos, modelos, herramientas y límites no autorizados antes de reservar", async () => {
    const { runtime, budget } = setup();
    const ai = (await runtime.resolve(context))!;
    await expect(
      ai.fetcher!("https://foreign.example/", request()),
    ).rejects.toThrow("Unsupported");
    for (const data of [
      { tools: [] },
      { model: "another-model" },
      { max_output_tokens: 1201 },
      { store: true },
      { background: true },
      { stream: true },
    ])
      await expect(
        ai.fetcher!("https://api.openai.com/v1/responses", request(data)),
      ).rejects.toThrow("Unsupported");
    expect(budget).not.toHaveBeenCalled();
  });
  it("una respuesta perdida mantiene la reserva y nunca repite el cargo", async () => {
    const transport = vi.fn(async () => {
      throw Error("timeout");
    });
    const { runtime, budget } = setup({ transport: transport as typeof fetch });
    const ai = (await runtime.resolve(context))!;
    await expect(
      ai.fetcher!("https://api.openai.com/v1/responses", request()),
    ).rejects.toThrow("timeout");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(budget).toHaveBeenCalledTimes(1);
  });
  it("el uso desconocido o fuera del máximo no libera una reserva", async () => {
    for (const usage of [
      undefined,
      { input_tokens: -1, output_tokens: 10 },
      { input_tokens: 10, output_tokens: 1201 },
    ]) {
      const transport = vi.fn(async () => Response.json({ usage }));
      const { runtime, budget } = setup({
        transport: transport as typeof fetch,
      });
      const ai = (await runtime.resolve(context))!;
      await ai.fetcher!("https://api.openai.com/v1/responses", request());
      expect(budget).toHaveBeenCalledTimes(1);
    }
  });
  it("una liquidación perdida conserva la respuesta y no provoca otra llamada", async () => {
    const { runtime, transport } = setup({ failSettlement: true });
    const ai = (await runtime.resolve(context))!;
    expect(
      (await ai.fetcher!("https://api.openai.com/v1/responses", request())).ok,
    ).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
