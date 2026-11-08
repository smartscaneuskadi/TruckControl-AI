/** Audit a disconnected PWA candidate before archiving; no network or deploy. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function requireThat(condition, message) {
  if (!condition) throw new Error("Unsafe candidate: " + message);
}

/** Return a reviewable SHA256 inventory without writing to the build directory. */
export function inspectIsolatedCandidate(root, expectedCommit) {
  requireThat(/^[a-f0-9]{40}$/.test(expectedCommit ?? ""), "expected commit SHA missing");
  const dir = resolve(root);
  requireThat(existsSync(dir) && lstatSync(dir).isDirectory(), "build directory missing");
  const files = [];
  function walk(current) {
    for (const name of readdirSync(current).sort()) {
      const absolute = resolve(current, name);
      const nameInDist = relative(dir, absolute).split(sep).join("/");
      requireThat(nameInDist && !nameInDist.startsWith("../") && !nameInDist.startsWith("/"), "path escaped build directory");
      const stat = lstatSync(absolute);
      requireThat(!stat.isSymbolicLink(), "symlink not permitted: " + nameInDist);
      if (stat.isDirectory()) walk(absolute);
      else {
        requireThat(stat.isFile(), "non-file output: " + nameInDist);
        requireThat(stat.size > 0, "empty output: " + nameInDist);
        files.push({
          path: nameInDist,
          bytes: stat.size,
          sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex")
        });
      }
    }
  }
  walk(dir);
  const names = new Set(files.map((entry) => entry.path));
  for (const file of ["index.html", "release.json", "manifest.webmanifest", "sw.js"])
    requireThat(names.has(file), file + " is missing");
  const release = JSON.parse(readFileSync(resolve(dir, "release.json"), "utf8"));
  requireThat(release.app === "TruckControl AI", "unexpected app identity");
  requireThat(release.sourceCommit === expectedCommit, "commit provenance mismatch");
  requireThat(release.sourceDirty === false, "uncommitted source present");
  requireThat(release.channel === "candidate", "wrong release channel");
  requireThat(release.registrationForcedClosed === true, "registration is not forced closed");
  requireThat(release.companyConnectionBundled === false, "company connection is bundled");
  const html = readFileSync(resolve(dir, "index.html"), "utf8");
  requireThat(/<meta\s+[^>]*name=["']robots["'][^>]*content=["']noindex,nofollow["']/i.test(html), "noindex/nofollow missing");
  requireThat(/<meta\s+[^>]*name=["']referrer["'][^>]*content=["']no-referrer["']/i.test(html), "referrer protection missing");
  const manifest = JSON.parse(readFileSync(resolve(dir, "manifest.webmanifest"), "utf8"));
  requireThat(manifest.id === "/" && manifest.scope === "/" && manifest.start_url === "/", "PWA scope, id or entrypoint differs from isolated root");
  requireThat(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "PWA icons missing");
  for (const icon of manifest.icons) {
    requireThat(typeof icon.src === "string" && /^\/[A-Za-z0-9/_-]+\.png$/.test(icon.src), "invalid PWA icon path");
    requireThat(names.has(icon.src.slice(1)), "missing PWA icon " + icon.src);
  }
  return {
    schema: "truckcontrol-isolated-candidate-sha256-v1",
    sourceCommit: release.sourceCommit,
    appVersion: release.version,
    channel: release.channel,
    registrationForcedClosed: true,
    companyConnectionBundled: false,
    fileCount: files.length,
    files,
    checks: ["exact commit", "clean source", "candidate-only", "registration disabled", "no company connection", "robots/referrer", "PWA manifest+SW+icons", "SHA256 inventory"],
    limitations: "Archive only. No URL, HTTPS, operator consent, Stripe, TicketBAI, physical device or production deployment acceptance."
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const inventory = inspectIsolatedCandidate(process.argv[2] || "dist", commit);
  process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");
}
