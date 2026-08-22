"use client";

import { useEffect, useRef, useState } from "react";
import type { TOCItem } from "~/lib/toc";
import { cn } from "~/lib/cn";

interface Props {
  items: TOCItem[];
}

/** The section label the mobile menu sheet puts over each of its groups. */
export const TOC_LABEL_CLASS =
  "px-2 pb-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase";

/**
 * One entry's link, in the sidebar tree's vocabulary: mauve at rest, white
 * when hovered or current. Depth is expressed as padding so nested headings
 * read as nested without a second rail.
 */
export function tocLinkClass(depth: number, active = false) {
  return cn(
    "block rounded-sm px-2 py-1 text-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white",
    depth > 2 && "pl-5",
    depth > 3 && "pl-8",
    active && "bg-mauve-800/60 font-medium text-white",
  );
}

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
      <p className={TOC_LABEL_CLASS}>On this page</p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const id = item.url.slice(1);
          return (
            <li key={item.url}>
              <a
                href={item.url}
                aria-current={activeId === id ? "location" : undefined}
                className={tocLinkClass(item.depth, activeId === id)}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
