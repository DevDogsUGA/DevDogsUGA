import { type Config } from "drizzle-kit";

// DB_URL is provided by dotenvx. This config is used with
// `drizzle-kit generate` (to draft SQL migrations from the schema) and
// `drizzle-kit pull`; drizzle-kit push is no longer used — SQL migrations in
// packages/sb are the source of truth.

export default {
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle-generated",
  dialect: "postgresql",
  schemaFilter: ["schedule_builder"],
  dbCredentials: {
    url: process.env.DB_URL!,
  },
} satisfies Config;
