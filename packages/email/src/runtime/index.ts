import { templates, type Templates } from "../generated/templates.js";
import { fill } from "./fill.js";

/**
 * The runtime. A few kilobytes of strings and one loop.
 *
 * React, the renderer and Tailwind are build-time dependencies; none of them
 * is reachable from this file. Worker bundle size stops being something to
 * watch against the 3 MB compressed limit.
 */

export type { Templates };
export { escapeHtml, safeUrl } from "./fill.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  /**
   * Never omit this when sending. Some clients show only the text part, and
   * its absence worsens spam scoring: a message with no plain-text alternative
   * is one of the cheapest signals a filter has.
   */
  text: string;
}

/**
 * Fills a compiled template.
 *
 * `Templates` is generated from each template's exported `Props`, so this call
 * is checked against the real component: a renamed prop, a missing one or a
 * typo is a build error rather than a `⟦teamName⟧` in somebody's inbox.
 * Generated types, not a hand-maintained registry, are why the compiled
 * artifact and the source cannot drift.
 */
export function render<K extends keyof Templates>(
  name: K,
  props: Templates[K],
): RenderedEmail {
  const compiled = templates[name];
  const values = props as Record<string, unknown>;

  return {
    // The subject is a header, not markup. Escaping it would put `&amp;` in
    // somebody's inbox.
    subject: fill(compiled.subject, values, false),
    html: fill(compiled.html, values, true),
    text: fill(compiled.text, values, false),
  };
}

/** Every template name, for tests and the snapshot runner. */
export const templateNames = Object.keys(templates) as (keyof Templates)[];
