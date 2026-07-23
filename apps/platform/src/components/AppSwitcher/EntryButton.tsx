"use client";

import Link from "next/link";
import { useCallback, type MouseEvent } from "react";
import { DotsThreeVerticalIcon, LinkIcon } from "@phosphor-icons/react/ssr";
import type { SwitcherEntry } from "~/config/nav";

export default function EntryButton({ entry }: { entry: SwitcherEntry }) {
  const handleShareClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if ("canShare" in navigator && navigator.canShare()) {
        navigator
          .share({ title: entry.label, url: entry.href })
          .catch(console.error);
      }
    },
    [entry.label, entry.href],
  );

  return (
    <Link
      href={entry.href}
      target={entry.external ? "_blank" : undefined}
      className="flex items-center justify-between gap-2 rounded-sm border border-black bg-white px-4 py-2 text-mauve-950 hover:bg-mauve-100"
    >
      <LinkIcon />
      <span className="w-full text-center">{entry.label}</span>
      <button
        className="-m-1 rounded-sm p-1 transition-colors hover:bg-mauve-200"
        type="button"
        aria-label={`Share ${entry.label}`}
        onClick={handleShareClick}
      >
        <DotsThreeVerticalIcon />
      </button>
    </Link>
  );
}
