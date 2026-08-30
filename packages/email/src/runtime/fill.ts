/**
 * Substitution: a `for` loop over two arrays.
 *
 * No parsing, no regex over the document, no template engine. A compiled
 * template is `chunks` and `slots` where `chunks.length === slots.length + 1`,
 * so filling it is interleaving the two.
 */

export interface Compiled {
  chunks: string[];
  slots: string[];
  /**
   * Slot names whose value is a URL.
   *
   * These get `encodeURI` before escaping. A slot value that lands in an
   * `href` and is only HTML-escaped can still carry a `javascript:` scheme or
   * a raw space that breaks the attribute. Different problem, different
   * filler.
   */
  urlSlots: string[];
}

export interface CompiledTemplate {
  subject: Compiled;
  html: Compiled;
  text: Compiled;
}

/**
 * Escaped on substitution, never at compile time.
 *
 * Team names and display names are user-authored: a team called `<script>`
 * must not become one. Escaping at compile time would only cover the literal
 * text in the template, which is the half that was never dangerous.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A URL safe to put in an `href`.
 *
 * Scheme-checked rather than merely encoded: `encodeURI` leaves
 * `javascript:alert(1)` intact, and these URLs are built from database values.
 * Anything that is not plainly http(s) becomes `#`, which fails visibly
 * instead of executing.
 */
export function safeUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "#";
  return escapeHtml(encodeURI(trimmed));
}

export function fill(
  compiled: Compiled,
  props: Record<string, unknown>,
  escape: boolean,
): string {
  const urlSlots = new Set(compiled.urlSlots);
  let out = compiled.chunks[0] ?? "";

  for (let i = 0; i < compiled.slots.length; i += 1) {
    const name = compiled.slots[i]!;
    const raw = props[name];
    const value = raw === undefined || raw === null ? "" : String(raw);

    out += escape
      ? urlSlots.has(name)
        ? safeUrl(value)
        : escapeHtml(value)
      : value;

    out += compiled.chunks[i + 1] ?? "";
  }

  return out;
}
