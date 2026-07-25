import react from "@vitejs/plugin-react";

/**
 * Shared Vitest preset for jsdom + React Testing Library (component) tests.
 * @type {import("vitest/config").UserConfig}
 */
export const reactPreset = {
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["@devdogsuga/config/vitest/setup-react"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
};
