"use client";

import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import { docsHref } from "~/lib/docsSlug";
import type { DocsTreeFolder, DocsTreeNode } from "~/lib/docsTree";
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
 * A first-level folder: a section heading over the pages it holds, rather
 * than another row in the list. The caret is its own control so the label can
 * stay a link — selecting the section itself shows what is inside it, which
 * for a folder with no index page of its own is a grid of its contents.
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
    <Collapsible defaultOpen={contains(folder, ctx.activePath)}>
      <div className="flex items-center gap-0.5">
        <CollapsibleTrigger
          aria-label={`Toggle ${folder.name}`}
          className="group flex size-5 shrink-0 items-center justify-center rounded-sm text-mauve-500 transition-colors hover:bg-mauve-800 hover:text-white"
        >
          <CaretRightIcon className="size-3 transition-transform group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
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
        <CollapsibleTrigger
          aria-label={`Toggle ${folder.name}`}
          className="group flex size-5 shrink-0 items-center justify-center rounded-sm text-mauve-500 transition-colors hover:bg-mauve-800 hover:text-white"
        >
          <CaretRightIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
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
  return (
    <Link
      href={docsHref(ctx.project, page.path.split("/"))}
      data-active={page.path === ctx.activePath || undefined}
      className={cn(PAGE_LINK, ACTIVE_LINK)}
    >
      {page.title}
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
  // pages — a heading stranded mid-list reads as a page that lost its icon.
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
