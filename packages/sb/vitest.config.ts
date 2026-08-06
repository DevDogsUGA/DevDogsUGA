import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

export default mergeConfig(
  nodePreset,
  defineConfig({
    // `testing/` holds the RLS persona suite, which talks to a running local
    // Supabase stack and so cannot be part of the default `pnpm test` that
    // runs everywhere. `pnpm --filter @devdogsuga/sb test:rls` runs it via vitest.rls.config.ts.
    test: { include: ["src/**/*.test.ts"] },
  }),
);
