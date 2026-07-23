"use client";

import { useEffect, useRef, useState } from "react";
import type { TOCItem } from "~/lib/toc";
import { cn } from "~/lib/cn";

interface Props {
  items: TOCItem[];
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
    <nav aria-label="Table of contents">
      <p className="mb-2 text-sm text-muted-foreground">On this page</p>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((item) => {
          const id = item.url.slice(1);
          return (
            <li key={item.url}>
              <a
                href={item.url}
                className={cn(
                  "block py-1 text-foreground/80 transition-colors hover:text-foreground",
                  activeId === id && "text-primary font-medium",
                  item.depth > 2 && "pl-3",
                  item.depth > 3 && "pl-6",
                )}
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
