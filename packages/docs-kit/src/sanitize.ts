/**
 * Fails the build on markup that would run script in the reader's browser.
 *
 * Pages are written in markdown with raw HTML allowed (`<details>`, inline
 * SVG, the diff placeholders), and the platform injects the result as-is. It
 * caches that HTML and stamps its CSP nonce onto every `<script>` in it at the
 * edge, so a `<script>` written into a page would be trusted exactly like the
 * site's own. This check is what makes that safe.
 *
 * Three things are refused, and nothing is stripped: a page that asked for
 * script and silently lost it would look fine in review and broken to
 * readers. The author gets told instead.
 *   - any `<script>` element, HTML or SVG;
 *   - any `on*` event-handler attribute;
 *   - any attribute whose value is a `javascript:` URL. Every attribute is
 *     checked rather than a list of URL attributes, because SVG animation
 *     (`<set to="javascript:…">`) can write a URL into an attribute the list
 *     would not name.
 *
 * Runs right after `rehype-raw`, the first point where raw HTML in the page
 * is elements rather than a string.
 */
import type { Element, Root as HastRoot } from "hast";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
import { DocsBuildError } from "./errors.js";
import type { VariantContext } from "./variants.js";

/**
 * What a browser does to a URL before reading its scheme: strip leading and
 * trailing C0 controls and spaces, and drop tabs and newlines anywhere. Doing
 * the same here keeps `java\tscript:` from slipping past.
 */
function isJavascriptUrl(value: string): boolean {
  return value
    .replace(/[\u0000- ]/g, "")
    .toLowerCase()
    .startsWith("javascript:");
}

function problemWith(node: Element): string | null {
  if (node.tagName === "script") return "`<script>` elements aren't allowed";
  for (const [name, value] of Object.entries(node.properties)) {
    if (/^on./i.test(name)) {
      return `event-handler attributes aren't allowed (\`${name.toLowerCase()}\` on \`<${node.tagName}>\`)`;
    }
    const values = Array.isArray(value) ? value : [value];
    if (values.some((v) => typeof v === "string" && isJavascriptUrl(v))) {
      return `\`javascript:\` URLs aren't allowed (\`${name}\` on \`<${node.tagName}>\`)`;
    }
  }
  return null;
}

export function rehypeRefuseScript() {
  return (tree: HastRoot, file: VFile) => {
    const ctx = (file.data as { variants?: VariantContext }).variants;
    visit(tree, "element", (node: Element) => {
      const problem = problemWith(node);
      if (!problem) return;
      const line = node.position?.start.line;
      const where = ctx
        ? `${ctx.file}${line === undefined ? "" : `:${line}`} (in ${ctx.project})`
        : "page";
      throw new DocsBuildError(
        `${where}: ${problem}. Docs pages can't run script; the site trusts every script in a page's HTML.`,
      );
    });
  };
}
