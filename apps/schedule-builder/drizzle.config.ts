import { type Config } from "drizzle-kit";

// DB_URL is supplied by the app's `types:drizzle` script (`with-env`), which runs
// this config with the session's database URL.

export default {
  out: "./src/server/db/schema/generated",
  dialect: "postgresql",
  schemaFilter: ["schedule_builder"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "camel",
  },
} satisfies Config;
