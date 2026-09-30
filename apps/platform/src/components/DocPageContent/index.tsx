import type { ReactNode } from "react";
import { GithubLogoIcon } from "@phosphor-icons/react/ssr";
import DocsBreadcrumbs from "~/components/DocsBreadcrumbs";
import DocsCodeCopy from "~/components/DocsCodeCopy";
import DocsGithubLogin from "~/components/DocsGithubLogin";
import DocsDiff from "~/components/DocsDiff";
import DocsVscode from "~/components/DocsVscode";
import TableOfContents, {
  InlineTableOfContents,
} from "~/components/TableOfContents";
import { cn } from "~/lib/cn";
import { splitDocsDiffs } from "~/lib/docsDiffs";
import type { DocHeading, TOCItem } from "~/lib/toc";

interface Props {
  /** Rendered at build time by @devdogsuga/docs-compiler. */
  html: string;
  /** Headings extracted at build time by @devdogsuga/docs. */
  headings: DocHeading[];
  breadcrumbs?: string[];
  githubUrl?: string;
  /** Under the article: a course page's step pager. */
  footer?: ReactNode;
  /** Above the article: the preview's "Scheduled" mark. */
  notice?: ReactNode;
}

export default function DocPageContent({
  html,
  headings,
  breadcrumbs,
  githubUrl,
  footer,
  notice,
}: Props) {
  // Only a local build shows the "Review in VS Code" links.
  const vscode = (process.env.DEPLOY_ENV ?? "development") === "development";
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
            <div className="mx-auto mb-4 max-w-3xl rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2">
              {notice}
            </div>
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
