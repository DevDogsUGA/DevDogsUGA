/**
 * The Markdown → HTML pipeline, with the code highlighter left to the caller.
 *
 * Everything except how a fenced block is coloured is one plugin list, so a
 * page renders the same however it is highlighted: `render.ts` plugs in Shiki
 * (build, CI and `docs-kit check`), `render-plain.ts` plugs in a frame with no
 * colour (the platform's live preview, see `plain-code.ts`). Nothing here
 * imports Shiki, which is what lets the Worker take the plain renderer without
 * the highlighter.
 *
 * The plugin list is the one the platform ran, in the same order, so a page
 * renders the same; `remarkVariants`, `remarkDiffs`, `rehypeScrollTables`,
 * `rehypeCopyableCells` (tables.ts) and `rehypeSanitizeHtml` (sanitize.ts) are
 * the only additions.
 */
import type { Element, Root as HastRoot } from "hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import rehypeUnwrapImages from "rehype-unwrap-images";
import remarkDirective from "remark-directive";
import remarkEmoji from "remark-emoji";
import remarkGfm from "remark-gfm";
import { remarkAlert } from "remark-github-blockquote-alert";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkSmartypants from "remark-smartypants";
import { unified, type Pluggable } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import { remarkKeepMeta } from "./codeblocks.js";
import { remarkDiffs } from "./diffs.js";
import { remarkRewriteLinks, type LinkSource } from "./links.js";
import {
  rehypeExternalLinks,
  rehypeMarkGenerated,
  rehypePrefixIds,
  rehypeSanitizeHtml,
  remarkCheckFenceLinks,
  type RenderPolicy,
} from "./sanitize.js";
import { rehypeCopyableCells } from "./tables.js";
import { remarkVariants, type VariantContext } from "./variants.js";

/** Renders one page body to HTML. `render.ts` and `render-plain.ts` each make one. */
export type BodyRenderer = (
  content: string,
  ctx: VariantContext,
  from?: LinkSource,
  policy?: RenderPolicy,
) => Promise<string>;

/**
 * Tables render at their natural width, which on a phone can exceed the
 * article column. Each one scrolls inside its own container rather than
 * stretching the page sideways.
 */
function rehypeScrollTables() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "table" || !parent || index === undefined) return;
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: { className: ["overflow-x-auto"] },
        children: [node],
      };
      return index + 1;
    });
  };
}

/** Everything before the highlighter. */
const BEFORE_CODE: Pluggable[] = [
  remarkParse,
  remarkDirective,
  remarkGfm,
  remarkMath,
  // Before remark-emoji: it puts back the `:word` text directives an emoji
  // shortcode parses as, which remark-emoji then needs to see as text.
  remarkVariants,
  // Content links pages by relative file path (links.ts); the site wants URLs.
  remarkRewriteLinks,
  // After the variants, so a diff inside a resolved variant is still nested
  // (and left alone), and before the highlighter could ever see the block.
  remarkCheckFenceLinks,
  remarkDiffs,
  remarkKeepMeta,
  remarkSmartypants,
  remarkEmoji,
  remarkAlert,
  [remarkRehype, { allowDangerousHtml: true }],
  rehypeMarkGenerated,
  rehypeRaw,
  rehypeSanitizeHtml,
  rehypeExternalLinks,
  rehypeSlug,
  // Untrusted docs only: ids get a per-project prefix before the heading links are built.
  rehypePrefixIds,
  [rehypeAutolinkHeadings, { behavior: "wrap" }],
  rehypeUnwrapImages,
];

/** Everything after it. */
const AFTER_CODE: Pluggable[] = [
  rehypeKatex,
  // The highlighter's frame adds the fence's GitHub link; it gets the same rel.
  // A distinct function: unified folds a repeated plugin into its first use.
  () => rehypeExternalLinks(),
  rehypeCopyableCells,
  rehypeScrollTables,
  rehypeStringify,
];

/**
 * A renderer whose code blocks are handled by `code`: a rehype plugin that
 * runs after the images are unwrapped and before the maths.
 */
export function createBodyRenderer(code: Pluggable): BodyRenderer {
  const processor = unified()
    .use(BEFORE_CODE)
    .use([code])
    .use(AFTER_CODE)
    .freeze();
  return async (content, ctx, from, policy) => {
    const file = new VFile({
      value: content,
      data: {
        variants: ctx,
        link: from ?? { project: ctx.project, source: `${ctx.project}/index` },
        ...(policy ? { policy } : {}),
      },
    });
    return String(await processor.process(file));
  };
}
