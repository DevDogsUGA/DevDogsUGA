import { type Config } from "drizzle-kit";

// DB_URL is provided by dotenvx (see package.json db:* scripts).

export default {
  out: "./src/supabase/drizzle",
  dialect: "postgresql",
  // This module exists so the console can reach the Supabase-managed schemas
  // (auth, storage) through Drizzle; `platform` is generated separately by
  // drizzle.config.ts.
  //
  // ⚠️ ANY OTHER APP'S SCHEMA THAT ADDS A QUARANTINE COLUMN MUST BE EXCLUDED
  // HERE. A foreign key to platform."reportResolutions" makes Drizzle emit a
  // reference it has no import for, so the generated file does not compile.
  // Importing across would make these two generated modules circular. The
  // `sandbox` fixture schema used to be on this list for exactly that reason.
  // Nothing is lost by excluding one: the console has no reason to read another
  // app's tables server-side, and apps reach their own content over PostgREST.
  schemaFilter: ["*", "!platform", "!public", "!_*"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "camel",
  },
} satisfies Config;
