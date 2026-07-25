import DocsMarkdown from "~/components/DocsMarkdown";
import InlineTableOfContents from "~/components/InlineTableOfContents";
import TableOfContents from "~/components/TableOfContents";
import type { DocHeading, TOCItem } from "~/lib/toc";
import { parseDocFile } from "~/server/docs/parse";

interface Props {
  source: string;
  /** Pre-extracted headings (as stored with published pages); derived from source when omitted. */
  headings?: DocHeading[];
  breadcrumbs?: string[];
  githubUrl?: string;
}

export default async function DocPageContent({
  source,
  headings,
  breadcrumbs,
  githubUrl,
}: Props) {
  const resolvedHeadings =
    headings ?? parseDocFile(source, "untitled").headings;

  const toc: TOCItem[] = resolvedHeadings.map((h) => ({
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
            <div className="mb-4 flex items-center justify-between gap-4">
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb">
                  <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
                    {breadcrumbs.map((crumb, i) => (
                      <li key={i} className="flex items-center gap-1">
                        {i > 0 && <span aria-hidden>/</span>}
                        <span>{crumb}</span>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              {githubUrl && (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0 text-sm transition-colors"
                >
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
            <div className="sticky top-0 overflow-auto py-10 pr-4">
              <TableOfContents items={toc} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
