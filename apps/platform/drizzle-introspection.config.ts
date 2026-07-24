import { type Config } from "drizzle-kit";

// DB_URL is provided by dotenvx (see package.json db:* scripts).

export default {
  out: "./src/supabase/drizzle",
  dialect: "postgresql",
  schemaFilter: ["*", "!platform", "!public", "!_*"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "camel",
  },
} satisfies Config;
