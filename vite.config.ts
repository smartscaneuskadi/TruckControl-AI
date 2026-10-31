import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        id: publicBase,
        name: "TruckControl AI",
        short_name: "TruckControl",
        lang: "es",
        description: "Gestión inteligente de flotas · Demostración",
        start_url: publicBase,
        scope: publicBase,
        display: "standalone",
        theme_color: "#080e16",
        background_color: "#080e16",
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
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts", "tests/*.test.ts"],
    environment: "node",
  },
});
