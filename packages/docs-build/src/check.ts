/**
 * `docs-build check` — a lint over the prose, which warns and never fails.
 *
 * Six rules, and they are largely the same rule wearing different hats: a page
 * has grown past the point where a reader will read it, and nothing in the
 * build says so. Length is the one defect here that arrives a paragraph at a
 * time, so nobody is ever the person who broke it.
 *
 * Warn-only is a decision, not an omission. A docs lint that fails the build
 * teaches exactly one lesson — how to get under the threshold — and most of the
 * ways under a word budget are worse than the page that tripped it: detail
 * deleted rather than moved, a paragraph folded into a `<details>` where nobody
 * will look for it. So this reports and stops there. Nothing in here sets an
 * exit code, and `checkDocs` returns rather than throwing, for the same reason
 * the generator does: this module has no business deciding whether a build
 * succeeded.
 *
 * The counterweight is where the count gets printed. A warning behind a command
 * someone has to think to run is a warning nobody reads, so the bare
 * `docs-build` — the one every `pnpm dev` and every `turbo build` already
 * runs — prints the number on its own summary line and points here for detail.
 *
 * `reference/` is skipped whole. A generated page is an enumeration: it is as
 * long as the code it describes, its collapsibles are emitted by `gen/emit.ts`
 * to a fixed shape, and no author chose any of it. Every rule below is about a
 * judgement a person made while writing, so the same rule on a generated page
 * is a warning with nobody to act on it — and several hundred of those would
 * bury the handful that mean something.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import { closesFence, opensFence } from "./fences.js";

/** Package machinery that sits alongside the content and is never a page. */
const NOT_A_PROJECT = new Set(["dist", "node_modules", ".turbo"]);

/** The path segment `docs-build gen` writes into, and this lint reads past. */
const REFERENCE_SEGMENT = "reference";

/**
 * Where the budgets sit. They measure nothing; they are the numbers this team
 * agreed are "long enough to be worth a second look", which is all a warn-only
 * threshold has to be.
 */
const VISIBLE_WORD_BUDGET = 1500;
const DETAILS_WORD_BUDGET = 400;
const DESCRIBE_ABOVE_WORDS = 300;

/** How much of a line is echoed back in a warning before it is elided. */
const QUOTE_LIMIT = 60;

export type CheckRule =
  | "page-length"
  | "heading-in-details"
  | "details-length"
  | "unbalanced-details"
  | "missing-description"
  | "summary-blank-line"
  | "unreadable";

/** One thing worth a second look, on one page. */
export interface CheckWarning {
  /** Path relative to the content root, extension included. */
  file: string;
  /** 1-based line in that file, or null when the page as a whole is the subject. */
  line: number | null;
  rule: CheckRule;
  message: string;
}

/** What a run looked at, and what it found. */
export interface CheckSummary {
  /** Pages linted. Generated pages are not among them. */
  pages: number;
  /** Pages passed over for living under a `reference/` segment. */
  skipped: number;
  warnings: CheckWarning[];
}

/**
 * Lints every hand-written markdown file below `contentRoot`, which is the
 * working directory when this runs as `docs-build check` — the same contract
 * the bare mode has, where the folder you are standing in is the content.
 */
export function checkDocs(contentRoot: string): CheckSummary {
  const warnings: CheckWarning[] = [];
  let pages = 0;
  let skipped = 0;

  for (const file of markdownFiles(contentRoot).sort()) {
    if (isGenerated(file)) {
      skipped += 1;
      continue;
    }

    pages += 1;

    // A lint that dies on the file it was pointed at is worse than no lint at
    // all. Front matter is parsed here and malformed YAML throws; under the
    // bare mode the compiler has already read the same file and would have
    // thrown first, but `docs-build check` on its own has no such shield.
    try {
      const source = fs.readFileSync(path.join(contentRoot, file), "utf-8");
      warnings.push(...checkDocFile(source, file));
    } catch (error) {
      warnings.push({
        file,
        line: null,
        rule: "unreadable",
        message: `could not be read: ${describe(error)}`,
      });
    }
  }

  return { pages, skipped, warnings };
}

/* Rules ------------------------------------------------------------------ */

