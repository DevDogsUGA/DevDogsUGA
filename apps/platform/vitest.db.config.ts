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
    setupFiles: ["./vitest.db.setup.ts"],
    environment: "node",
    // See vitest.config.ts: Vite's own BASE_URL collides with the app's.
    env: { BASE_URL: process.env.BASE_URL ?? "http://localhost:3000" },
    // Every file here shares ONE real local Postgres, and most files stay
    // safe under file-level parallelism because each only ever touches the
    // specific rows it seeds -- different UUIDs, no shared table scan. A
    // pass that legitimately reads the WHOLE table (`reconcileTeams`, the
    // nightly team reconcile) breaks that assumption: run concurrently with
    // another file, it repairs -- and touches `githubSyncedAt` on -- rows
    // that file seeded moments before, mid-test. Sequential file execution
    // is the fix, not scoping `reconcileTeams` down for tests alone; a
    // handful of fast query-validity files paying for serial execution is
    // cheaper than a nightly job whose test coverage requires it to lie
    // about scanning every team.
    fileParallelism: false,
  },
});
