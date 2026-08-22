"use client";

import { useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import type { TOCItem } from "~/lib/toc";
import { tocLinkClass } from "~/components/TableOfContents";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/ui/collapsible";

interface Props {
  items: TOCItem[];
}

/**
 * The table of contents for widths without room for the sticky column —
 * folded up above the article, and built from the same Collapsible and
 * rotating caret the sidebar's folders use rather than a native <details>.
 * Hidden from `lg` up, where {@link TableOfContents} takes over.
 */
export default function InlineTableOfContents({ items }: Props) {
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
        <ul className="mt-1 flex flex-col gap-0.5 border-t border-mauve-800 pt-1.5">
          {items.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                className={tocLinkClass(item.depth)}
                onClick={() => setOpen(false)}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
