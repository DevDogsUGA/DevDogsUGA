import { db } from "~/server/db";
import { resolvedUserPermissions } from "~/server/db/schema";

export async function refreshUserPermissions(): Promise<void> {
  await db.refreshMaterializedView(resolvedUserPermissions).concurrently();
}
