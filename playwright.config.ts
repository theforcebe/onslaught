import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : 2,
  globalTimeout: 6 * 60_000,
  use: {
    baseURL: "http://127.0.0.1:5188",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 5188 --strictPort",
    url: "http://127.0.0.1:5188",
    env: { VITE_API_URL: "https://gateway.onslaught.invalid" },
    reuseExistingServer: false,
  },
});
