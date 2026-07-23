import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "~/env";
import { relations } from "./relations";

const globalForDb = globalThis as unknown as {
  conn: ReturnType<typeof postgres> | undefined;
};

const conn =
  globalForDb.conn ??
  postgres(env.DB_URL, {
    prepare: false,
  });

export const db = drizzle({
  client: conn,
  relations,
});

if (env.NODE_ENV !== "production") {
  globalForDb.conn = conn;
}
