/**
 * App slugs from `platform."apps"` that this codebase names directly.
 *
 * Lives in `config/` rather than beside the loaders because client components
 * need it too — the feedback dialog loads its topics over PostgREST, and
 * `server/loaders/apps.ts` pulls in Drizzle and the database connection, which
 * cannot cross into the browser.
 */

/** The DevDogs site itself, which owns first-party feedback. */
export const PLATFORM_APP_SLUG = "platform";
