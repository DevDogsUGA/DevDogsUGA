import { forbidden, notFound } from "next/navigation";
import { expectSession } from "~/server/auth";

/**
 * Gate helpers, so that every gated console page denies access the same way.
 *
 * The split below is the only distinction that matters to the person hitting
 * the route:
 *
 *   * **Not signed in.** The console does not exist for them: the site 404,
 *     with no redirect into OAuth. Nothing confirms the route is real.
 *   * **Signed in, not allowed.** `forbidden()` renders the access-denied card
 *     (`(site)/forbidden.tsx`), which names the section for an officer and
 *     explains how to reach leadership for a member with no console role.
 *     Only real routes get here; an unknown path is still the 404.
 */

/** The caller's id, or the 404 for a signed-out visitor. */
export async function requireSession(): Promise<string> {
  return await expectSession().catch(() => notFound());
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
  if (!(await check(userId))) forbidden();
  return userId;
}
