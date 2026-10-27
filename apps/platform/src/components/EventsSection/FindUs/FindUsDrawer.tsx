"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/ui/sheet";
import { describePlace, type Place } from "./place";

interface Props {
  /** Omit both to let the drawer own its state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The place the header names. */
  place: Place;
  /** The element that opens it; none when a route decides that instead. */
  trigger?: ReactNode;
  /** The body below the title, normally `FindUsContent`. */
  children: ReactNode;
}

/**
 * Directions as a right-hand drawer (D1). It opens over whatever page the
 * reader is on, so "Find us" on a meeting does not drop them onto the
 * schedule. `/events/directions` renders this same drawer open over the events
 * page, so a pasted or printed link still lands somewhere.
 *
 * The title is the place as a member says it, "DLW 124". The lines under it
 * are the same place as a stranger needs it: the full name, then its street
 * address, when there is one. Nothing about what happens there; that is the meeting's job,
 * and this is only ever about *where*.
 */
export default function FindUsDrawer({
  open,
  onOpenChange,
  place,
  trigger,
  children,
}: Props) {
  const view = describePlace(place);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side="right">
        <SheetHeader>
          <div>
            <SheetTitle>{view.title}</SheetTitle>
            {view.subtitle.length > 0 && (
              <SheetDescription>
                {view.subtitle.map((line, i) => (
                  <span key={line}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
              </SheetDescription>
            )}
          </div>
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}
