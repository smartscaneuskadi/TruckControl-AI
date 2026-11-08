import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CargoTrack,
  CARGOTRACK_LOGIN_URL,
  CARGOTRACK_FRAME_SANDBOX,
} from "../pages/CargoTrack";

describe("CargoTrack access", () => {
  it("uses the official HTTPS login URL", () => {
    expect(CARGOTRACK_LOGIN_URL).toBe("https://on7.cargotrack.ro/signin");
  });
  it("waits for an explicit action and never starts a new tab or collects credentials", () => {
    const html = renderToStaticMarkup(createElement(CargoTrack));
    expect(html).toContain("Entrar en CargoTrack");
    expect(html).toContain('type="button"');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('type="password"');
  });
  it("keeps inactive views hidden and blocks opening an offline company copy", () => {
    const inactive = renderToStaticMarkup(
      createElement(CargoTrack, { active: false, available: false }),
    );
    expect(inactive).toBe("");
    const html = renderToStaticMarkup(
      createElement(CargoTrack, { available: false }),
    );
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("<iframe");
  });
  it("allows provider login without letting the frame navigate TruckControl", () => {
    const tokens = CARGOTRACK_FRAME_SANDBOX.split(" ");
    expect(tokens).toEqual(
      expect.arrayContaining([
        "allow-forms",
        "allow-scripts",
        "allow-same-origin",
      ]),
    );
    expect(
      tokens.some((token) => token.startsWith("allow-top-navigation")),
    ).toBe(false);
  });
});
