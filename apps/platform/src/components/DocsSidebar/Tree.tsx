"use client";

import Link from "next/link";
import { CaretRightIcon, FileTextIcon } from "@phosphor-icons/react/ssr";
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

function Folder({ folder, ctx }: { folder: DocsTreeFolder; ctx: TreeContext }) {
  const containsActive = ctx.activePath.startsWith(prefixOf(folder) + "/");

  return (
    <Collapsible defaultOpen={containsActive}>
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white">
        <CaretRightIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        {folder.name}
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-3 border-l border-mauve-800 pl-1.5">
        <Nodes nodes={folder.children} ctx={ctx} />
      </CollapsibleContent>
    </Collapsible>
  );
}

// A folder's path prefix is recoverable from any descendant page; fall back
// to the segment itself for empty folders (which buildDocsTree never emits).
function prefixOf(folder: DocsTreeFolder): string {
  const firstPage = (function find(nodes: DocsTreeNode[]): string | null {
    for (const node of nodes) {
      if (node.type === "page") return node.path;
      const nested = find(node.children);
      if (nested) return nested;
    }
    return null;
  })(folder.children);
  if (!firstPage) return folder.segment;
  const segments = firstPage.split("/");
  const index = segments.lastIndexOf(folder.segment);
  return segments.slice(0, index + 1).join("/");
}

function Nodes({ nodes, ctx }: { nodes: DocsTreeNode[]; ctx: TreeContext }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={`folder:${node.segment}:${node.children.length}`}>
            <Folder folder={node} ctx={ctx} />
          </li>
        ) : (
          <li key={node.path}>
            <Link
              href={docsHref(ctx.project, node.path.split("/"))}
              data-active={node.path === ctx.activePath || undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white",
                "data-active:bg-mauve-800/70 data-active:font-medium data-active:text-white",
              )}
            >
              <FileTextIcon className="size-3.5 shrink-0 text-mauve-500" />
              {node.title}
            </Link>
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
  return <Nodes nodes={nodes} ctx={ctx} />;
}