/**
 * Said the same way wherever the swallowed body sits, because it is the same
 * defect and the same fix: CommonMark ends an HTML block at a blank line and
 * nowhere else, so whether the markdown follows the closing tag on its own line
 * or on the tag's own line changes nothing about what the reader gets.
 */
const SUMMARY_BLANK_LINE =
  "no blank line after </summary> — CommonMark keeps the whole block as raw HTML, so the markdown after it renders unparsed";

/** A closing `</summary>`, wherever it sits on a line. */
const SUMMARY_CLOSE = /<\/summary\s*>/i;

/**
 * Every rule, in one pass over the lines of one file.
 *
 * A line scanner rather than an mdast walk, deliberately and three times over.
 * One rule is about text mdast has already thrown away by the time you can see
 * it — a `</summary>` with no blank line under it is a single `html` node, and
 * where the blank lines fall inside it is the whole of what the rule is about.
 * Every warning needs a line number an editor can jump to, which the parsed
 * page cannot give. And this runs on every build, where a second `remark` pass
 * over the whole content tree is a cost the bare mode should not have to carry.
 *
 * What the scanner does owe `parseDocFile` is agreement about what markup is,
 * which is the only reason it tracks code at all — and it has to track all
 * three of the forms CommonMark has, not the two that are easy. `remark` reads
 * a `#` in a fenced shell transcript as a comment, a `<details>` in a code span
 * as a sentence about collapsibles, and a `<details>` under four spaces of
 * indentation as a sample of the markup rather than the markup itself. The
 * third was checked against `remark` here rather than taken on faith: fed
 * `    <details>` after a blank line, it produces a `code` node holding that
 * text, exactly as it does for a fence.
 *
 * Reading any of the three as markup would report defects that are not on the
 * rendered page, and the damage does not stop at the phantom. An opening tag
 * nothing closes leaves every later line looking hidden, which drags each
 * heading below it into `heading-in-details` and takes the page's visible word
 * count down to whatever sat above the tag — so the rule that matters most on a
 * long page goes quiet on the longest pages of all.
 */
