"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react/ssr";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useShare } from "~/lib/useShare";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPortal,
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
      {/* The overlay and card are composed from the primitives rather than
          taken from ~/ui/dialog: its DialogContent bakes in a hundred-
          millisecond fade, and tailwind-merge cannot tell one animation
          utility from another, so the site's modal keyframes would only win
          by stylesheet order. Both sit above the switcher's z-100. */}
      <DialogPortal>
        <DialogPrimitive.Overlay className="data-open:animate-modal-overlay-in data-closed:animate-modal-overlay-out fixed inset-0 z-110 bg-black/50" />
        {/* Centered with the `translate` property, which the keyframes'
            `transform` leaves alone — the card rises the last 12px into place
            without losing its centering on the way. */}
        <DialogPrimitive.Content className="data-open:animate-modal-content-in data-closed:animate-modal-content-out fixed top-1/2 left-1/2 z-110 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-mauve-600 bg-mauve-900 p-5 text-sm text-white outline-none sm:max-w-xs">
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
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
