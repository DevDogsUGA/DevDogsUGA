import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `.gql`/`.graphql` files as raw text, the same rule `next.config.ts`'s
 * `turbopack.rules` gives the app itself (`raw-loader`). Vitest resolves
 * modules through Vite, not Turbopack, so it never sees that rule; without
 * an equivalent here, the first db-test to import anything reaching
 * `server/github/queries/index.ts` (this step's competitions module does)
 * fails to TRANSFORM the `.gql` files it re-exports, not to run an
 * assertion.
 *
 * Untyped against Vite's own `Plugin` interface -- `vite` is a transitive
 * dependency of `vitest`, not one this app resolves directly, and importing
 * its types here would ask for a dependency this app does not otherwise
 * need. `defineConfig`'s own `plugins` field accepts this shape structurally.
 */
function gqlAsRawText() {
  return {
    name: "gql-as-raw-text",
    transform(code: string, id: string) {
      if (!/\.(gql|graphql)$/.test(id)) return;
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

/**
 * Query-validity checks against the local Supabase stack.
 *
 * Separate from the default config because these need a running database, and
 * a suite that fails when Docker is down is a suite people learn to ignore.
 * `pnpm test` stays hermetic; `pnpm test:db` is the one that proves the SQL.
 */
export default defineConfig({
  plugins: [gqlAsRawText()],
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.db-test.ts"],
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
