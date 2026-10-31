/**
 * The one canonical form of a link to an event or a Submission, so the same
 * page typed two ways is one record. Hackathons and Submissions key their
 * unique `url` column on it (D0 section 2), and the Devpost sync stores the
 * feed's links through it.
 *
 * Pure: no database, no network. A link is never fetched.
 */

/** The longest URL either table stores; the columns check it too. */
export const MAX_URL_LENGTH = 2048;

/**
 * Query parameters that identify a click rather than a page. Everything else
 * stays: some events live at `/?event=123`.
 */
const TRACKING_PARAMS =
  /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid)$/iu;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u;

/**
 * `input` as a canonical HTTPS URL, or `null` when it is not a link we can
 * store.
 *
 * - A missing scheme is read as `https://`, and `http://` is upgraded to it.
 *   Any other scheme is refused.
 * - The host is lower-cased and must be a name with a dot, not an address or
 *   `localhost`; a link with a username or password is refused.
 * - The fragment and the tracking parameters are dropped, the remaining
 *   parameters are sorted, and a trailing slash goes from every path but the
 *   root (`https://x.devpost.com/` keeps its slash).
 * - The result is at most `MAX_URL_LENGTH` characters.
 */
export function canonicalHttpsUrl(input: string): string | null {
  const text = input.trim();
  if (text === "" || /\s/u.test(text)) return null;
  const withScheme = SCHEME.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;
  const host = url.hostname;
  if (!host.includes(".") || IPV4.test(host) || host.startsWith("["))
    return null;
  url.protocol = "https:";
  url.hash = "";
  const kept = [...url.searchParams].filter(
    ([name]) => !TRACKING_PARAMS.test(name),
  );
  url.search = "";
  for (const [name, value] of kept) url.searchParams.append(name, value);
  url.searchParams.sort();
  if (url.pathname.length > 1)
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  const canonical = url.toString();
  return canonical.length <= MAX_URL_LENGTH ? canonical : null;
}
