import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The RLS persona suite. Separate from vitest.config.ts because it needs a
 * running local Supabase stack and the local credentials, so it cannot run as
 * part of the workspace-wide `pnpm test`.
 *
 *   pnpm devtools link
 *   pnpm devtools reset
 *   pnpm --filter @devdogsuga/supabase test:rls
 *
 * Single-threaded: personas share one database, and several cases assert on
 * global state (who holds which role, what the instance environment is) that
 * concurrent files would race on.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    resolve: {
      alias: {
        // `testing/personas.ts` imports `createAdminClient` from
        // `@devdogsuga/db/server`, whose first line is `import "server-only"`
        // -- a guard `server-only`'s own package throws on unconditionally,
        // relying on Next's webpack config to alias it to a no-op in a
        // server-side bundle graph. An alias alone is not enough: Vitest
        // externalizes `@devdogsuga/db` itself (a real node_modules package)
        // to Node's native `import()` by default, and that native import
        // resolves its OWN nested `import "server-only"` before Vite's
        // resolver -- alias included -- ever sees it. `deps.inline` below
        // stops that externalization so `@devdogsuga/db`'s imports go
        // through Vite's resolver, where this alias then applies.
        "server-only": fileURLToPath(
          new URL("./vitest/server-only-stub.ts", import.meta.url),
        ),
      },
    },
    test: {
      include: ["testing/**/*.test.ts"],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
      server: { deps: { inline: [/@devdogsuga\/db/] } },
    },
  }),
);
