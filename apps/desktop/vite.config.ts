import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// The desktop app's CSP, reused by `vite preview` so UI tests run the production
// bundle under the same policy the webview enforces.
const tauriConf = JSON.parse(readFileSync(resolve(__dirname, "src-tauri/tauri.conf.json"), "utf8")) as { app: { security: { csp: string } } };

export default defineConfig({
  plugins: [react()],
  // Game art lives in /assets at the repo root and is served as-is.
  publicDir: resolve(__dirname, "../../assets"),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // dist-demo is rebuilt by the CSP e2e test; watching it would reload open pages.
    watch: { ignored: ["**/src-tauri/**", "**/dist-demo/**", "**/dist/**"] },
  },
  preview: {
    port: 1422,
    strictPort: true,
    headers: { "Content-Security-Policy": tauriConf.app.security.csp },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        castle: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "overlay.html"),
      },
    },
  },
});
