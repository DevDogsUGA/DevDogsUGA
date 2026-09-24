import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * Every test here exercises pure logic (route-list construction, result
 * evaluation, host derivation) with `fetch` injected as a parameter -- none
 * of it makes a real network call, so this is a single, ordinary lane, not
 * split into a default/live pair the way packages/repo-checks is. The CLIs
 * that DO make real calls (src/reconcile-cli.ts, src/smoke-cli.ts) are thin
 * wrappers around the tested functions with no logic of their own worth a
 * subprocess test for.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
    },
  }),
);
