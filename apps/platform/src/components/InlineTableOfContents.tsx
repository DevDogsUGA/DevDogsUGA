"use client";

import { useState } from "react";
import type { TOCItem } from "~/lib/toc";

interface Props {
  items: TOCItem[];
}

export default function InlineTableOfContents({ items }: Props) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <details
      className="mb-6 rounded-lg border border-border bg-card p-3 xl:hidden"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
        On this page
      </summary>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              className="block py-0.5 text-muted-foreground transition-colors hover:text-foreground"
              style={{ paddingLeft: `${(item.depth - 2) * 12}px` }}
              onClick={() => setOpen(false)}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
