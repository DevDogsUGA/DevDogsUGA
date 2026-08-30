"use client";

import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import { DOCS_INDEX_LABEL } from "~/config/docs";
import { docsHref } from "~/lib/docsSlug";
import {
  isIndexPage,
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
 * A first-level folder: a section heading over the pages it holds, not another
 * row in the list. The caret is its own control so the label can stay a link.
 * Selecting the section shows what is inside it, which for a folder with no
 * index page of its own is a grid of its contents.
 *
 * Open by default, always, not only when it holds the current page. A tree that
 * opens exactly one section shows a reader the part they already found and
 * hides the rest behind carets they have to think to press, and the sections
 * are the table of contents. Deeper folders still open on the active path only,
 * see `Folder`, because those are where the page counts get large enough for
 * open-everything to become unreadable.
 */
function Section({
  folder,
  ctx,
}: {
  folder: DocsTreeFolder;
  ctx: TreeContext;
}) {
  const active = ctx.activePath === folder.path;

  return (
    <Collapsible defaultOpen>
      <div className="flex items-center gap-0.5">
        <Link
          href={docsHref(ctx.project, folder.path.split("/"))}
          data-active={active || undefined}
          className={cn(
            "min-w-0 flex-1 rounded-sm px-1.5 py-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase transition-colors hover:bg-mauve-800 hover:text-white",
            "data-active:bg-mauve-800/60 data-active:text-white",
          )}
        >
          {folder.name}
        </Link>
        <Caret label={folder.name} className="size-3" />
      </div>
      <CollapsibleContent>
        <Nodes nodes={folder.children} ctx={ctx} depth={1} />
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

function Nodes({
  nodes,
  ctx,
  depth,
}: {
  nodes: DocsTreeNode[];
  ctx: TreeContext;
  depth: number;
}) {
  // At the top level the folders are section headings, so they gather at the
  // bottom under their own headings rather than sorting in among the loose
  // pages. A heading stranded mid-list reads as a page that lost its icon.
  // Deeper in, a folder is just another row and keeps its place.
  const ordered =
    depth === 0
      ? [
          ...nodes.filter((node) => node.type === "page"),
          ...nodes.filter((node) => node.type === "folder"),
        ]
      : nodes;

  return (
    <ul className="flex flex-col gap-0.5">
      {ordered.map((node) =>
        node.type === "folder" ? (
          <li key={`folder:${node.path}`} className={cn(depth === 0 && "mt-4")}>
            {depth === 0 ? (
              <Section folder={node} ctx={ctx} />
            ) : (
              <Folder folder={node} ctx={ctx} depth={depth} />
            )}
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
  nodes,
  ctx,
}: {
  nodes: DocsTreeNode[];
  ctx: TreeContext;
}) {
  if (nodes.length === 0) {
    return (
      <p className="px-2 py-1.5 text-sm text-mauve-500">
        No documentation for this project yet.
      </p>
    );
  }
  return <Nodes nodes={nodes} ctx={ctx} depth={0} />;
}
