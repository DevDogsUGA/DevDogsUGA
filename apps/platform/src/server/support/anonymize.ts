/**
 * The widget appends one subtext line to a starter post, carrying the page it
 * was asked from and (for linked members) a ping. It is context for officers,
 * not part of the question, so the index drops it.
 */
export const CONTEXT_LINE_PREFIX = "-# Asked from ";

/**
 * Strips who-said-what out of forum text before it reaches the public index.
 *
 * The forum is members-only in Discord; the index feeds widget suggestions
 * shown to guests and the public Cmd-K. Mentions are the only place a name can
 * appear in a message body (author names never reach the index at all), so
 * those are what go. Custom emoji keep their name, which is not personal, and
 * lose the id markup that would otherwise index as noise.
 */
export function anonymize(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith(CONTEXT_LINE_PREFIX))
    .join("\n")
    .replace(/<@!?\d+>/g, "@member")
    .replace(/<@&\d+>/g, "@role")
    .replace(/<#\d+>/g, "#channel")
    .replace(/<a?:(\w+):\d+>/g, ":$1:")
    .replace(/<t:(\d+)(?::[tTdDfFR])?>/g, (_, unix: string) =>
      new Date(Number(unix) * 1000).toISOString().slice(0, 10),
    )
    .trim();
}
