"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react/ssr";
import { useShare } from "~/lib/useShare";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";

interface Props {
  /** Names the link — the dialog's title and the label the share sheet gets. */
  title: string;
  url: string;
  external: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dismisses the switcher overlay once an in-app link is followed. */
  onNavigate?: () => void;
}

/**
 * The question every switcher link asks when pressed: follow it, or share it?
 *
 * Asking outright replaced a long press that only touch could reach and a
 * hover-revealed button that only a mouse could see — one affordance, the
 * same on every device, and the share runs from a plain button click, squarely
 * inside the user activation the share sheet demands.
 */
export default function OpenOrShareDialog({
  title,
  url,
  external,
  open,
  onOpenChange,
  onNavigate,
}: Props) {
  const share = useShare({ title, url });

  // The Sign In button's amber lift, on buttons the same size: 2px of travel
  // with the shadow a step ahead of it at 3px.
  const lift =
    "transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_var(--color-amber-400)]";
  const openStyle = `flex items-center justify-center gap-2 rounded-sm border border-black bg-cyan-400 px-3 py-2.5 text-sm font-bold text-black ${lift}`;
  const shareStyle = `flex items-center justify-center gap-2 rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2.5 text-sm font-bold text-white ${lift}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Above the switcher overlay's z-100, which the default z-50 is not. */}
      <DialogContent
        overlayClassName="z-110 bg-black/50"
        showCloseButton={false}
        className="z-110 max-w-xs rounded-md border border-mauve-600 bg-mauve-900 p-5 text-white ring-0"
      >
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-white">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-mauve-400">
            {external
              ? `This link goes to ${new URL(url).hostname}.`
              : "This link stays on this site."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {/* Share on the left, so the primary action ends the row. */}
          <button
            type="button"
            onClick={() => {
              // The share first, while the click's user activation is fresh —
              // closing is just cleanup and can happen behind it.
              share();
              onOpenChange(false);
            }}
            className={shareStyle}
          >
            Share <ShareNetworkIcon weight="bold" />
          </button>
          {external ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={() => onOpenChange(false)}
              className={openStyle}
            >
              Open <ArrowSquareOutIcon weight="bold" />
            </a>
          ) : (
            <Link
              href={url}
              onClick={() => {
                onOpenChange(false);
                onNavigate?.();
              }}
              className={openStyle}
            >
              Open <ArrowRightIcon weight="bold" />
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
