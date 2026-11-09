"use client";
import { cn } from "~/lib/cn";

import { useState } from "react";
import Image from "next/image";
import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import type { SwitcherEntry } from "~/config/nav";
import OpenOrShareDialog from "./OpenOrShareDialog";
import { LIFT, PLAIN, PLAIN_HOVER, ROW } from "./rowStyles";

/**
 * An external listing. Pressing the row asks whether to open or share, the
 * same question the project tiles ask. The row leads with the site's
 * favicon, which says where the link lands better than a generic link icon,
 * and trails an arrow that says it leaves the page.
 *
 * Rows are buttons in the site's way: a thick border at rest, a shade or
 * two lighter than the fill so the rim reads against the black overlay, and
 * a block shadow only on hover, as they lift. Plain rows are mauve;
 * `featured` rows are emerald and add their `description`.
 */
export default function EntryButton({ entry }: { entry: SwitcherEntry }) {
  const [open, setOpen] = useState(false);
  const Arrow = entry.external ? ArrowUpRightIcon : ArrowRightIcon;

  return (
    <>
      <div
        className={cn(
          ROW,
          LIFT,
          "gap-3 px-4 py-2.5 sm:py-3",
          entry.featured
            ? "border-emerald-400 bg-emerald-950 shadow-emerald-400 hover:border-emerald-300"
            : `${PLAIN} ${PLAIN_HOVER}`,
        )}
      >
        {/* A fixed slot, so labels line up whether or not a row has a
            favicon. */}
        <span className="flex size-5 shrink-0 items-center justify-center">
          {entry.favicon && (
            <Image
              src={entry.favicon}
              alt=""
              className="size-5"
              // Rendered at 20px from a 64px source, so no pipeline pass is
              // needed. That is also why there is no `sizes`: `unoptimized`
              // emits a bare src and drops srcset and sizes both, so one here
              // would be dead weight. The static import still carries its
              // intrinsic 64×64, so the box is reserved before the file lands.
              unoptimized
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start">
          {/* The button wraps the label and stretches over the whole row with
              its own ::after, so the row is one control. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-sm text-left text-sm font-semibold outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-white sm:text-base"
          >
            {entry.label}
          </button>
          {entry.featured && entry.description && (
            <span className="text-xs text-emerald-200 sm:text-sm">
              {entry.description}
            </span>
          )}
        </span>
        <Arrow
          weight="bold"
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform",
            entry.featured ? "text-emerald-300" : "text-mauve-300",
            "group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
          )}
        />
      </div>
      <OpenOrShareDialog
        title={entry.label}
        url={entry.href}
        external={entry.external ?? false}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
