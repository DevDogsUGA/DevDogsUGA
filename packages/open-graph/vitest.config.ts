import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The node preset: nothing here mounts a component, so there is no jsdom and no
 * React Testing Library. The templates are JSX, but Satori consumes the plain
 * objects the automatic runtime produces, so any future test would assert on
 * those objects rather than on a rendered DOM.
 *
 * `passWithNoTests` is on because there currently ARE none: the palette
 * transcription this package used to test (`palette.test.ts`, asserting
 * `oklch()` conversion against the real stylesheet) moved to
 * `@devdogsuga/brand` with the brand tokens themselves in the Backstage
 * cutover. Drop this once this package has a test of its own again.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    // Vitest transforms with oxc, which takes its JSX setting here rather than
    // under `esbuild` — setting both makes it warn and ignore the esbuild half.
    oxc: { jsx: { runtime: "automatic" } },
    test: { include: ["src/**/*.test.ts?(x)"], passWithNoTests: true },
  }),
);
