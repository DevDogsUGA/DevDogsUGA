"use client";

import { useEffect, useRef, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import type { TOCItem } from "~/lib/toc";
import { cn } from "~/lib/cn";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/ui/collapsible";

interface Props {
  items: TOCItem[];
}

/**
 * The headings of one docs page, in the two shapes the layout needs: a sticky
 * column from `lg` up, and a fold-out above the article below it. Both live
 * here because they are one component wearing two pieces of chrome — the list
 * itself, its colors, and its depth indents are shared, and a change to how an
 * entry looks has to reach both.
 */
function Entries({
  items,
  activeId,
  onNavigate,
}: {
  items: TOCItem[];
  activeId?: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const id = item.url.slice(1);
        const active = activeId === id;
        return (
          <li key={item.url}>
            <a
              href={item.url}
              onClick={onNavigate}
              aria-current={active ? "location" : undefined}
              // The sidebar tree's link: mauve at rest, white once hovered or
              // current. Depth reads as indent rather than a second rail.
              className={cn(
                "block rounded-sm px-2 py-1 text-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white",
                item.depth > 2 && "pl-5",
                item.depth > 3 && "pl-8",
                active && "bg-mauve-800/60 font-medium text-white",
              )}
            >
              {item.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** The section label the mobile menu sheet puts over each of its groups. */
const LABEL_CLASS =
  "px-2 pb-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase";

/**
 * The sticky column, shown from `lg` up — where {@link InlineTableOfContents}
 * hides, so exactly one of the two is on screen at any width.
 */
export default function TableOfContents({ items }: Props) {
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const headingIds = items.map((item) => item.url.slice(1));

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const id of headingIds) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="flex flex-col gap-0.5">
      <p className={LABEL_CLASS}>On this page</p>
      <Entries items={items} activeId={activeId} />
    </nav>
  );
}

/**
 * The same contents folded up above the article, for widths with no room for
 * the column. Built from the Collapsible and rotating caret the sidebar's
 * folders use rather than a bare <details>, and hidden from `lg`.
 */
export function InlineTableOfContents({ items }: Props) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mx-auto mb-6 max-w-3xl rounded-lg border border-mauve-800 bg-mauve-900/50 p-1.5 lg:hidden"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white">
        <CaretRightIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        On this page
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 border-t border-mauve-800 pt-1.5">
          <Entries items={items} onNavigate={() => setOpen(false)} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
