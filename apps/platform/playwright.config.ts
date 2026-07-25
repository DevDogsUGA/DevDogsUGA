import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Boots the app against the LOCAL Supabase stack via the existing `dev:local`
  // script (layers `.env.generated` over `.env`). Bring the stack up first with
  // `pnpm sb start-local-stack`. Set E2E_BASE_URL to test an already-running app.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm run dev:local",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
