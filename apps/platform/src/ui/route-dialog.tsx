"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
import DialogShell, {
  type DialogPairRole,
  type DialogTone,
} from "~/ui/dialog-shell";
import { markOpenedInApp, openedInApp } from "~/ui/opened-in-app";

interface Props {
  /** The dialog's title block. See {@link DialogShell}'s `header`. */
  header: ReactNode;
  /**
   * Where closing goes when there is no history entry of ours to go back to.
   * Should be the route whose layout keeps rendering behind the dialog, so
   * that closing is a soft navigation within that layout rather than a load.
   */
  closeTo: string;
  /** Passed straight to {@link DialogShell}. */
  tone?: DialogTone;
  pair?: DialogPairRole;
  children: ReactNode;
}

/**
 * A dialog as a route segment. Render it as the layout of the segment and the
 * dialog is open for exactly as long as that URL is current, over whatever the
 * parent layout keeps mounted behind it.
 *
 * Closing has to undo whatever opened it. Followed from the page behind it, the
 * dialog added a history entry and `back()` takes it away again, leaving that
 * page untouched and the history clean. Landed on directly, nothing of ours is
 * behind it and `back()` would walk out of the site, so close navigates to
 * `closeTo`. That is a soft navigation into the shared layout, so it swaps the
 * dialog for nothing without remounting the page underneath.
 *
 * The local `open` flips first either way, so Radix gets to play its exit
 * animation in the moment before the navigation lands.
 */
export default function RouteDialog({
  header,
  closeTo,
  tone,
  pair,
  children,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) return;
        if (openedInApp()) router.back();
        else router.push(closeTo);
      }}
      header={header}
      tone={tone}
      pair={pair}
    >
      {children}
    </DialogShell>
  );
}

/**
 * The link that opens a {@link RouteDialog}. An ordinary `<Link>` carrying the
 * two props that make a URL behave like a dialog, so no trigger can forget
 * them.
 *
 * `scroll={false}` because opening a dialog should not scroll the page behind
 * it to the top. `onNavigate` fires only when the router handles the click, so
 * it marks exactly the case where closing can safely go back (see
 * {@link markOpenedInApp}). A middle click or a new tab never runs it, and
 * those tabs really do start cold. It is composed with, not replaced by, any
 * `onNavigate` the caller passes, because losing the mark would strand a
 * closed dialog's history entry.
 *
 * Anything one trigger needs beyond that, hover preloading of a heavy chunk for
 * one, stays with that trigger. This carries only what is true of every route
 * dialog.
 */
export function RouteDialogLink({
  onNavigate,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      scroll={false}
      onNavigate={(event) => {
        markOpenedInApp();
        onNavigate?.(event);
      }}
    />
  );
}
