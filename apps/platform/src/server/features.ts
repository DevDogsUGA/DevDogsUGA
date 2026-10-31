/**
 * Whether public member profiles are on: `/community/@<handle>`, the
 * `/community` directory, and the Public Profile settings on /dashboard/profile and in
 * the verification dialog.
 *
 * Off in production while the feature is still being iterated on; local and
 * staging builds keep it. Production's `/community` goes back to redirecting
 * to the Involvement Network roster, and every profile route 404s.
 *
 * Server-only on purpose. `process.env.DEPLOY_ENV` comes from wrangler's
 * per-env `vars` and the build step, while the browser's
 * `NEXT_PUBLIC_DEPLOY_ENV` defaults to development when unset, which would
 * fail open. Client components learn the answer from a server prop or action.
 *
 * The database half (migration 49's columns, handles and the officer
 * verification override) ships regardless; nothing reads the
 * `publicProfiles` view while this is off.
 */
export function publicProfilesEnabled(): boolean {
  return process.env.DEPLOY_ENV !== "production";
}

/**
 * Whether `/preview/kit` exists: the gallery of every Cosmic kit class that
 * later design units screenshot their primitives against. Development only;
 * staging and production answer 404.
 */
export function kitGalleryEnabled(): boolean {
  return process.env.DEPLOY_ENV === "development";
}
