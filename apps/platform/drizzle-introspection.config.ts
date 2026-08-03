import { type Config } from "drizzle-kit";

// DB_URL is provided by dotenvx (see package.json db:* scripts).

export default {
  out: "./src/supabase/drizzle",
  dialect: "postgresql",
  // `sandbox` is excluded because its tables carry the foreign key to
  // platform."reportResolutions" that registers them as moderatable content.
  // Drizzle emits that reference without an import it can resolve, so
  // introspecting the schema here produces a file that does not compile — and
  // importing across would make these two generated modules circular.
  //
  // Nothing is lost: this module exists so the console can reach the
  // Supabase-managed schemas (auth, storage) through Drizzle. Sandbox content is
  // fixture data for the contributor tooling, which reaches it over PostgREST
  // from the browser, and the console has no reason to read another app's tables
  // server-side. Any app that adds the quarantine column belongs on this list
  // for the same reason.
  schemaFilter: ["*", "!platform", "!public", "!sandbox", "!_*"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "camel",
  },
} satisfies Config;
