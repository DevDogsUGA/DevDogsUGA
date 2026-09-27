"use client";

import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import { DOCS_INDEX_LABEL } from "~/config/docs";
import { docsHref } from "~/lib/docsSlug";
import {
  isIndexPage,
  type DocsSidebarSection,
  type DocsSidebarTree,
  type DocsTreeFolder,
  type DocsTreeNode,
} from "~/lib/docsTree";
import { cn } from "~/lib/cn";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/ui/collapsible";

interface TreeContext {
  project: string;
  activePath: string;
}

const PAGE_LINK =
  "flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white";

const ACTIVE_LINK =
  "data-active:bg-mauve-800/60 data-active:font-medium data-active:text-white";

function contains(folder: DocsTreeFolder, activePath: string) {
  return activePath === folder.path || activePath.startsWith(folder.path + "/");
}

/**
 * The disclosure control, drawn AFTER the label so it lands on the right edge
 * of the row. The label is `flex-1`, which pushes the caret to a rail every row
 * shares. Left of the label it sat at a different x on every nesting level, and
 * the indent already says how deep a row is.
 *
 * It stays a separate control from the link beside it, which is why this is not
 * a `<summary>`: the label navigates and the caret expands, so a reader who
 * wants the section's own page does not have to avoid a toggle to reach it.
 */
function Caret({ label, className }: { label: string; className: string }) {
  return (
    <CollapsibleTrigger
      aria-label={`Toggle ${label}`}
      className="group flex size-5 shrink-0 items-center justify-center rounded-sm text-mauve-500 transition-colors hover:bg-mauve-800 hover:text-white"
    >
      <CaretRightIcon
        className={cn(
          "transition-transform group-data-[state=open]:rotate-90",
          className,
        )}
      />
    </CollapsibleTrigger>
  );
}

/**
 * One of the sidebar's four fixed sections (Getting started, Guides,
 * Infrastructure, Reference) — a heading over the pages it holds, not a
 * destination of its own. Unlike a folder, a section has no `index.md` and no
 * URL: it is a grouping the compiler's frontmatter (or this app's own
 * fallback, see `pageSection` in `~/server/docs/queries`) assigns per page,
 * so the heading is plain text with a caret, never a link.
 *
 * Open by default, always, not only when it holds the current page. A tree
 * that opens exactly one section shows a reader the part they already found
 * and hides the rest behind carets they have to think to press, and the
 * sections are the table of contents. Nested folders still open on the
 * active path only, see `Folder`, because those are where the page counts
 * get large enough for open-everything to become unreadable.
 *
 * Most projects' `guides/`, `infrastructure/` and `reference/` folders map
 * one-to-one onto a section: every page physically under `reference/` lands
 * in the Reference section by the same fallback that names the section, so
 * `buildDocsSidebarSections` hands this a single top-level folder named
 * `reference` and nothing beside it. Rendering that folder as another row
 * under the "Reference" heading would repeat the word for no reason, so this
 * unwraps exactly that shape — one top-level folder whose OWN segment
 * matches the section id, holding everything the section has — and shows its
 * children directly. Anything less uniform (a section that mixes a folder
 * with a loose page, or a folder under some other name) renders as-is: the
 * unwrap is a cosmetic shortcut for the common case, not a rule the section
 * depends on.
 */
function SectionHeading({
  section,
  ctx,
}: {
  section: DocsSidebarSection;
  ctx: TreeContext;
}) {
  const [only] = section.nodes;
  const unwrap =
    section.nodes.length === 1 &&
    only?.type === "folder" &&
    only.segment === section.id;
  const children = unwrap && only ? only.children : section.nodes;

  return (
    <Collapsible defaultOpen>
      <div className="flex items-center gap-0.5">
        <CollapsibleTrigger className="min-w-0 flex-1 rounded-sm px-1.5 py-1 text-left text-xs font-semibold tracking-wide text-mauve-500 uppercase transition-colors hover:bg-mauve-800 hover:text-white">
          {section.label}
        </CollapsibleTrigger>
        <Caret label={section.label} className="size-3" />
      </div>
      <CollapsibleContent>
        <Nodes nodes={children} ctx={ctx} depth={1} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A folder below the first level: an inline row on its own rail. */
function Folder({
  folder,
  ctx,
  depth,
}: {
  folder: DocsTreeFolder;
  ctx: TreeContext;
  depth: number;
}) {
  const active = ctx.activePath === folder.path;

  return (
    <Collapsible defaultOpen={contains(folder, ctx.activePath)}>
      <div className="flex items-center gap-0.5">
        <Link
          href={docsHref(ctx.project, folder.path.split("/"))}
          data-active={active || undefined}
          className={cn(
            "min-w-0 flex-1 rounded-sm px-1.5 py-1.5 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white",
            ACTIVE_LINK,
          )}
        >
          {folder.name}
        </Link>
        <Caret label={folder.name} className="size-3.5" />
      </div>
      <CollapsibleContent className="ml-3 border-l border-mauve-800 pl-1.5">
        <Nodes nodes={folder.children} ctx={ctx} depth={depth + 1} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Page({
  page,
  ctx,
}: {
  page: DocsTreeNode & { type: "page" };
  ctx: TreeContext;
}) {
  // An index page keeps its real title everywhere else and gives it up here;
  // in the sidebar that title is already on the folder row above it, or in the
  // project switcher when the page is the project's own root.
  const label = isIndexPage(page) ? DOCS_INDEX_LABEL : page.title;

  return (
    <Link
      href={docsHref(ctx.project, page.path.split("/"))}
      data-active={page.path === ctx.activePath || undefined}
      // The relabelled row is the one place the sidebar shows a name the page
      // does not answer to, so the real one stays reachable on hover.
      title={label === page.title ? undefined : page.title}
      className={cn(PAGE_LINK, ACTIVE_LINK)}
    >
      {label}
    </Link>
  );
}

/**
 * A run of nodes at one level. `depth` is 1 at a section's own top (the
 * section heading itself already sits at the sidebar's true top), so a
 * folder here is always a `Folder` row rather than a `SectionHeading` — the
 * fixed sections are the only thing rendered like the old depth-0 partition,
 * and `Tree` below renders those directly rather than through this function.
 */
function Nodes({
  nodes,
  ctx,
  depth,
}: {
  nodes: DocsTreeNode[];
  ctx: TreeContext;
  depth: number;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={`folder:${node.path}`}>
            <Folder folder={node} ctx={ctx} depth={depth} />
          </li>
        ) : (
          <li key={node.path}>
            <Page page={node} ctx={ctx} />
          </li>
        ),
      )}
    </ul>
  );
}

export default function Tree({
  tree,
  ctx,
}: {
  tree: DocsSidebarTree;
  ctx: TreeContext;
}) {
  if (tree.overview === null && tree.sections.length === 0) {
    return (
      <p className="px-2 py-1.5 text-sm text-mauve-500">
        No documentation for this project yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tree.overview && (
        <div>
          <Page page={tree.overview} ctx={ctx} />
        </div>
      )}
      {tree.sections.map((section) => (
        <div key={section.id} className="mt-4 first:mt-0">
          <SectionHeading section={section} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}
