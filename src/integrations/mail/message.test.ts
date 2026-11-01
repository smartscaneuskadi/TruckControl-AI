import { describe, expect, it, vi } from "vitest";
import { base64 } from "../../../supabase/functions/_shared/invoice.ts";
import {
  cleanMailText,
  fictitiousEmail,
  MAX_MAIL_BYTES,
  parseMailFile,
} from "../../../supabase/functions/_shared/mail.ts";

const pdf = new TextEncoder().encode("%PDF-1.4\nFICTITIOUS DOCUMENT\n%%EOF");
function email(
  parts: {
    name: string;
    bytes: Uint8Array;
    disposition?: string;
    type?: string;
  }[],
  subject = "Factura",
) {
  return new TextEncoder().encode(
    [
      "From: demo@example.com",
      "Subject: " + subject,
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="test-mail"',
      "",
      ...parts.flatMap((p) => [
        "--test-mail",
        "Content-Type: " + (p.type ?? "application/pdf"),
        "Content-Disposition: " +
          (p.disposition ?? "attachment") +
          '; filename="' +
          p.name +
          '"',
        "Content-Transfer-Encoding: base64",
        "",
        base64(p.bytes),
      ]),
      "--test-mail--",
      "",
    ].join("\r\n"),
  );
}
describe("importación de correo de cualquier proveedor", () => {
  it("lee el correo ficticio y conserva únicamente el PDF, sin inventar importes", async () => {
    const parsed = await parseMailFile(fictitiousEmail(), "prueba.eml");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      type: "application/pdf",
      name: "Factura-ficticia.pdf",
    });
    expect(parsed.messageId).toMatch(/^eml:[a-f0-9]{64}$/);
    expect(Object.keys(parsed)).not.toContain("html");
    expect(Object.keys(parsed)).not.toContain("total_cents");
  });
  it("usa la firma del archivo y neutraliza nombres con rutas o extensión engañosa", async () => {
    const parsed = await parseMailFile(pdf, "../../factura.exe");
    expect(parsed.attachments[0].name).toBe("factura.exe.pdf");
    expect(parsed.attachments[0].type).toBe("application/pdf");
    expect(cleanMailText("factura\u202etxt\u0000")).not.toMatch(
      /[\u202e\u0000]/,
    );
  });
  it("descarta imágenes insertadas, ejecutables y duplicados de contenido", async () => {
    const parsed = await parseMailFile(
      email([
        { name: "factura.pdf", bytes: pdf },
        { name: "otra-copia.pdf", bytes: pdf },
        { name: "logo.pdf", bytes: pdf, disposition: "inline" },
        { name: "falso.pdf", bytes: new TextEncoder().encode("MZ executable") },
      ]),
      "desde-cualquier-buzon.eml",
    );
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.skipped).toBe(3);
  });
  it("no sigue enlaces ni ejecuta el cuerpo HTML", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const raw = email(
      [{ name: "factura.pdf", bytes: pdf }],
      '<img src="https://evil.example/track">',
    );
    const result = await parseMailFile(raw, "mensaje.eml");
    expect(result.attachments).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });
  it("rechaza correos sin documentos compatibles y entradas demasiado grandes", async () => {
    await expect(
      parseMailFile(
        new TextEncoder().encode("Subject: Sin factura\r\n\r\nSolo texto"),
        "sin-facturas.eml",
      ),
    ).rejects.toThrow("No hay facturas");
    await expect(
      parseMailFile(new Uint8Array(MAX_MAIL_BYTES + 1), "grande.eml"),
    ).rejects.toThrow("10 MB");
  });
  it("limita cinco adjuntos y no hace una importación parcial silenciosa", async () => {
    const raw = email(
      Array.from({ length: 6 }, (_, i) => ({
        name: "f" + i + ".pdf",
        bytes: new TextEncoder().encode("%PDF-1.4\n" + i),
      })),
    );
    await expect(parseMailFile(raw, "demasiados.eml")).rejects.toThrow(
      "cinco documentos",
    );
  });
  it("rechaza cabeceras y estructuras MIME que agotan los límites", async () => {
    const raw = new TextEncoder().encode(
      "Subject: " + "x".repeat(70 * 1024) + "\r\n\r\nBody",
    );
    await expect(parseMailFile(raw, "cabeceras.eml")).rejects.toThrow(
      "límites de estructura",
    );
  });
});
