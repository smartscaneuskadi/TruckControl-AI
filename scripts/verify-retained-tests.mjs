import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("docs/verification/retained-tests.json", root), "utf8"),
);
const changed = Object.entries(manifest.files).filter(
  ([name, expected]) =>
    createHash("sha256")
      .update(readFileSync(new URL(name, root)))
      .digest("hex") !== expected,
);
if (changed.length)
  throw new Error(
    `Se han modificado pruebas que deben conservarse: ${changed.map(([name]) => name).join(", ")}`,
  );
console.log(
  `Pruebas anteriores conservadas: ${Object.keys(manifest.files).length} archivos, hashes verificados.`,
);