export function checkDocFile(source: string, file: string): CheckWarning[] {
  const { data: frontmatter } = matter(source);
  const lines = source.split("\n");

  const anchored: CheckWarning[] = [];
  const warn = (
    line: number | null,
    rule: CheckRule,
    message: string,
  ): void => {
    anchored.push({ file, line, rule, message });
  };

  /** The fence run that opened the code block we are inside, if we are. */
  let fence: string | null = null;
  /** Whether this line is part of a four-space indented code block. */
  let indented = false;
  /** Whether the line above was blank, which is where indented code may begin. */
  let afterBlank = true;
  /** How many `<details>` deep this line sits. */
  let depth = 0;
  let opened = 0;
  let closed = 0;
  /** Closing tags that arrived with no collapsible open to close. */
  let crossed = 0;
  /** Words in the whole body, and words outside every collapsible. */
  let words = 0;
  let visible = 0;
  /** The outermost open collapsible: where it started, and how long it has run. */
  let block: { line: number; words: number } | null = null;
  /** A `</summary>` whose following line has not been seen yet. */
  let summaryAt: number | null = null;

  for (let index = bodyStart(lines); index < lines.length; index += 1) {
    const text = lines[index] ?? "";
    const line = index + 1;
    const blank = text.trim() === "";

    // Whether this line is indented code, settled before anything reads it.
    // CommonMark's rule is two-part and both parts matter: four spaces of
    // indentation is code, but only where a paragraph could not have run on
    // instead — an indented line under a line of prose is that paragraph
    // continuing, which is why the blank line above is half the test. Once a
    // block is open it survives blank lines and ends at the first non-blank
    // line back out at the margin.
    //
    // Inside a list item the same four spaces are the item's own body rather
    // than code, and this scanner cannot tell the two apart without tracking
    // list indentation, which is most of a block parser. It reads them as code,
    // which is the direction to be wrong in: markup it declines to read costs a
    // warning nobody was going to get anyway, while markup it invents costs
    // every rule below on a page that is fine.
    if (fence === null && !blank) {
      indented = /^(?: {4}|\t)/.test(text) && (indented || afterBlank);
    }
    afterBlank = blank;

    const inCode = fence !== null || indented;

    // No guard against opening a fence inside indented code, because the two
    // cannot both describe a line: `opensFence` wants at most three spaces in
    // front of the run, and the test above wants at least four.
    //
    // `opensFence` rather than `fences.ts`'s barer `fenceRun`, so that this
    // scanner and `gen/emit.ts` keep giving the same answer to the same
    // question — the one thing that module exists to guarantee. Nothing in
    // docs/ is written as a one-line ``` ```md `x` ``` ``` today, so the
    // stricter reading changes no warning this repository currently produces;
    // it is here so the pair cannot drift the next time one of them is
    // corrected.
    if (fence !== null) {
      if (closesFence(text, fence)) fence = null;
    } else {
      const run = opensFence(text);
      if (run !== null) fence = run;
    }

    // The line with every code span blanked out, and empty inside code of any
    // kind: what is left is the only text on the line that can be an element.
    // A sentence that names a tag is not that tag, and this repository writes
    // that sentence — the comments in this very file name `<details>` inside
    // code spans, and `gen` prints them back onto
    // docs/toolkit/reference/api/docs-build.md, which carries them today with
    // no closing tag anywhere on it. Read as markup, one such mention opens a
    // collapsible nothing closes, and every rule below then reports on a page
    // that does not exist: one warning for the tag, and one more for every
    // heading beneath it.
    const markup = inCode ? "" : stripCodeSpans(text);

    // Resolved before any rule reads the line, and without asking whether we
    // are inside code: a fence opening directly under a `</summary>` is
    // precisely the failure. A blank line ends the HTML block and hands the
    // body back to the markdown parser; a `</details>` means there was no body
    // to lose in the first place.
    if (summaryAt !== null) {
      if (!blank && !/^\s*<\/details\s*>/i.test(markup)) {
        warn(summaryAt, "summary-blank-line", SUMMARY_BLANK_LINE);
      }
      summaryAt = null;
    }

    const opens = markup.match(/<details\b/gi)?.length ?? 0;
    const closes = markup.match(/<\/details\s*>/gi)?.length ?? 0;

    // Verified against `parseDocFile` rather than assumed: a heading inside a
    // collapsible is visited like any other and becomes an entry in the page's
    // TOC. Following that entry scrolls the reader to a fold they then have to
    // find and open — a table of contents pointing at something not on screen.
    if (!inCode && depth > 0 && /^ {0,3}#{1,6}(\s|$)/.test(text)) {
      warn(
        line,
        "heading-in-details",
        `${quote(text)} is a heading inside a <details> — parseDocFile puts it in the page TOC, pointing at content the reader cannot see`,
      );
    }

    // The line that opens a collapsible belongs to it, so neither `<details>`
    // nor the `<summary>` beside it is ever counted as words a reader can see.
    const inside = depth > 0 || opens > 0;
    const here = countWords(text);
    words += here;

    depth += opens;
    opened += opens;
    if (opens > 0 && block === null) block = { line, words: 0 };

    if (inside) {
      if (block !== null) block.words += here;
    } else {
      visible += here;
    }

    // A closing tag with nothing open is counted twice over — once in the raw
    // total the warning quotes, and once as a crossed pair. Without the second
    // number a page that closes a collapsible it never opened and then opens
    // one it never closes balances on paper, one and one, and reports nothing
    // at all — while the unclosed half has already taken the visible word count
    // with it. Two tags that cancel in the count are not two tags that pair up.
    closed += closes;
    crossed += Math.max(0, closes - depth);
    depth = Math.max(0, depth - closes);
    if (depth === 0 && block !== null) {
      if (block.words > DETAILS_WORD_BUDGET) {
        warn(
          block.line,
          "details-length",
          `this <details> holds ${block.words} word(s), over the ${DETAILS_WORD_BUDGET} budget — that is a page in its own right, not an aside`,
        );
      }
      block = null;
    }

    // Where the body sits relative to `</summary>` is the whole rule, and it
    // can sit on either side of the newline. Trailing text on the closing tag's
    // own line is the same defect as text on the line below it — checked
    // against `parseDocFile` rather than assumed, and both forms come back with
    // `**bold** and a [link](/docs)` still spelled that way in `plainText`,
    // where the blank-line form comes back as `bold and a link`. So a line with
    // something after the tag warns here and now, and a line that ends at the
    // tag arms the check above for whatever the next line turns out to be.
    const trailing = afterSummary(text, markup);
    if (trailing !== null) {
      if (trailing.trim() === "") {
        summaryAt = line;
      } else if (!/^\s*<\/details\s*>/i.test(trailing)) {
        warn(line, "summary-blank-line", SUMMARY_BLANK_LINE);
      }
    }
  }

  // A collapsible still open at the end of the file is never measured: its
  // length is however much of the file happened to follow it, which says
  // nothing about the collapsible. What those words are not allowed to do is
  // vanish. Everything below an opening tag was set aside as hidden on the
  // strength of a closing tag that never came, and `visible` — the number
  // `page-length` is decided on — has quietly collapsed to whatever sat above
  // the tag, which on a page that opens with a fold is nothing. Giving those
  // words back is the difference between a page reporting both defects it has,
  // the broken tag and the length, and reporting only the one that is quicker
  // to see.
  if (block !== null) visible += block.words;

  const page: CheckWarning[] = [];

  if (visible > VISIBLE_WORD_BUDGET) {
    page.push({
      file,
      line: null,
      rule: "page-length",
      message: `${visible} visible word(s), over the ${VISIBLE_WORD_BUDGET} budget — split it, or fold what a reader needs only once into <details>`,
    });
  }

  if (opened !== closed || crossed > 0) {
    const orphaned =
      crossed > 0 ? `, ${crossed} of the closers with nothing open` : "";
    page.push({
      file,
      line: null,
      rule: "unbalanced-details",
      message: `${opened} <details> and ${closed} </details>${orphaned} — the collapsibles on this page do not pair up`,
    });
  }

  // `parseDocFile` takes the description from front matter and nowhere else —
  // there is no fallback to the first paragraph — so a long page without one
  // ships with no meta description and a blank space where its blurb goes.
  if (
    words > DESCRIBE_ABOVE_WORDS &&
    typeof frontmatter.description !== "string"
  ) {
    page.push({
      file,
      line: null,
      rule: "missing-description",
      message: `${words} word(s) and no description in front matter — no meta description, and no blurb beside the page in folder listings or search results`,
    });
  }

  // Page-wide warnings first: they are what the page is, and the anchored ones
  // are where someone would start fixing it.
  return [...page, ...anchored];
}

