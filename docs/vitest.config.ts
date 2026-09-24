import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * Covers `scripts/signature.ts` — the pure, fs-free half of the build cache
 * (see `scripts/cached-build.ts`'s header for the split's rationale).
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: { include: ["scripts/**/*.test.ts"] },
  }),
);
