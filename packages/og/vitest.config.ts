import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The node preset: nothing here mounts a component, so there is no jsdom and no
 * React Testing Library. The templates are JSX, but Satori consumes the plain
 * objects the automatic runtime produces, and the tests assert on those objects
 * and on the palette rather than on a rendered DOM.
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
