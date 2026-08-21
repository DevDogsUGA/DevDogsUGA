"use client";

import Link from "next/link";
import { LinkIcon } from "@phosphor-icons/react/ssr";
import type { SwitcherEntry } from "~/config/nav";
import { useLongPress } from "~/lib/useLongPress";
import { useShare } from "~/lib/useShare";
import ShareButton from "~/ui/share-button";

/**
 * An external listing, opened by tapping and shared the same two ways the
 * project tiles offer: a share button for a pointer that can hover, a long
 * press for a finger.
 */
export default function EntryButton({ entry }: { entry: SwitcherEntry }) {
  const share = useShare({ title: entry.label, url: entry.href });
  const longPress = useLongPress(share);

  return (
    // The row is the container and the link stretches over it, rather than the
    // link being the row with a button nested inside it — which is invalid,
    // and is what the share control here used to be.
    <div
      {...longPress}
      className="group relative flex items-center justify-between gap-2 rounded-sm border border-black bg-white px-4 py-2 text-mauve-950 select-none [-webkit-touch-callout:none] hover:bg-mauve-100"
    >
      <LinkIcon className="shrink-0" />
      <Link
        href={entry.href}
        target={entry.external ? "_blank" : undefined}
        className="w-full rounded-sm text-center outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-mauve-950"
      >
        {entry.label}
      </Link>
      {/* Invisible at rest and untappable with it, so a touch never catches it
          by accident — but still in the DOM, and still reachable by keyboard,
          which is the only way a long press gets announced at all. */}
      <ShareButton
        title={entry.label}
        url={entry.href}
        label={entry.label}
        className="pointer-events-none relative z-10 -m-1 shrink-0 rounded-sm p-1 opacity-0 transition-opacity outline-none group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-mauve-200 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-mauve-950"
      />
    </div>
  );
}
