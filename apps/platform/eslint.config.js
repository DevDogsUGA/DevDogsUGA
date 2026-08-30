import { nextEslintConfig } from "@devdogsuga/config/eslint";

export default nextEslintConfig({
  drizzle: true,
  switchExhaustiveness: true,
  ignores: [
    // Generated Supabase files: index signatures and unused imports are intentional
    "src/supabase/drizzle/schema.ts",
    "src/supabase/types.d.ts",
    // Same category, and it was missing: drizzle-kit rewrites this on every
    // `db:pull`, so its unused imports and unused `table` callback parameters
    // cannot be fixed -- any edit is gone at the next introspection. It is
    // already in .prettierignore for exactly this reason.
    "src/server/db/schema/generated/schema.ts",
  ],
});
