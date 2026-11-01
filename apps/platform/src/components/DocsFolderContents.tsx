import { FileTextIcon, FolderIcon } from "@phosphor-icons/react/ssr";
import DocsBreadcrumbs from "~/components/DocsBreadcrumbs";
import { Mark } from "~/components/DocsProjectMark";
import "~/components/Docs/docs.css";
import DocsTileGrid from "~/components/DocsTileGrid";
import { DOCS_BASE, docsHref } from "~/lib/docsSlug";
import type { DocsFolderEntry } from "~/server/docs/queries";

interface Props {
  project: string;
  title: string;
  breadcrumbs: string[];
  entries: DocsFolderEntry[];
  /** `/docs`, or the preview's prefix. */
  base?: string;
}

/**
 * What a folder shows when it has no index page to stand in for it: its
 * contents, as the same tiles the docs landing page offers projects on.
 *
 * The marks wear the project's own fill rather than a colour per entry.
 * Every tile here belongs to one section of one project, so a colour would be
 * decoration pretending to be information. The glyph still separates a page
 * from a subfolder you can open.
 */
export default function DocsFolderContents({
  project,
  title,
  breadcrumbs,
  entries,
  base = DOCS_BASE,
}: Props) {
  return (
    <div className="docs-main docs-folder">
      <div className="docs-bar">
        <DocsBreadcrumbs items={breadcrumbs} current={title} />
      </div>
      <div className="docs-prose">
        <h1>{title}</h1>
        <p>Everything filed under this section.</p>
      </div>

      {entries.length > 0 ? (
        <div style={{ marginTop: 32 }}>
          <DocsTileGrid
            tiles={entries.map((entry) => ({
              href: docsHref(project, entry.path.split("/"), base),
              title: entry.title,
              description: entry.description,
              mark: (
                <Mark
                  icon={entry.kind === "folder" ? FolderIcon : FileTextIcon}
                  size="lg"
                />
              ),
            }))}
          />
        </div>
      ) : (
        <p className="docs-hubfoot">This section is empty.</p>
      )}
    </div>
  );
}
