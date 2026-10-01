/**
 * Markdown → HTML, at build time.
 *
 * This used to happen in the platform, per request, through react-markdown.
 * Moving it here does three things. The variants in `variants.ts` need the
 * project a copy was mounted into, which only this package knows. Shiki can
 * run on its Oniguruma engine and load any grammar on demand, where the
 * Workers runtime forbids compiling Wasm and pinned the platform to a
 * hand-listed set of languages on the JavaScript engine. And the Worker ships
 * finished HTML rather than a markdown pipeline.
 *
 * The plugin list is the one the platform ran, in the same order, so a page
 * renders the same; `remarkVariants`, `remarkDiffs`, `rehypeScrollTables`,
 * `rehypeCopyableCells` (tables.ts) and `rehypeRefuseScript` (sanitize.ts) are
 * the only additions.
 */
import rehypeShiki from "@shikijs/rehype";
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
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import { docsCodeBlocks, remarkKeepMeta } from "./codeblocks.js";
import { remarkDiffs } from "./diffs.js";
import { rehypeRefuseScript } from "./sanitize.js";
import { rehypeCopyableCells } from "./tables.js";
import { remarkVariants, type VariantContext } from "./variants.js";

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

const processor = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkGfm)
  .use(remarkMath)
  // Before remark-emoji: it puts back the `:word` text directives an emoji
  // shortcode parses as, which remark-emoji then needs to see as text.
  .use(remarkVariants)
  // After the variants, so a diff inside a resolved variant is still nested
  // (and left alone), and before Shiki could ever see the block.
  .use(remarkDiffs)
  .use(remarkKeepMeta)
  .use(remarkSmartypants)
  .use(remarkEmoji)
  .use(remarkAlert)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeRefuseScript)
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, { behavior: "wrap" })
  .use(rehypeUnwrapImages)
  .use(rehypeShiki, {
    // `rose-pine-moon` because its base hues are the same muted violet family
    // as the site's mauve palette. Registered as a *named* theme with
    // `defaultColor: false` so Shiki writes `--shiki-dark` custom properties
    // instead of literal colors: the platform's CSS owns the block's chrome,
    // the theme keeps the token colors.
    themes: { dark: "rose-pine-moon" },
    defaultColor: false,
    lazy: true,
    fallbackLanguage: "text",
    // The frame, line numbers and terminal prompts (codeblocks.ts).
    transformers: [docsCodeBlocks()],
  })
  .use(rehypeKatex)
  .use(rehypeCopyableCells)
  .use(rehypeScrollTables)
  .use(rehypeStringify);

/** One emitted copy's body as HTML, variants resolved for its project. */
export async function renderBody(
  content: string,
  ctx: VariantContext,
): Promise<string> {
  const file = new VFile({ value: content, data: { variants: ctx } });
  return String(await processor.process(file));
}
