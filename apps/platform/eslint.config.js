import { nextEslintConfig } from "@devdogsuga/config/eslint";

export default nextEslintConfig({
  drizzle: true,
  switchExhaustiveness: true,
  ignores: [
    // Generated Supabase files — index signatures and unused imports are intentional
    "src/supabase/drizzle/schema.ts",
    "src/supabase/types.d.ts",
  ],
});
