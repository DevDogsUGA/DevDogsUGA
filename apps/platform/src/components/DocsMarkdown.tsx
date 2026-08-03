import rehypeShiki from "@shikijs/rehype";
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

  return (
    <MarkdownAsync
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
          rehypeShiki,
          {
            theme: "vitesse-dark",
            langs: [
              "bash",
              "css",
              "diff",
              "graphql",
              "html",
              "http",
              "java",
              "javascript",
              "json",
              "jsx",
              "markdown",
              "python",
              "sql",
              "toml",
              "tsx",
              "typescript",
              "yaml",
            ],
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
