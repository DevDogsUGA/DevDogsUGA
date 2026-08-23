/**
 * Where a fenced code block opens and where it closes, by CommonMark's rule.
 *
 * Two modules in this package have to know, for opposite reasons. `check.ts`
 * asks so that a `<details>` written inside a sample is not counted as a
 * collapsible the page never closes. `gen/emit.ts` asks so that a `<` written
 * inside a sample is not escaped into a visible `&lt;` in the middle of
 * someone's code. Same question, and the run-length rule below is fiddly
 * enough that two copies of it would drift the first time either was
 * corrected — so it is answered once, here.
 */

/** The ``` or ~~~ run at the head of a line, which opens or closes a fence. */
export function fenceRun(text: string): string | null {
  return /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1] ?? null;
}

/**
 * The run that *opens* a fence, which is not simply the run at the head of the
 * line.
 *
 * CommonMark lets an opening backtick fence carry an info string — the `ts` in
 * a ```` ```ts ```` — but forbids a backtick anywhere inside it, so a line
 * whose leading backtick run is followed by another backtick on the same line
 * opens nothing at all. It stays an ordinary paragraph, and its backtick runs
 * pair into code spans the way any other paragraph's do. Rendered through the
 * site's own plugins — `remark-gfm` into `rehype-raw` — a line reading
 * ``` ```ts const x = a < b; ``` ``` comes back as
 * `<p><code>ts const x = a &#x3C; b; </code></p>`: one paragraph, one code
 * span, no code block anywhere on the page.
 *
 * `gen/emit.ts` needs that reading and cannot get it from `fenceRun` alone,
 * because the text arriving there has been folded flat. `collapseParagraphs`
 * (gen/program.ts) turns every newline inside a TypeScript doc-comment
 * paragraph into a space, so a fenced sample a contributor wrote across four
 * lines reaches the emitter as exactly that one line. Read as an opening
 * fence, it is a fence nothing closes, and every `<` in the rest of the
 * symbol's prose is then handed to the page untouched — a `<details>` in a
 * sentence below it opens a disclosure element that is still open when the
 * page ends. Rendering the emitted markdown puts the closing `</details>`
 * after the source link, with the whole remainder of the symbol inside it,
 * which is the failure the escaping in `gen/emit.ts` exists to prevent,
 * arriving through a door that escaping never sees.
 *
 * Only backtick runs are tested, because the restriction is only on them. A
 * one-line `~~~dart const x = a < b; ~~~` really does open a tilde fence that
 * runs to the end of the text — rendered, everything after it comes back
 * inside a single `<pre><code class="language-dart">` — so that line still
 * opens a fence here, because a fence is what the reader is going to get.
 */
export function opensFence(text: string): string | null {
  const run = fenceRun(text);
  if (run === null) return null;
  const info = text.slice(text.indexOf(run) + run.length);
  return run[0] === "`" && info.includes("`") ? null : run;
}

/**
 * A fence closes only on its own character, with a run at least as long as the
 * one that opened it, and with nothing after it — so a three-backtick fence
 * inside a four-backtick fence stays part of the sample, which is how
 * writing-docs.md shows anyone how to write a code block (its "Code blocks"
 * section wraps a ```` ```typescript ```` example in a four-backtick fence).
 */
export function closesFence(text: string, open: string): boolean {
  const run = fenceRun(text);
  if (run === null || run[0] !== open[0] || run.length < open.length) {
    return false;
  }
  return text.slice(text.indexOf(run) + run.length).trim() === "";
}
