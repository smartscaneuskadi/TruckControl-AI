import { describe, expect, it } from "vitest";
import { CARGOTRACK_LOGIN_URL } from "../pages/CargoTrack";
import { readFileSync } from "node:fs";

describe("CargoTrack access", () => {
  it("uses the official HTTPS login URL", () => {
    expect(CARGOTRACK_LOGIN_URL).toBe("https://on7.cargotrack.ro/signin");
  });
  it("is present in navigation and routing", () => {
    const app = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
    expect(app).toContain('to: "/cargotrack"');
    expect(app).toContain('path="/cargotrack"');
    expect(app).toContain("<CargoTrack />");
  });
  it("opens the provider in an isolated browser tab without capturing credentials", () => {
    const page = readFileSync(new URL("../pages/CargoTrack.tsx", import.meta.url), "utf8");
    expect(page).toContain('target="_blank"');
    expect(page).toContain('rel="noopener noreferrer"');
    expect(page).not.toContain("<iframe");
    expect(page).not.toContain('type="password"');
  });
});
