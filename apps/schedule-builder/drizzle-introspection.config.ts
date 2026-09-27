import { type Config } from "drizzle-kit";

// DB_URL is supplied by `pnpm devtools db introspect --app <slug>`, which runs
// this config with the session's database URL.

export default {
  out: "./src/supabase/drizzle",
  dialect: "postgresql",
  schemaFilter: ["*", "!schedule_builder", "!public", "!_*"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "camel",
  },
} satisfies Config;
