import { type Config } from "drizzle-kit";

// DB_URL is provided by dotenvx. This config drafts SQL from the Drizzle
// schema with `drizzle-kit generate`; `db:pull` uses the introspection config
// beside it. drizzle-kit push is not used — the SQL files in the repo-root
// `supabase/migrations/` are the source of truth, and what lands in
// `drizzle-generated/` is a draft to be carried into one of them, never
// something that runs on its own.

export default {
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle-generated",
  dialect: "postgresql",
  schemaFilter: ["schedule_builder"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
} satisfies Config;
