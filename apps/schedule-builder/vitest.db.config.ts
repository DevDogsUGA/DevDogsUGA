import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

/**
 * Query-validity checks against the local Supabase stack.
 *
 * Separate from the default config because these need a running database, and
 * a suite that fails when Docker is down is a suite people learn to ignore.
 * `pnpm test` stays hermetic; `pnpm test:db` is the one that proves the SQL.
 */

// See vitest.config.ts's identical plugin: these tests reach `~/server/db`,
// which imports `env` from `cloudflare:workers`, a specifier plain Vitest
// (no workerd underneath) cannot otherwise resolve.
const cloudflareModulesStub: Plugin = {
  name: "cloudflare-modules-stub",
  resolveId(id) {
    if (id.startsWith("cloudflare:")) return id;
  },
  load(id) {
    if (id.startsWith("cloudflare:")) return "export const env = {};";
  },
};

export default defineConfig({
  plugins: [cloudflareModulesStub],
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.db-test.ts"],
    environment: "node",
    // `passWithNoTests` stays even though schema.db-test.ts and
    // reconcileTerm.db-test.ts exist now: a future db-test-free stretch
    // should not break CI on an empty suite either.
    passWithNoTests: true,
    // See vitest.config.ts: Vite's own BASE_URL collides with the app's.
    env: { BASE_URL: process.env.BASE_URL ?? "http://localhost:3001" },
  },
});
