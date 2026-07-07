import rehypeShiki from "@shikijs/rehype";
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
 * The single markdown pipeline for documentation, shared by the published
 * /docs pages and the local docs-preview tool. Renders on the server; callers
 * own caching.
 */
export default function DocsMarkdown({ source }: { source: string }) {
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
