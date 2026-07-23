import { pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Column } from "drizzle-orm";

/** Standard CRUD policy: authenticated users can only access rows they own. */
export function crudPolicy(name: string, userIdColumn: Column) {
  const condition = sql`auth.uid() = ${userIdColumn}`;
  return pgPolicy(name, {
    for: "all",
    to: "authenticated",
    using: condition,
    withCheck: condition,
  });
}
