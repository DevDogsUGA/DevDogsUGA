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
 * This is the highlighted renderer: build, CI and `docs-kit check`. The
 * plugin list around the highlighter is in `render-pipeline.ts`, shared with
 * the plain renderer the Worker uses (`render-plain.ts`), because Shiki's
 * Oniguruma engine is exactly what a Worker cannot run.
 */
import rehypeShiki from "@shikijs/rehype";
import { docsCodeBlocks } from "./codeblocks.js";
import { createBodyRenderer, type BodyRenderer } from "./render-pipeline.js";

const render: BodyRenderer = createBodyRenderer([
  rehypeShiki,
  {
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
  },
]);

/**
 * One emitted copy's body as HTML, variants resolved for its project and
 * relative page links rewritten to site URLs. `from` is where the page's
 * links are resolved from; a body with no internal links can leave it out.
 */
export const renderBody: BodyRenderer = render;
