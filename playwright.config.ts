import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: { command: "npm.cmd run dev -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100/offline", reuseExistingServer: false, timeout: 120_000 },
  projects: [{ name: "chromium-pwa", use: { browserName: "chromium" } }],
});
