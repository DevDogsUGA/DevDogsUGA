import { nextEslintConfig } from "@devdogsuga/config/eslint";

export default nextEslintConfig({
  ignores: [
    // Generated Supabase introspection: intentional index signatures / unused imports
    "src/supabase/drizzle/**",
    "src/supabase/types.d.ts",
    "drizzle-generated/**",
  ],
});
