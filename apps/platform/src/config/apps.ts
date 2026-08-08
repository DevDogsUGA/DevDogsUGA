/**
 * App slugs from `platform."apps"` that this codebase names directly.
 *
 * Lives in `config/` rather than beside the loaders because client components
 * need it too, and `server/loaders/apps.ts` pulls in Drizzle and the database
 * connection, which cannot cross into the browser.
 */

/** The DevDogs site itself. */
export const PLATFORM_APP_SLUG = "platform";
