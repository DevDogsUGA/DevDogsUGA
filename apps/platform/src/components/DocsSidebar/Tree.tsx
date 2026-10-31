"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaretRightIcon, CheckCircleIcon } from "@phosphor-icons/react/ssr";
import "~/components/Docs/docs.css";
import { stepKey, useDoneSteps } from "~/components/DocsProgress/store";
import { DOCS_INDEX_LABEL } from "~/config/docs";
import { DOCS_BASE, docsHref } from "~/lib/docsSlug";
import {
  firstPagePath,
  isIndexPage,
  type DocsSidebarSection,
  type DocsSidebarTree,
  type DocsTreeFolder,
  type DocsTreeNode,
} from "~/lib/docsTree";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/ui/collapsible";

interface TreeContext {
  project: string;
  /** `/docs`, or the preview's prefix; links built here stay under it. */
  base?: string;
  activePath: string;
  /** Finished course steps, see ~/components/DocsProgress. */
  done: ReadonlySet<string>;
}

function contains(folder: DocsTreeFolder, activePath: string) {
  return activePath === folder.path || activePath.startsWith(folder.path + "/");
}

/**
 * A collapsible row's caret, drawn AFTER the label so it lands on the right
 * edge of the row: the label is `flex-1`, which pushes the caret to a rail
 * every row shares. Left of the label it sat at a different x on every nesting
 * level, and the indent already says how deep a row is.
 *
 * Decoration only. The whole row is the one toggle, label and caret alike, so
 * there is no second, smaller target beside the label to aim for.
 */
function Caret() {
  return (
    <CaretRightIcon aria-hidden weight="bold" className="docs-tree-caret" />
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
      <CollapsibleTrigger className="docs-tree-sec">
        <span className="docs-tree-label">{section.label}</span>
        <Caret />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Nodes nodes={children} ctx={ctx} depth={1} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A folder below the first level: one toggle row on its own rail. Opening it
 * also navigates to its first page in sidebar order, the same target a reader
 * would land on next anyway; closing it only closes it, since the active page
 * stays reachable in the tree either way. A course (`steps: true`) also counts
 * the steps the reader has finished.
 */
function Folder({
  folder,
  ctx,
  depth,
}: {
  folder: DocsTreeFolder;
  ctx: TreeContext;
  depth: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(() => contains(folder, ctx.activePath));
  const steps = folder.steps
    ? folder.children.filter((node) => node.type === "page")
    : [];
  const finished = steps.filter((step) =>
    ctx.done.has(stepKey(ctx.project, step.path)),
  ).length;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    const path = firstPagePath(folder.children);
    if (path)
      router.push(
        docsHref(ctx.project, path.split("/"), ctx.base ?? DOCS_BASE),
      );
  }

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="docs-tree-row">
        <span className="docs-tree-label">{folder.name}</span>
        {folder.steps && (
          <span
            aria-label={`${finished} of ${steps.length} done`}
            data-done={finished === steps.length || undefined}
            className="docs-tree-count"
          >
            {finished}/{steps.length}
          </span>
        )}
        <Caret />
      </CollapsibleTrigger>
      <CollapsibleContent className="docs-tree-kids">
        <Nodes
          nodes={folder.children}
          ctx={ctx}
          depth={depth + 1}
          course={folder.steps}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Page({
  page,
  ctx,
  course = false,
}: {
  page: DocsTreeNode & { type: "page" };
  ctx: TreeContext;
  /** A step of a course: marked once the reader has finished it. */
  course?: boolean;
}) {
  const done = course && ctx.done.has(stepKey(ctx.project, page.path));
  // An index page keeps its real title everywhere else and gives it up here;
  // in the sidebar that title is already on the folder row above it, or in the
  // project switcher when the page is the project's own root.
  const label = isIndexPage(page) ? DOCS_INDEX_LABEL : page.title;

  return (
    <Link
      href={docsHref(ctx.project, page.path.split("/"), ctx.base ?? DOCS_BASE)}
      data-active={page.path === ctx.activePath || undefined}
      // The relabelled row is the one place the sidebar shows a name the page
      // does not answer to, so the real one stays reachable on hover.
      title={label === page.title ? undefined : page.title}
      className="docs-tree-link"
    >
      <span className="docs-tree-label">{label}</span>
      {done && (
        <CheckCircleIcon
          weight="fill"
          aria-label="Done"
          className="docs-tree-done"
        />
      )}
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
  course = false,
}: {
  nodes: DocsTreeNode[];
  ctx: TreeContext;
  depth: number;
  /** These nodes are a course's own: its pages are steps. */
  course?: boolean;
}) {
  return (
    <ul>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={`folder:${node.path}`}>
            <Folder folder={node} ctx={ctx} depth={depth} />
          </li>
        ) : (
          <li key={node.path}>
            <Page page={node} ctx={ctx} course={course} />
          </li>
        ),
      )}
    </ul>
  );
}

export default function Tree({
  tree,
  ctx: base,
}: {
  tree: DocsSidebarTree;
  ctx: Omit<TreeContext, "done">;
}) {
  const done = useDoneSteps();
  const ctx = { ...base, done };
  if (tree.overview === null && tree.sections.length === 0) {
    return (
      <p className="docs-tree-empty">No documentation for this project yet.</p>
    );
  }

  return (
    <nav aria-label="Docs" className="docs-tree">
      {tree.overview && (
        <div>
          <Page page={tree.overview} ctx={ctx} />
        </div>
      )}
      {tree.sections.map((section) => (
        <div key={section.id} className="docs-tree-secwrap">
          <SectionHeading section={section} ctx={ctx} />
        </div>
      ))}
    </nav>
  );
}
