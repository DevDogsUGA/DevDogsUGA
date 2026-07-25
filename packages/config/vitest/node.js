/**
 * Shared Vitest preset for node-environment (pure-logic) packages.
 * @type {import("vitest/config").UserConfig}
 */
export const nodePreset = {
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
};