/* Output ----------------------------------------------------------------- */

/**
 * The house `[docs-build]` line, then every warning, each in the
 * `path:line: message` shape a terminal knows how to open.
 *
 * Every warning is printed and none are capped, which stays affordable because
 * generated pages never reach here. A lint that decided which of your pages you
 * were allowed to hear about would be the second thing on this page nobody
 * reads.
 */
export function printCheckSummary(
  summary: CheckSummary,
  contentRoot: string,
): void {
  const into = path.basename(contentRoot);
  const skipped =
    summary.skipped > 0 ? `, ${summary.skipped} generated page(s) skipped` : "";

  if (summary.warnings.length === 0) {
    console.log(
      `[docs-build] checked ${summary.pages} page(s) in ${into}/${skipped} — no warnings`,
    );
    return;
  }

  console.log(
    `[docs-build] checked ${summary.pages} page(s) in ${into}/${skipped} — ${summary.warnings.length} warning(s), all of them below:`,
  );
  for (const warning of summary.warnings) {
    const at = warning.line === null ? "" : `:${warning.line}`;
    console.log(`[docs-build] warn: ${warning.file}${at}: ${warning.message}`);
  }
}

/* Files ------------------------------------------------------------------ */

/**
 * Markdown paths below `dir`, relative to it, extension kept.
 *
 * Close kin to `walk` in compile.ts, and separate on purpose. The compiler
 * hands out parsed pages with the front matter already taken off the top; this
 * lint needs the file as it sits on disk, because every line number it prints
 * has to be the line a person opens. Reading it again costs one `readFileSync`
 * per page and buys the bare mode a summary line without making it pay for a
 * second `remark` pass over everything.
 *
 * The two can disagree about which files are pages without anything breaking:
 * the worst a divergence does here is warn about a file the site never shows.
 */
