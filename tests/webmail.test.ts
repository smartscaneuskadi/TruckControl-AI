import { describe, expect, it } from "vitest";
import { webmailUrl } from "../src/domain/webmail";

describe("enlaces del espacio de correo", () => {
  it("admite webmail HTTPS de dominio propio", () => {
    expect(webmailUrl(" https://correo.example.com/login ")).toBe(
      "https://correo.example.com/login",
    );
  });
  it.each([
    "javascript:alert(1)",
    "http://mail.example.com",
    "https://user:secret@mail.example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "https://mail.local",
    "https://mail.example.com:9443",
    "dirección inválida",
  ])("rechaza destino inseguro %s", (value) => {
    expect(webmailUrl(value)).toBeNull();
  });
});
