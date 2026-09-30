import { FileTextIcon, FolderIcon } from "@phosphor-icons/react/ssr";
import DocsBreadcrumbs from "~/components/DocsBreadcrumbs";
import { Mark } from "~/components/DocsProjectMark";
import DocsTileGrid from "~/components/DocsTileGrid";
import { docsProjectMark } from "~/config/docs";
import DocsScheduled from "~/components/DocsScheduled";
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
  const { iconBg } = docsProjectMark(project);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10 lg:px-10">
      <div className="flex flex-col gap-1.5">
        <DocsBreadcrumbs items={breadcrumbs} />
        <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
        <p className="max-w-prose text-sm text-mauve-400">
          Everything filed under this section.
        </p>
      </div>

      {entries.length > 0 ? (
        <DocsTileGrid
          tiles={entries.map((entry) => ({
            href: docsHref(project, entry.path.split("/"), base),
            title: entry.title,
            description: entry.description,
            note: entry.publishAt && <DocsScheduled at={entry.publishAt} />,
            mark: (
              <Mark
                icon={entry.kind === "folder" ? FolderIcon : FileTextIcon}
                iconBg={iconBg}
                size="lg"
              />
            ),
          }))}
        />
      ) : (
        <p className="text-sm text-mauve-400">This section is empty.</p>
      )}
    </div>
  );
}
