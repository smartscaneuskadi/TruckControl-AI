import { describe, expect, it } from "vitest";
import { createFutureSupabaseClient } from "./client";
const key = "sb_publishable_synthetic_test_only";
describe("destino independiente de TruckControl", () => {
  it("rechaza otro proyecto, credenciales incrustadas y URL ambiguas antes de crear un cliente", () => {
    for (const url of [
      "https://epbmoqmoavresqnhhguy.supabase.co",
      "https://other.supabase.co",
      "https://example.com",
      "https://user@kkkemaycedexymrpaqtp.supabase.co",
      "https://kkkemaycedexymrpaqtp.supabase.co/path",
      "https://kkkemaycedexymrpaqtp.supabase.co?project=other",
      "https://kkkemaycedexymrpaqtp.supabase.co#other",
    ]) {
      expect(() => createFutureSupabaseClient(url, key)).toThrow(
        /independiente/,
      );
    }
  });
  it("acepta el proyecto autorizado y permite el servidor local de pruebas sin enviar solicitudes", async () => {
    for (const url of [
      "https://kkkemaycedexymrpaqtp.supabase.co",
      "http://127.0.0.1:9999",
    ]) {
      const client = createFutureSupabaseClient(url, key);
      await client.auth.stopAutoRefresh();
      expect(client).toBeDefined();
    }
  });
  it("rechaza claves de servidor y el proyecto autorizado por HTTP", () => {
    expect(() =>
      createFutureSupabaseClient(
        "https://kkkemaycedexymrpaqtp.supabase.co",
        "service_role_synthetic",
      ),
    ).toThrow(/publicable/);
    expect(() =>
      createFutureSupabaseClient(
        "http://kkkemaycedexymrpaqtp.supabase.co",
        key,
      ),
    ).toThrow();
  });
});
