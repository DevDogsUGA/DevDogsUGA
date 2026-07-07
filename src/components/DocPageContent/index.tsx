import type { DocHeading, TOCItem } from "~/lib/toc";
import InlineTableOfContents from "~/components/InlineTableOfContents";
import TableOfContents from "~/components/TableOfContents";
import MDXContent from "./MDXContent";

interface Props {
  source: string;
  headings?: DocHeading[];
  breadcrumbs?: string[];
  githubUrl?: string;
}

export default async function DocPageContent({
  source,
  headings = [],
  breadcrumbs,
  githubUrl,
}: Props) {
  const toc: TOCItem[] = headings.map((h) => ({
    title: h.title,
    url: `#${h.id}`,
    depth: h.depth,
  }));

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto px-6 py-10 lg:px-10">
          <InlineTableOfContents items={toc} />

          {(breadcrumbs && breadcrumbs.length > 0) || githubUrl ? (
            <div className="mb-4 flex items-center justify-between gap-4">
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
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
                  className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Edit on GitHub
                </a>
              )}
            </div>
          ) : null}

          <article className="prose prose-invert mx-auto max-w-3xl">
            <MDXContent source={source} />
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
    </main>
  );
}
