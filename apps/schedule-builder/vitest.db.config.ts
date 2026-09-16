import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Query-validity checks against the local Supabase stack.
 *
 * Separate from the default config because these need a running database, and
 * a suite that fails when Docker is down is a suite people learn to ignore.
 * `pnpm test` stays hermetic; `pnpm test:db` is the one that proves the SQL.
 */
export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.db-test.ts"],
    environment: "node",
    // No *.db-test.ts files exist yet (schema-migration / ingestion-term-scoped-reconcile
    // add the first ones); without this flag an empty suite exits 1 and breaks CI before
    // real coverage lands.
    passWithNoTests: true,
    // See vitest.config.ts: Vite's own BASE_URL collides with the app's.
    env: { BASE_URL: process.env.BASE_URL ?? "http://localhost:3001" },
  },
});
