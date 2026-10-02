import { libraryEslintConfig } from "@devdogsuga/config/eslint";

export default [
  ...libraryEslintConfig({
    project: ["./tsconfig.json"],
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    // tsconfig.base.json sets noPropertyAccessFromIndexSignature, which
    // requires bracket access on index-signature types (process.env["X"]); the
    // default rule flags exactly those and its autofix would break tsc. Newer
    // @devdogsuga/config releases set this themselves; drop this block when the
    // pinned one does.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/dot-notation": [
        "error",
        { allowIndexSignaturePropertyAccess: true },
      ],
    },
  },
];
