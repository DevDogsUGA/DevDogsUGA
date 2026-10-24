import type { ReactNode } from "react";
import { PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import "~/components/Docs/docs.css";
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
  /** Rendered at build time by @devdogsuga/docs-kit. */
  html: string;
  /** Headings extracted at build time by @devdogsuga/docs. */
  headings: DocHeading[];
  breadcrumbs?: string[];
  /** The page's own title, closing the trail. */
  title?: string;
  /** A small line over the title, e.g. "Step 2 of 4". */
  eyebrow?: ReactNode;
  githubUrl?: string;
  /** Under the article: a course page's step pager. */
  footer?: ReactNode;
  /** Above the article: the preview's "Scheduled" mark. */
  notice?: ReactNode;
  /**
   * A page from a project's own repository (published through the docs
   * pipeline) rather than this one: never offers the VS Code handoff, which
   * opens a path in the club's checkout.
   */
  external?: boolean;
}

export default function DocPageContent({
  html,
  headings,
  breadcrumbs,
  title,
  eyebrow,
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
    <div className="docs-page">
      <div className="docs-main">
        {notice && <div className="docs-sched-note">{notice}</div>}

        {(breadcrumbs && breadcrumbs.length > 0) || githubUrl ? (
          <div className="docs-bar">
            {breadcrumbs ? (
              <DocsBreadcrumbs items={breadcrumbs} current={title} />
            ) : (
              <span />
            )}
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="textlink"
              >
                <PencilSimpleIcon weight="bold" aria-hidden />
                Edit on GitHub
              </a>
            )}
          </div>
        ) : null}

        <InlineTableOfContents items={toc} />
        {eyebrow && <div className="eyebrow docs-eyebrow">{eyebrow}</div>}

        <article className={cn("docs-prose", !vscode && "docs-no-vscode")}>
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
              // Markdown compiled ahead of time: this repo's at build time, or
              // a project's (`external`) by the docs pipeline, which refuses
              // script, handlers, styles, classes and external images before a
              // reviewer ever sees it. Nothing a visitor wrote reaches this
              // string, and it is not processed again here. `contents`, so the
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
        <aside className="docs-tocwrap" aria-label="On this page">
          <TableOfContents items={toc} />
        </aside>
      )}
    </div>
  );
}
