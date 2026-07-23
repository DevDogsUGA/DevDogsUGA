import { type Config } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export default {
  out: "./src/supabase/drizzle",
  dialect: "postgresql",
  schemaFilter: ["*", "!public", "!_*"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "camel",
  },
} satisfies Config;
