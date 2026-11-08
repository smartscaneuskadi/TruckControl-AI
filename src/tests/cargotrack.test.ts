import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CargoTrack, CARGOTRACK_LOGIN_URL } from "../pages/CargoTrack";

describe("CargoTrack access", () => {
  it("uses the official HTTPS login URL", () => {
    expect(CARGOTRACK_LOGIN_URL).toBe("https://on7.cargotrack.ro/signin");
  });
  it("renders an external secure link without a password form or iframe", () => {
    const html = renderToStaticMarkup(CargoTrack());
    expect(html).toContain("Entrar en CargoTrack");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("https://on7.cargotrack.ro/signin");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('type="password"');
  });
});
