import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectIsolatedCandidate } from "../scripts/verify-isolated-candidate.mjs";

const sha = "a".repeat(40);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "truckcontrol-candidate-"));
  mkdirSync(join(root, "icons"));
  const release = {
    app: "TruckControl AI", version: "0.5.21-rc.1", channel: "candidate",
    sourceCommit: sha, sourceDirty: false,
    registrationForcedClosed: true, companyConnectionBundled: false
  };
  const manifest = {
    id: "/", start_url: "/", scope: "/",
    icons: [{ src: "/icons/icon-192.png" }, { src: "/icons/icon-512.png" }]
  };
  writeFileSync(join(root, "release.json"), JSON.stringify(release));
  writeFileSync(join(root, "manifest.webmanifest"), JSON.stringify(manifest));
  writeFileSync(join(root, "index.html"),
    '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">');
  writeFileSync(join(root, "sw.js"), 'addEventListener("fetch",()=>{});');
  writeFileSync(join(root, "icons/icon-192.png"), "fake png 192");
  writeFileSync(join(root, "icons/icon-512.png"), "fake png 512");
  return { root, release, manifest };
}
function withFixture(fn) {
  const value = fixture();
  try { return fn(value); }
  finally { rmSync(value.root, { recursive: true, force: true }); }
}

test("accepts a correctly isolated candidate and hashes every file", () => withFixture(({ root }) => {
  const result = inspectIsolatedCandidate(root, sha);
  assert.equal(result.fileCount, 6);
  assert.equal(result.sourceCommit, sha);
  assert.ok(result.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
}));

test("rejects bundling a company connection even with candidate label", () => withFixture(({ root, release }) => {
  writeFileSync(join(root, "release.json"), JSON.stringify({ ...release, companyConnectionBundled: true }));
  assert.throws(() => inspectIsolatedCandidate(root, sha), /company connection/);
}));

test("rejects registration accidentally enabled", () => withFixture(({ root, release }) => {
  writeFileSync(join(root, "release.json"), JSON.stringify({ ...release, registrationForcedClosed: false }));
  assert.throws(() => inspectIsolatedCandidate(root, sha), /registration/);
}));

test("rejects dirty or mismatched source provenance", () => withFixture(({ root, release }) => {
  writeFileSync(join(root, "release.json"), JSON.stringify({ ...release, sourceDirty: true }));
  assert.throws(() => inspectIsolatedCandidate(root, sha), /uncommitted source/);
  writeFileSync(join(root, "release.json"), JSON.stringify({ ...release, sourceCommit: "b".repeat(40) }));
  assert.throws(() => inspectIsolatedCandidate(root, sha), /commit provenance/);
}));

test("rejects missing noindex even when bundle is isolated", () => withFixture(({ root }) => {
  writeFileSync(join(root, "index.html"), '<meta name="referrer" content="no-referrer">');
  assert.throws(() => inspectIsolatedCandidate(root, sha), /noindex/);
}));

test("rejects a manifest that escapes the candidate root", () => withFixture(({ root, manifest }) => {
  writeFileSync(join(root, "manifest.webmanifest"), JSON.stringify({ ...manifest, scope: "/admin/" }));
  assert.throws(() => inspectIsolatedCandidate(root, sha), /scope/);
}));

test("rejects a missing PWA icon", () => withFixture(({ root, manifest }) => {
  writeFileSync(join(root, "manifest.webmanifest"), JSON.stringify({
    ...manifest, icons: [...manifest.icons, { src: "/icons/missing.png" }]
  }));
  assert.throws(() => inspectIsolatedCandidate(root, sha), /missing PWA icon/);
}));
