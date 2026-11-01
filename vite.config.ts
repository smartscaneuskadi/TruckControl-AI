import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const releaseChannel = process.env.VITE_RELEASE_CHANNEL || "demo";
if (!["demo", "candidate", "production"].includes(releaseChannel))
  throw new Error("Canal de publicación no reconocido.");
if (
  releaseChannel === "candidate" &&
  process.env.VITE_COMMERCIAL_MODE !== "true"
)
  throw new Error(
    "La candidata debe mostrar el portal de planes. Usa npm run build:candidate.",
  );
if (
  releaseChannel === "candidate" &&
  (process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
)
  throw new Error(
    "La candidata se construye sin conexión a datos de clientes.",
  );
const appPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
function releaseMetadata() {
  let sourceCommit: string | null = null,
    sourceDirty: boolean | null = null;
  try {
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    sourceDirty = Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    /* Local source archives may not contain Git metadata. */
  }
  return {
    app: "TruckControl AI",
    version: appPackage.version,
    channel: releaseChannel,
    sourceCommit,
    sourceDirty,
    companyConnectionBundled: Boolean(
      releaseChannel !== "candidate" &&
      process.env.VITE_SUPABASE_URL &&
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ),
    registrationForcedClosed: releaseChannel === "candidate",
    builtAt: new Date().toISOString(),
  };
}

const publicBase = process.env.VITE_BASE_PATH || "/";
if (
  !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(publicBase) ||
  publicBase.split("/").some((part) => part === "." || part === "..")
)
  throw new Error("VITE_BASE_PATH debe ser una ruta absoluta terminada en /.");

export default defineConfig({
  base: publicBase,
  plugins: [
    react(),
    {
      name: "truckcontrol-release-provenance",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "release.json",
          source: JSON.stringify(releaseMetadata(), null, 2) + "\n",
        });
      },
      transformIndexHtml() {
        return [
          { tag: "meta", attrs: { name: "referrer", content: "no-referrer" } },
          ...(releaseChannel !== "production"
            ? [
                {
                  tag: "meta",
                  attrs: { name: "robots", content: "noindex,nofollow" },
                },
              ]
            : []),
        ];
      },
    },
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/*.png", "brands/*", "images/*"],
      manifest: {
        id: publicBase,
        name: "TruckControl AI",
        short_name: "TruckControl",
        lang: "es",
        description:
          releaseChannel === "candidate"
            ? "Gestión de flotas · Candidata con datos ficticios"
            : "Gestión inteligente de flotas · Demostración",
        start_url: publicBase,
        scope: publicBase,
        display: "standalone",
        theme_color: "#103b38",
        background_color: "#102a3b",
        icons: [
          {
            src: `${publicBase}icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${publicBase}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${publicBase}icons/maskable-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: `${publicBase}index.html`,
        // Google codes must reach the dedicated, credential-free callback page.
        navigateFallbackDenylist: [/\/gmail-callback(?:\.html)?(?:[/?]|$)/],
        cleanupOutdatedCaches: true,
        globPatterns: [
          "**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,webmanifest,woff2}",
        ],
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts", "tests/*.test.ts"],
    environment: "node",
  },
});
