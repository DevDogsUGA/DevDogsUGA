import tseslint from "typescript-eslint";
import nextConfig from "eslint-config-next/core-web-vitals";
// @ts-ignore -- no types for this plugin
import drizzle from "eslint-plugin-drizzle";

// `eslint-config-next` already registers the `@typescript-eslint` plugin and
// parser. Spreading `tseslint.configs.*` on top re-registers it and throws
// "Cannot redefine plugin @typescript-eslint" (the two packages resolve to
// different plugin instances). So harvest just the RULES from the type-checked
// presets and layer them onto Next's existing plugin registration.
const typeCheckedRules = [
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].reduce((rules, config) => Object.assign(rules, config.rules), {});

/** Project-wide rule overrides, shared by the apps and the library packages. */
const overrideRules = {
  "@typescript-eslint/array-type": "off",
  "@typescript-eslint/consistent-type-definitions": "off",
  "@typescript-eslint/consistent-type-imports": [
    "warn",
    { prefer: "type-imports", fixStyle: "inline-type-imports" },
  ],
  // All three patterns, not just args. The `_` prefix already meant "declared
  // deliberately, not read" everywhere in this repo: type-level assertions like
  // `type _MeetingRowCheck = MeetingRow` that keep a hand-written select in
  // step with its row type, and `const [_, x] = ...` discards in tests. Only
  // the args form was configured, so all of those still warned.
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/no-misused-promises": [
    "error",
    { checksVoidReturn: { attributes: false } },
  ],
};

const linterOptions = {
  linterOptions: { reportUnusedDisableDirectives: true },
  languageOptions: { parserOptions: { projectService: true } },
};

/**
 * Flat ESLint config for the Next.js apps (platform, schedule-builder).
 *
 * @param {object} [options]
 * @param {boolean} [options.drizzle] Enable the drizzle safety rules (db/ctx.db).
 * @param {boolean} [options.switchExhaustiveness] Enable switch-exhaustiveness-check.
 * @param {string[]} [options.ignores] Extra ignore globs (generated files, etc.).
 */
export function nextEslintConfig(options = {}) {
  const {
    drizzle: enableDrizzle = false,
    switchExhaustiveness = false,
    ignores = [],
  } = options;

  return tseslint.config(
    { ignores: [".next", "packages/*/dist/**", ...ignores] },
    ...nextConfig,
    {
      files: ["**/*.ts", "**/*.tsx"],
      ...(enableDrizzle ? { plugins: { drizzle } } : {}),
      rules: {
        ...typeCheckedRules,
        ...overrideRules,
        ...(switchExhaustiveness
          ? { "@typescript-eslint/switch-exhaustiveness-check": "error" }
          : {}),
        ...(enableDrizzle
          ? {
              "drizzle/enforce-delete-with-where": [
                "error",
                { drizzleObjectName: ["db", "ctx.db"] },
              ],
              "drizzle/enforce-update-with-where": [
                "error",
                { drizzleObjectName: ["db", "ctx.db"] },
              ],
            }
          : {}),
      },
    },
    linterOptions,
  );
}

/**
 * Flat ESLint config for the plain TypeScript library packages (no Next plugin).
 *
 * @param {object} [options]
 * @param {string[]} [options.ignores] Extra ignore globs.
 */
export function libraryEslintConfig(options = {}) {
  const { ignores = [] } = options;

  return tseslint.config(
    { ignores: ["dist/**", ...ignores] },
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    { files: ["**/*.ts", "**/*.tsx"], rules: overrideRules },
    linterOptions,
  );
}
