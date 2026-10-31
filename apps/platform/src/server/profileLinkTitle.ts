import ogs from "open-graph-scraper";
import { PROFILE_LIMITS } from "~/lib/validation/profile";

/**
 * The title a new profile link is saved under: the one the member typed, else
 * the page's own, else the host name.
 *
 * Title fetching must stay server-side. Browsers block cross-origin HTML
 * fetches (CORS) unless the target sets Access-Control-Allow-Origin, which
 * almost no site does on its HTML pages.
 *
 * The fetch is OURS, with ogs only parsing the `html`. Given a bare `url`,
 * ogs fetches through undici, whose first request compiles the llhttp
 * parser's Wasm, and the Workers runtime forbids runtime Wasm codegen (the
 * same failure DocsMarkdown hit with Shiki's Oniguruma engine). The
 * platform-native fetch needs no parser.
 *
 * An OG title is whatever the page put in its <head> and is routinely longer
 * than the varchar(64) column. Nobody validated it, because nobody typed it,
 * so a good link could fail to save on account of someone else's markup.
 * Truncate instead of refusing.
 */
export async function resolveLinkTitle(
  url: string,
  supplied: string | null,
): Promise<string> {
  let title = supplied;
  if (!title) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: "text/html" },
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("text/")) {
        const { result } = await ogs({ html: await response.text() });
        title = result.ogTitle ?? result.dcTitle ?? null;
      }
    } catch {
      // fall through to hostname fallback
    }
  }
  return (title ?? hostnameTitle(url)).slice(0, PROFILE_LIMITS.linkTitle);
}

/** The host name, capitalised: what a link with no title at all is called. */
function hostnameTitle(url: string): string {
  const { hostname } = new URL(url);
  return hostname.charAt(0).toUpperCase() + hostname.slice(1);
}
