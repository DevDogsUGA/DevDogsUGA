"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import FindUsDialog from "./FindUsDialog";

/**
 * The dialog as a route segment: the events page's `@modal` slot renders this
 * around whatever `/events/directions` resolves to, so the dialog is open for
 * as long as that URL is current. Closing it — the X, Escape, the overlay —
 * goes back in history, which returns the slot to its `default.tsx` and
 * unmounts this. The local `open` flips first so Radix gets to play its exit
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
        if (!next) router.back();
      }}
    >
      {children}
    </FindUsDialog>
  );
}
