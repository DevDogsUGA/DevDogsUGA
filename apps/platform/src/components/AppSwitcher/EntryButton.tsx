"use client";

import { useState } from "react";
import Image from "next/image";
import type { SwitcherEntry } from "~/config/nav";
import OpenOrShareDialog from "./OpenOrShareDialog";

/**
 * An external listing. Pressing the row asks — open or share? — the same
 * question the project tiles ask, so the row carries no glyph of its own
 * beyond the site's favicon, which says where the link lands better than the
 * generic link icon it replaced.
 */
export default function EntryButton({ entry }: { entry: SwitcherEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="relative flex cursor-pointer items-center justify-center gap-2.5 rounded-sm border border-black bg-white px-4 py-2 text-mauve-950 transition-colors hover:bg-mauve-100">
        {entry.favicon && (
          <Image
            src={entry.favicon}
            alt=""
            className="size-4 shrink-0"
            // Rendered at 16px from a 64px source — no pipeline pass needed.
            // Which is also why there is no `sizes` to go with it: `unoptimized`
            // emits a bare src and drops srcset and sizes both, so one here
            // would be dead weight. The static import still carries its
            // intrinsic 64×64, so the box is reserved before the file lands.
            unoptimized
          />
        )}
        {/* The button wraps the label and stretches over the whole row with
            its own ::after, so the row is one control. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-mauve-950"
        >
          {entry.label}
        </button>
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
