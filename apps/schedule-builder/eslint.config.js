import { nextEslintConfig } from "@devdogsuga/config/eslint";

export default nextEslintConfig({
  ignores: [
    // Generated Supabase introspection: intentional index signatures / unused imports
    "src/supabase/drizzle/**",
    "src/supabase/types.d.ts",
    // Same category, and it was missing: drizzle-kit rewrites this on every
    // `devtools db introspect`, so its unused imports and unused `table`
    // callback parameters cannot be fixed -- any edit is gone at the next
    // introspection. It is already in .prettierignore for exactly this reason.
    "src/server/db/schema/generated/schema.ts",
  ],
});
