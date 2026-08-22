import { GithubLogoIcon } from "@phosphor-icons/react/ssr";
import DocsMarkdown from "~/components/DocsMarkdown";
import TableOfContents, {
  InlineTableOfContents,
} from "~/components/TableOfContents";
import type { DocHeading, TOCItem } from "~/lib/toc";

interface Props {
  source: string;
  /** Headings extracted at build time by @devdogsuga/docs. */
  headings: DocHeading[];
  breadcrumbs?: string[];
  githubUrl?: string;
}

export default async function DocPageContent({
  source,
  headings,
  breadcrumbs,
  githubUrl,
}: Props) {
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

          {(breadcrumbs && breadcrumbs.length > 0) || githubUrl ? (
            <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-4">
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap items-center gap-1 text-sm text-mauve-400">
                    {breadcrumbs.map((crumb, i) => (
                      <li key={i} className="flex items-center gap-1">
                        {i > 0 && (
                          <span aria-hidden className="text-mauve-600">
                            /
                          </span>
                        )}
                        <span>{crumb}</span>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
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

          <article className="prose prose-invert mx-auto max-w-3xl">
            <DocsMarkdown source={source} />
          </article>
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
