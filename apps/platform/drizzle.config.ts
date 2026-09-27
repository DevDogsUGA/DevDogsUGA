import { type Config } from "drizzle-kit";

// DB_URL is supplied by `pnpm devtools db introspect --app <slug>`, which runs
// this config with the session's database URL.

export default {
  out: "./src/server/db/schema/generated",
  dialect: "postgresql",
  schemaFilter: ["platform"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "camel",
  },
} satisfies Config;