function markdownFiles(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || NOT_A_PROJECT.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...markdownFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md")) {
      found.push(rel);
    }
  }
  return found;
}

/** Any `reference/` segment, at any depth, means `gen` wrote this page. */
export function isGenerated(file: string): boolean {
  return file.split("/").includes(REFERENCE_SEGMENT);
}

/** Three dashes alone on a line, at the margin: a front matter delimiter. */
const DELIMITER = /^---\s*$/;

/**
 * The 0-based index of the first line of the body.
 *
 * Front matter is stepped over by hand rather than handed to `matter`, which
 * returns a body with no record of how many lines it removed. Every line number
 * below would otherwise be short by the height of the front matter block on
 * every page that has one — the difference between a warning you can click and
 * a warning you have to go hunting for.
 *
 * That the delimiter has to sit at the margin is not pedantry, and it is the
 * one place this can disagree with `matter()` and quietly skew every count on
 * the page. A `description: |` opens a YAML block scalar, and a `---` indented
 * inside one is a line of the description; gray-matter reads it that way — put
 * to it here, it returns the whole scalar and a body that starts after the real
 * delimiter — so a scanner that stopped at the indented line would count the
 * remaining YAML as body words toward `page-length` and `missing-description`.
 * The opening delimiter runs the other way: gray-matter takes a file that does
 * not begin with `---` as having no front matter at all, so a ` ---` first line
 * is body, and stepping over it would hide real lines from every rule.
 */
function bodyStart(lines: string[]): number {
  if (!DELIMITER.test(lines[0] ?? "")) return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (DELIMITER.test(lines[index] ?? "")) return index + 1;
  }
  // An opening delimiter that never closes is not front matter: it is a
  // thematic break, and everything under it is body.
  return 0;
}

/* Text ------------------------------------------------------------------- */

/**
 * Words on one line: whitespace-separated tokens carrying at least one letter
 * or digit, with HTML tags dropped first so that `<summary>` is markup rather
 * than a word while the text inside it still counts.
 *
 * Code counts like everything else, fenced or indented. A page does not get
 * shorter by moving its bulk into a fence — the reader scrolls past it either
 * way — and a budget that skipped code would be a budget anything could duck
 * under. Tracking the code forms is about what is markup, never about what is
 * long.
 */
function countWords(text: string): number {
  return text
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/**
 * The line with every code span replaced by a space, so what remains is only
 * the text that could be markup.
 *
 * A code span cannot open an element — `` `<details>` `` on a page is a
 * sentence about a collapsible, not a collapsible — and this repository writes
 * that sentence: the comments above say it, and `gen` prints these very doc
 * comments onto a reference page. Matching a run of backticks against a closing
 * run of the same length is CommonMark's own rule, which is what makes a span
 * holding a backtick work.
 */
function stripCodeSpans(text: string): string {
  return text.replace(/(`+)[^`]*?\1/g, " ");
}

/**
 * What follows the last `</summary>` on this line, or null when the line has
 * none that is markup.
 *
 * Both readings of the line go in because neither answers the question alone.
 * The tag has to be found in `markup`: a line reading "mind the blank line
 * after `</summary>`" is prose about a collapsible, and the span holding it is
 * already blanked out there. But `stripCodeSpans` leaves a single space where a
 * span was, so `markup` cannot say whether anything follows the tag when what
 * follows is itself a code span — which is a body CommonMark swallows like any
 * other. When both readings hold the same number of closing tags, none of them
 * was inside a span, and the line as the author typed it is the honest one to
 * slice.
 */
function afterSummary(text: string, markup: string): string | null {
  const inMarkup = markup.split(SUMMARY_CLOSE).length - 1;
  if (inMarkup === 0) return null;

  const line =
    text.split(SUMMARY_CLOSE).length - 1 === inMarkup ? text : markup;
  return line.split(SUMMARY_CLOSE).at(-1) ?? "";
}

/** A line echoed back inside a warning, short enough to sit in one. */
function quote(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > QUOTE_LIMIT
    ? `"${trimmed.slice(0, QUOTE_LIMIT)}…"`
    : `"${trimmed}"`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
