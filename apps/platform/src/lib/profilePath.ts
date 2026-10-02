/**
 * Where a member's public profile lives, built one way for every consumer.
 *
 * The directory, the invite picker, competition archives and the profile page
 * itself all link to `/community/@<handle>`. Building that string in each of
 * them is how one ends up with `/community/handle` and another with an
 * uppercase `@Handle`, so they all call this.
 *
 * Handles are stored lowercase (see `profile_handle_format`), so the path is
 * lowercased here too: a link rendered from a stale mixed-case value still
 * resolves, and `handleFromSegment` is its inverse.
 */

export const COMMUNITY_PATH = "/community";

/** `/community/@ada`. The handle is passed without its `@`. */
export function profilePath(handle: string): string {
  return `${COMMUNITY_PATH}/@${handle.toLowerCase()}`;
}

/**
 * The handle out of a `[handle]` route segment, or null when the segment is
 * not shaped like a profile at all (no leading `@`, or nothing after it).
 *
 * The segment arrives percent-encoded (`%40ada`) from some routers and as
 * `@ada` from others, so both are accepted. The result is lowercased but not
 * format-checked: an unknown handle is a 404 from the loader, not a bad
 * request here.
 */
export function handleFromSegment(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (!decoded.startsWith("@") || decoded.length < 2) return null;
  return decoded.slice(1).toLowerCase();
}
