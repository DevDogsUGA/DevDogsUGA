"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import FindUsDialog from "./FindUsDialog";
import { openedInApp } from "./openedInApp";

/**
 * The dialog as a route segment: it is the layout of `/events/directions`, so
 * the dialog is open for exactly as long as that URL is current, over the
 * calendar the events layout keeps mounted behind it.
 *
 * Closing has to undo whatever opened it. Followed from the events page, the
 * dialog added a history entry and `back()` takes it away again — leaving the
 * calendar untouched and the history clean. Landed on directly, nothing of ours
 * is behind it and `back()` would walk out of the site, so close navigates to
 * `/events` instead; that is a soft navigation into the shared layout, so it
 * swaps the dialog for nothing without remounting the page underneath.
 *
 * The local `open` flips first either way, so Radix gets to play its exit
 * animation in the moment before the navigation lands.
 */
export default function RouteDialog({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <FindUsDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) return;
        if (openedInApp()) router.back();
        else router.push("/events");
      }}
    >
      {children}
    </FindUsDialog>
  );
}
