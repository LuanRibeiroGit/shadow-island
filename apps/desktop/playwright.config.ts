import { defineConfig } from "@playwright/test";

/**
 * UI tests run against the Vite dev server with the demo backend (real engine
 * output recorded from tests/fixtures). They cover the web UI; native features
 * (tray, overlay window, hooks) are covered by Rust tests and the CI build.
 * CHROMIUM_PATH lets sandboxes reuse a preinstalled browser.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1360, height: 860 },
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: "pnpm exec vite --port 1420 --strictPort",
      url: "http://localhost:1420",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Production bundle (demo data compiled in only for this mode) served with
      // the app's real Content-Security-Policy.
      command: "pnpm exec vite build --mode demo --outDir dist-demo && pnpm exec vite preview --outDir dist-demo",
      url: "http://localhost:1422",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
