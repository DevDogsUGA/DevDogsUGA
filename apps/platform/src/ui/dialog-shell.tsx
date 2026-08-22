"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTrigger } from "~/ui/dialog";

interface Props {
  /** Omit both to let the dialog own its state (a trigger-opened dialog). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens it; none when a route decides that instead. */
  trigger?: ReactNode;
  /**
   * The title block: a `DialogTitle` and usually a `DialogDescription`, which
   * the caller supplies because it is the one content-specific part of the
   * frame. It stays put while the body scrolls, so the dialog always says what
   * it is. Radix wants a `DialogTitle` inside the content for the accessible
   * name, so this prop is required rather than optional.
   */
  header: ReactNode;
  /** The body below the header; the only part that scrolls. */
  children: ReactNode;
}

/**
 * The shared frame for this site's big dialogs: overlay, panel, sizing, and a
 * fixed header over a scrolling body. Nothing in here knows what it is framing
 * — the directions dialog and the meeting dialog both hand it a header and a
 * body — so the overlay and panel exist once, in one place.
 *
 * The panel caps at 85dvh and hides its own overflow; the body is the scroll
 * container instead of the panel, which is what keeps the header (and the
 * close button, which is absolutely positioned against the panel) in view no
 * matter how tall the content is. `dvh` rather than `vh` because mobile
 * browsers shrink the visual viewport as their chrome slides in, and `vh`
 * would leave the bottom of the dialog under the address bar.
 *
 * The two classes worth not deleting:
 *  - `min-h-0` on the body: a flex child's default `min-height: auto` refuses
 *    to shrink below its content, so without it the body would push past the
 *    panel's max height and get clipped by `overflow-hidden` instead of
 *    scrolling.
 *  - `-mx-5 px-5`: the scroll container reaches the panel's edges and puts the
 *    padding inside itself, so the scrollbar sits against the panel edge where
 *    it did when the panel itself scrolled, rather than floating 20px in.
 *
 * The body re-declares `gap-4` because it used to be the panel's own gap: the
 * header and the body's children were all grid items of one container, and
 * pulling the body into a box of its own would otherwise close the gaps
 * between whatever the caller passes.
 */
export default function DialogShell({
  open,
  onOpenChange,
  trigger,
  header,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="flex max-h-[85dvh] w-full flex-col gap-4 overflow-hidden rounded-sm border-2 border-black bg-white p-5 text-black ring-0 sm:max-w-xl">
        {header}
        <div className="-mx-5 grid min-h-0 gap-4 overflow-y-auto px-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
