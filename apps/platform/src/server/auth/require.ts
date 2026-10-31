import { forbidden } from "next/navigation";
import { requireDashboard } from "~/server/auth/access";

/**
 * Gate helpers, so that every gated console page denies access the same way.
 *
 * The split below is the only distinction that matters to the person hitting
 * the route:
 *
 *   * **Not signed in.** They return to the same dashboard path after signing in.
 *   * **Signed in, not allowed.** `forbidden()` renders the access-denied card
 *     (`(site)/forbidden.tsx`), which names the section for an officer and
 *     explains how to reach leadership for a member with no console role.
 *     Only real routes get here; an unknown path is still the 404.
 */

/** The caller's id, or sign-in with the original dashboard URL. */
export async function requireSession(): Promise<string> {
  return (await requireDashboard()).userId;
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
