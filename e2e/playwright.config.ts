import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contro lo stack locale reale: Next.js (APP_URL), Supabase Auth (GoTrue)
 * dietro il gateway su :54321, PostgreSQL con le migrazioni, mailpit per le
 * email. Avvio dello stack: scripts/e2e-auth.sh (vedi docs/SECURITY.md).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    locale: "it-IT",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
