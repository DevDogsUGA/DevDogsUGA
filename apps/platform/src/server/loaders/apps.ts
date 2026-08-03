import { cache } from "react";
import { db } from "~/server/db";
import { PLATFORM_APP_SLUG } from "~/config/apps";

/**
 * Resolves an app's id from its slug.
 *
 * Throws rather than returning null: every slug used in the codebase is
 * registered by a migration, so a miss means the registry and the code have
 * diverged, and failing quietly would attribute data to the wrong app.
 */
export const getAppIdBySlug = cache(async (slug: string): Promise<string> => {
  const row = await db.query.apps.findFirst({
    columns: { id: true },
    where: { slug },
  });
  if (!row) throw new Error(`No app registered with slug "${slug}"`);
  return row.id;
});

// Re-exported so server callers can reach it from the module they already
// import; the definition lives in `~/config/apps` because client components
// need it too and this module pulls in the database connection.
export { PLATFORM_APP_SLUG };
