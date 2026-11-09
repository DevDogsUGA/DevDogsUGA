import type { ReactNode } from "react";
import { GithubLogoIcon } from "@phosphor-icons/react/ssr";
import DocsBreadcrumbs from "~/classic/components/DocsBreadcrumbs";
import DocsCodeCopy from "~/components/DocsCodeCopy";
import DocsGithubLogin from "~/components/DocsGithubLogin";
import DocsDiff from "~/classic/components/DocsDiff";
import DocsVscode from "~/classic/components/DocsVscode";
import TableOfContents, {
  InlineTableOfContents,
} from "~/classic/components/TableOfContents";
import { cn } from "~/lib/cn";
import { splitDocsDiffs } from "~/lib/docsDiffs";
import type { DocHeading, TOCItem } from "~/lib/toc";

interface Props {
  /** Rendered at build time by @devdogsuga/docs-kit. */
  html: string;
  /** Headings extracted at build time by @devdogsuga/docs. */
  headings: DocHeading[];
  breadcrumbs?: string[];
  githubUrl?: string;
  /** Under the article: a course page's step pager. */
  footer?: ReactNode;
  /** A note above the article, such as the live preview's. */
  notice?: ReactNode;
  /**
   * A page from a project's own repository rather than this one: never offers
   * the VS Code handoff, which opens a path in the club's checkout.
   */
  external?: boolean;
}

export default function DocPageContent({
  html,
  headings,
  breadcrumbs,
  githubUrl,
  footer,
  notice,
  external = false,
}: Props) {
  // Only a local build shows the "Review in VS Code" links.
  const vscode =
    !external && (process.env.DEPLOY_ENV ?? "development") === "development";
  const toc: TOCItem[] = headings.map((h) => ({
    title: h.title,
    url: `#${h.id}`,
    depth: h.depth,
  }));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto px-6 py-10 lg:px-10">
          <InlineTableOfContents items={toc} />

          {notice && (
            <p className="mx-auto mb-4 max-w-3xl text-sm text-mauve-400">
              {notice}
            </p>
          )}

          {(breadcrumbs && breadcrumbs.length > 0) || githubUrl ? (
            <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-4">
              {breadcrumbs && <DocsBreadcrumbs items={breadcrumbs} />}
              {githubUrl && (
                // The navbar link treatment, so it reads as chrome around the
                // article rather than a link inside it.
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mr-2 flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white"
                >
                  <GithubLogoIcon className="size-4" />
                  Edit on GitHub
                </a>
              )}
            </div>
          ) : null}

          <article
            className={cn(
              "prose prose-invert mx-auto max-w-3xl",
              !vscode && "docs-no-vscode",
            )}
          >
            {splitDocsDiffs(html).map((part, i) =>
              part.kind === "diff" ? (
                <DocsDiff
                  key={i}
                  file={part.file}
                  lang={part.lang}
                  icon={part.icon}
                  patch={part.patch}
                  oldContent={part.oldContent}
                  newContent={part.newContent}
                  href={part.href}
                  vscode={vscode ? part.vscode : undefined}
                />
              ) : (
                // Our own repo's markdown, compiled at build time; nothing a
                // visitor wrote reaches this string. `contents`, so the
                // prose styles see its elements as the article's own.
                <div
                  key={i}
                  className="contents"
                  dangerouslySetInnerHTML={{ __html: part.html }}
                />
              ),
            )}
          </article>
          {footer}
          <DocsCodeCopy />
          {vscode && <DocsVscode />}
          <DocsGithubLogin />
        </div>

        {toc.length > 0 && (
          <div className="hidden w-52 shrink-0 lg:block xl:w-64">
            <div className="sticky top-16 max-h-[calc(100vh-var(--spacing)*16)] overflow-auto py-10 pr-4">
              <TableOfContents items={toc} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
