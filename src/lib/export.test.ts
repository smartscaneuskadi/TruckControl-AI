import { describe, expect, it } from "vitest";
import { csvCell, makeCsv } from "./export";

describe("exportación para hojas de cálculo", () => {
  it("escapa comillas y separadores", () =>
    expect(makeCsv([["Bilbao; Madrid", 'Ruta "demo"']])).toBe(
      '\uFEFF"Bilbao; Madrid";"Ruta ""demo"""',
    ));
  it.each([
    '=HYPERLINK("https://example.com")',
    "+SUM(A1)",
    "@SUM(A1)",
    " -1+1",
    "\t=1",
  ])("neutraliza fórmulas introducidas en campos de texto", (text) =>
    expect(csvCell(text)).toContain("\"'"),
  );
  it("conserva importes negativos numéricos en un informe", () =>
    expect(csvCell(-120)).toBe('"-120"'));
});
