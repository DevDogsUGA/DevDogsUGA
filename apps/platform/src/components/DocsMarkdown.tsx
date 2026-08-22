import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { cacheLife } from "next/cache";
import { MarkdownAsync } from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeUnwrapImages from "rehype-unwrap-images";
import remarkEmoji from "remark-emoji";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { remarkAlert } from "remark-github-blockquote-alert";
import remarkMath from "remark-math";
import remarkSmartypants from "remark-smartypants";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * One highlighter for the process, on Shiki's JAVASCRIPT regex engine.
 *
 * Not the stock `@shikijs/rehype` plugin, whose bundled highlighter compiles
 * the Oniguruma engine's Wasm at request time — and the Workers runtime
 * forbids `WebAssembly.compile()` outright ("Wasm code generation disallowed
 * by embedder"). On the first staging deploy that CompileError surfaced as an
 * unhandled rejection inside MarkdownAsync, the response promise never
 * settled, and every page render hung until the runtime killed the request.
 * Prerendered pages hid it locally; any `◐` partial-prerender revalidating in
 * the Worker hit it.
 *
 * The deep `shiki/dist/...` paths are that package's published `./*` export —
 * each is a one-line re-export of `@shikijs/langs/*` / `@shikijs/themes/*`,
 * reached through the direct `shiki` dependency so no transitive package is
 * imported. The langs here must cover what DocsMarkdown's option list names.
 */
const highlighterPromise = createHighlighterCore({
  themes: [import("shiki/dist/themes/rose-pine-moon.mjs")],
  langs: [
    import("shiki/dist/langs/bash.mjs"),
    import("shiki/dist/langs/css.mjs"),
    // Dart arrives with the generated Flutter reference, whose every signature
    // is Dart source. Without the grammar those blocks fall back to `text` and
    // lose their highlighting silently.
    import("shiki/dist/langs/dart.mjs"),
    import("shiki/dist/langs/diff.mjs"),
    import("shiki/dist/langs/graphql.mjs"),
    import("shiki/dist/langs/html.mjs"),
    import("shiki/dist/langs/http.mjs"),
    import("shiki/dist/langs/java.mjs"),
    import("shiki/dist/langs/javascript.mjs"),
    import("shiki/dist/langs/json.mjs"),
    import("shiki/dist/langs/jsx.mjs"),
    import("shiki/dist/langs/markdown.mjs"),
    import("shiki/dist/langs/python.mjs"),
    import("shiki/dist/langs/sql.mjs"),
    import("shiki/dist/langs/toml.mjs"),
    import("shiki/dist/langs/tsx.mjs"),
    import("shiki/dist/langs/typescript.mjs"),
    import("shiki/dist/langs/yaml.mjs"),
  ],
  // `forgiving` skips the rare grammar rule the JS engine cannot translate
  // instead of throwing — a partially-highlighted block beats a hung render.
  engine: createJavaScriptRegexEngine({ forgiving: true }),
});

/**
 * The single markdown pipeline for documentation.
 *
 * `"use cache"` is required, not an optimisation: something in this plugin
 * chain reads `Date.now()`, which Cache Components forbids during a prerender
 * unless it happens inside a cached function. It is also exactly right
 * semantically — the rendered output is a pure function of `source`, so
 * `cacheLife("max")` is accurate, and because every docs page is prerendered
 * the entry is baked into the static output rather than needing a runtime
 * cache store (which the Cloudflare adapter does not have configured).
 */
export default async function DocsMarkdown({ source }: { source: string }) {
  "use cache";
  cacheLife("max");

  const highlighter = await highlighterPromise;

  return (
    <MarkdownAsync
      components={{
        // Tables render at their natural width, which on a phone can exceed
        // the article column — scroll the table inside its own container
        // rather than letting it stretch the page sideways.
        table: ({ node: _node, ...props }) => (
          <div className="overflow-x-auto">
            <table {...props} />
          </div>
        ),
      }}
      remarkPlugins={[
        remarkFrontmatter,
        remarkGfm,
        remarkMath,
        remarkSmartypants,
        remarkEmoji,
        remarkAlert,
      ]}
      rehypePlugins={[
        rehypeRaw,
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
        rehypeUnwrapImages,
        [
          rehypeShikiFromHighlighter,
          highlighter,
          {
            // `rose-pine-moon` rather than a stock dark theme: its base hues
            // are the same muted violet family as the mauve palette, so
            // highlighted code sits in the page instead of on top of it.
            //
            // Registered as a *named* theme with `defaultColor: false` even
            // though there is only one. That combination stops Shiki writing
            // literal `color:`/`background-color:` into the markup and makes
            // it emit `--shiki-dark` custom properties instead — which is what
            // lets globals.css decide the chrome (the `<pre>` background comes
            // from `--card` via the prose variables) while the theme keeps
            // ownership of the token colors. With an inline background, no
            // amount of CSS could retheme the block short of `!important`.
            themes: { dark: "rose-pine-moon" },
            defaultColor: false,
            // The language LIST lives on the highlighter above — the core
            // plugin renders with whatever that instance loaded.
            fallbackLanguage: "text",
          },
        ],
        rehypeKatex,
      ]}
    >
      {source}
    </MarkdownAsync>
  );
}
