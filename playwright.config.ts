import { defineConfig } from "@playwright/test";
import { join } from "node:path";

const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? "http://localhost:3000";
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const STUB_URL = process.env.STUB_AI_URL ?? "http://127.0.0.1:4999";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "node e2e/stub-ai.mjs",
      url: `${STUB_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Fresh seeded DB -> point the provider at the stub -> boot the API.
      command: "pnpm --filter backend exec tsx scripts/e2e-setup.ts && pnpm --filter backend dev",
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        DB_PATH: join(__dirname, "backend/e2e/.tmp/efh-e2e.db"),
        AGENT_RUNTIME: "legacy",
        AGENT_FALLBACK_RUNTIME: "legacy",
        AGENT_ORCHESTRATION: "off",
        DEEPSEEK_API_KEY: "stub-key",
        DEEPSEEK_BASE_URL: STUB_URL,
        STUB_AI_URL: STUB_URL,
        AUTOMATION_POLL_MS: "1000",
        AUTOMATION_JOB_POLL_MS: "500",
        AUTOMATION_JOB_LEASE_MS: "30000",
      },
    },
    {
      command: "pnpm --filter frontend dev",
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_API_URL: BACKEND_URL,
      },
    },
  ],
});
