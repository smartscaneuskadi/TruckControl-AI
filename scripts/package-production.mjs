import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
const siteId = "appgprj_6ae655e56db481918fe18adfe9df8b66";
const origin = "https://truckcontrolai.com";
const supabase = "https://kkkemaycedexymrpaqtp.supabase.co";
const expectedBaseline = "5c954703c2d858add18501fef15efce6f1504bc9";
const root = resolve(".");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("Missing exact source commit.");
if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
  throw Error("Production package requires a clean source checkout.");
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sha)
  throw Error("Actions is not building the declared source commit.");
const hosting = JSON.parse(readFileSync(".openai/hosting.json", "utf8"));
if (hosting.project_id !== siteId || hosting.static?.directory !== "dist")
  throw Error("Wrong production identity; the demo must never be used.");
async function getText(url, maxBytes) {
  const parsed = new URL(url);
  if (parsed.origin !== origin || parsed.search || parsed.hash || parsed.username || parsed.password)
    throw Error("Only verified public production may supply public configuration.");
  const response = await fetch(parsed, {
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error("Current public production resource unavailable.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw Error("Public resource exceeded its size limit.");
  return bytes.toString("utf8");
}
const baseline = JSON.parse(await getText(origin + "/release.json", 100000));
if (baseline.channel !== "production" || baseline.sourceCommit !== expectedBaseline ||
    baseline.sourceDirty !== false || baseline.companyConnectionBundled !== true)
  throw Error("Production has changed; review its baseline before packaging.");
const html = await getText(origin + "/", 1000000);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
  .map((match) => new URL(match[1], origin))
  .filter((url) => url.origin === origin && /^\/assets\/[A-Za-z0-9._-]+\.js$/.test(url.pathname));
if (scripts.length < 1 || scripts.length > 8) throw Error("Unexpected public entry scripts.");
const texts = await Promise.all(scripts.map((url) => getText(url.href, 6000000)));
const keys = new Set(texts.flatMap((text) =>
  [...text.matchAll(/\bsb_publishable_[A-Za-z0-9_-]{20,160}\b/g)].map((match) => match[0]),
));
if (keys.size !== 1 || !texts.some((text) => text.includes(supabase)))
  throw Error("Cannot identify the single public TruckControl connection.");
const key = [...keys][0];
// Already published browser configuration, never a connector/backend credential.
// Do not store the key in source, receipts, dotenv files or logs.
if (process.env.GITHUB_ACTIONS === "true") process.stdout.write("::add-mask::" + key + "\n");
const response = await fetch(supabase + "/rest/v1/rpc/tc_public_catalog", {
  method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
  body: "{}", redirect: "error", signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw Error("The published key cannot read the public catalog.");
const catalog = await response.json();
if (catalog.payments_enabled !== false)
  throw Error("This delivery is not authorized to open commercial charges.");
const env = {
  ...process.env,
  VITE_SUPABASE_URL: supabase,
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
  VITE_RELEASE_CHANNEL: "production",
  VITE_COMMERCIAL_MODE: "true",
  VITE_AUTH_MAIL_PROVIDER: "resend",
};
const npmCli = process.env.npm_execpath;
const build = spawnSync(npmCli ? process.execPath : "npm",
  npmCli ? [npmCli, "run", "build:production"] : ["run", "build:production"],
  { env, stdio: "inherit", shell: false },
);
if (build.status !== 0) throw Error("Production build failed.");
const release = JSON.parse(readFileSync("dist/release.json", "utf8"));
if (release.sourceCommit !== sha || release.sourceDirty !== false ||
    release.channel !== "production" || !release.companyConnectionBundled ||
    release.registrationForcedClosed !== false)
  throw Error("The output is not exact connected production source.");
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
if (manifest.start_url !== "/" || manifest.scope !== "/" || manifest.display !== "standalone")
  throw Error("Unexpected PWA scope or launch mode.");
for (const file of ["index.html", "sw.js", "gmail-callback.html"])
  if (!lstatSync(join(root, "dist", file)).isFile()) throw Error("Missing production/PWA entry.");
const files = [];
function inventory(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry), stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw Error("Symlinks are not valid deployment output.");
    if (stat.isDirectory()) inventory(path);
    else if (stat.isFile()) {
      const name = relative(root, path).split("\\").join("/");
      if (name.startsWith("../") || /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/i.test(name))
        throw Error("Unexpected sensitive file in build output.");
      const data = readFileSync(path);
      if (/\.(?:js|html|json|css)$/.test(name) &&
          /(?:\bsb_secret_[A-Za-z0-9_-]{16,}|\bsk-proj-[A-Za-z0-9_-]{24,})/.test(data.toString("utf8")))
        throw Error("A secret-shaped value was found; no value has been logged.");
      files.push({ path: name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
    }
  }
}
inventory(join(root, "dist"));
const bundle = files.filter((file) => file.path.endsWith(".js"))
  .map((file) => readFileSync(file.path, "utf8")).join("\n")
  .replace(/\\u([a-fA-F0-9]{4})/g, (_, value) => String.fromCharCode(parseInt(value, 16)));
if (!bundle.includes("https://on7.cargotrack.ro/signin") || !bundle.includes("/cargotrack") ||
    !bundle.includes("Cerrar sesión") || !bundle.includes("Vista de CargoTrack abierta"))
  throw Error("Requested functionality missing from production bundle.");
const archivePath = join(process.env.RUNNER_TEMP || "/tmp", "truckcontrol-production-" + sha + ".tar.gz");
const tar = spawnSync("tar", ["-czf", archivePath, ".openai/hosting.json", "dist"], { stdio: "inherit", shell: false });
if (tar.status !== 0) throw Error("Production packaging failed.");
const archive = readFileSync(archivePath);
const proof = {
  source_commit: sha, project_id: siteId, public_url: origin, baseline_source: expectedBaseline,
  output: release, payment_changes: false, payments_enabled: catalog.payments_enabled,
  public_connection_source: "existing public browser bundle; no key value in this receipt",
  archive: { name: "truckcontrol-production-" + sha + ".tar.gz", bytes: archive.length,
    sha256: createHash("sha256").update(archive).digest("hex") },
  files, published: false, source_pushed_to_sites: false,
  warning: "Build artifact only. Push exact source through authorized Sites Git, then save/deploy and verify HTTPS. This action does not deploy.",
};
writeFileSync(join(process.env.RUNNER_TEMP || "/tmp", "truckcontrol-production-package.json"),
  JSON.stringify(proof, null, 2) + "\n");
console.log(JSON.stringify({ source_commit: sha, project_id: siteId, file_count: files.length,
  archive_bytes: archive.length, archive_sha256: proof.archive.sha256, published: false }));
