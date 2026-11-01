/**
 * Whether a commit seen on a default branch is stored at all (Q56, D0 section
 * 8.8): only a commit whose GitHub author id belongs to a linked DevDogs
 * member. A commit from anyone else is skipped entirely, so nothing about a
 * non-member is ever written.
 *
 * `authorMemberId` is the member the commit's `author.id` resolved to, matched
 * on the numeric `auth.identities.provider_id` and never on login or email, or
 * `null`/`undefined` when it resolved to nobody (including a commit GitHub
 * could not attribute to an account).
 *
 * This is the only place that decides, so widening the policy again (storing
 * every commit and claiming it later by author id) is a change to this
 * function and to the `userId` column, nowhere else.
 */
export function shouldStoreCommit(
  authorMemberId: string | null | undefined,
): authorMemberId is string {
  return typeof authorMemberId === "string" && authorMemberId !== "";
}
