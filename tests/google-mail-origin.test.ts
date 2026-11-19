import { describe, expect, it } from "vitest";
import {
  googleMailEntryUrl,
  googleMailOriginAllowed,
} from "../src/integrations/personal-mail/google-auth";

describe("Gmail JavaScript origin boundary", () => {
  it("uses the registered public origin and a fixed mailbox entry without personal parameters", () => {
    const entry = new URL(googleMailEntryUrl);
    expect(googleMailOriginAllowed(entry.origin)).toBe(true);
    expect(entry.origin).toBe("https://truckcontrolai.com");
    expect(entry.hash).toBe("#/mailbox");
    expect(entry.search).toBe("");
    expect(entry.username + entry.password).toBe("");
  });
  it.each([
    "https://www.truckcontrolai.com",
    "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
    "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
    "http://truckcontrolai.com",
    "https://truckcontrolai.com:8443",
    "https://truckcontrolai.com.attacker.invalid",
    "https://truckcontrolai.com@attacker.invalid",
    "https://localhost.attacker.invalid",
    "https://truckcontrolai.com/#/mailbox?token=private",
    "file:///mailbox",
    "javascript:alert(1)",
    "null",
    "",
  ])("does not launch the real OAuth popup from %s", (origin) => {
    expect(googleMailOriginAllowed(origin)).toBe(false);
  });
  it.each([
    "http://localhost:5173",
    "https://localhost",
    "http://127.0.0.1:4228",
    "http://[::1]:5173",
  ])(
    "retains isolated loopback development and test previews (%s)",
    (origin) => {
      expect(googleMailOriginAllowed(origin)).toBe(true);
    },
  );
});
