import { notFound, redirect } from "next/navigation";
import { expectSession } from "~/server/auth";

/**
 * Gate helpers, so that every gated page denies access the same way.
 *
 * Before these there were four conventions in the tree: console loaders threw
 * the caller to `/` on a failed permission check, `verification` used
 * `notFound()`, `moderation` returned a `canModerate` flag and let the page
 * decide, and the participation pages checked only for a session, inline.
 * Which one a page used was an accident of when it was written.
 *
 * The split below is the only distinction that matters to the person hitting
 * the route:
 *
 *   * **Not signed in.** A fixable state, so send them to sign in.
 *   * **Signed in, not allowed.** Not fixable by them, so the route simply
 *     does not exist for this caller. `notFound()` renders the app's own
 *     not-found page; a redirect to `/` drops an officer on the homepage with
 *     no account of why the link they followed evaporated.
 */

/** The caller's id, or a bounce to sign-in. */
export async function requireSession(): Promise<string> {
  return await expectSession().catch(() => redirect("/auth"));
}

/**
 * The caller's id, provided `check` passes for them.
 *
 * Pass the `canUser*` predicate itself: `requirePermission(canUserModerate)`,
 * so the page reads as the permission it needs.
 */
export async function requirePermission(
  check: (userId: string) => Promise<boolean>,
): Promise<string> {
  const userId = await requireSession();
  if (!(await check(userId))) notFound();
  return userId;
}
