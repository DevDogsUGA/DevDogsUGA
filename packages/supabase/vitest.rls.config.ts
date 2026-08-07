import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The RLS persona suite. Separate from vitest.config.ts because it needs a
 * running local Supabase stack and the local credentials, so it cannot run as
 * part of the workspace-wide `pnpm test`.
 *
 *   pnpm sb link
 *   pnpm sb reset
 *   pnpm --filter @devdogsuga/supabase test:rls
 *
 * Single-threaded: personas share one database, and several cases assert on
 * global state (who holds Root, what the instance environment is) that
 * concurrent files would race on.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      include: ["testing/**/*.test.ts"],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
