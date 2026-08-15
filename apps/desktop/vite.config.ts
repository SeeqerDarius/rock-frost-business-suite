import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev-server port and relative asset paths so the
// bundled webview can load the build output without a running dev server.
// See https://v2.tauri.app/start/frontend/vite/ (the officially documented
// Vite + Tauri 2 integration this config follows).
const HOST = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // Packaged Tauri windows load index.html through a custom protocol. Asset
  // URLs must stay relative or the webview opens successfully but renders a
  // blank page because `/assets/*` resolves outside the bundled frontend.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: HOST || false,
    hmr: HOST
      ? { protocol: "ws", host: HOST, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "dist",
  },
});
