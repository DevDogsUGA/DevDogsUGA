import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The node preset: nothing here mounts a component. The tests render with
 * `react-dom/server` and assert on the emitted HTML string and on the MIME
 * text of the .eml builder, so there is no jsdom and no React Testing Library.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    // Vitest transforms with oxc, which takes its JSX setting here rather than
    // under `esbuild` — setting both makes it warn and ignore the esbuild half.
    oxc: { jsx: { runtime: "automatic" } },
    test: { include: ["src/**/*.test.ts?(x)"] },
  }),
);
