"use client";

import type { ReactNode } from "react";
import { MapPinIcon } from "@phosphor-icons/react/ssr";
import { DialogDescription, DialogTitle } from "~/ui/dialog";
import DialogShell from "~/ui/dialog-shell";
import { findUsBlurb, FIND_US_TITLE } from "./copy";
import type { BuildingKey } from "./campusMapMeta";

interface Props {
  /** Omit both to let the dialog own its state (the homepage trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which building the blurb describes. */
  building?: BuildingKey;
  /** The room inside it, for the same sentence. */
  room?: string | null;
  /** The element that opens it; none when a route decides that instead. */
  trigger?: ReactNode;
  /** The body below the title — normally {@link FindUsContent}. */
  children: ReactNode;
}

/**
 * The directions dialog's header, exported on its own because the two ways in
 * need it separately: the homepage renders the whole dialog below, while
 * `/events/directions` hands this to the shared {@link RouteDialog}, which
 * owns the close behaviour a route dialog needs. Both get the same title from
 * the same place instead of two copies drifting apart.
 */
export function FindUsHeader({
  building = "DLW",
  room = "124",
}: {
  building?: BuildingKey;
  room?: string | null;
} = {}) {
  return (
    <div className="flex flex-col gap-2">
      <DialogTitle className="font-display flex items-center gap-2 text-2xl leading-none font-extrabold text-black">
        <MapPinIcon className="text-mauve-500" weight="fill" />
        {FIND_US_TITLE}
      </DialogTitle>
      <DialogDescription className="text-sm text-mauve-600">
        {findUsBlurb(building, room)}
      </DialogDescription>
    </div>
  );
}

/**
 * The directions dialog opened in place, by a trigger rather than by a URL:
 * the shared frame with this dialog's header in it.
 */
export default function FindUsDialog({
  open,
  onOpenChange,
  building,
  room,
  trigger,
  children,
}: Props) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={<FindUsHeader building={building} room={room} />}
    >
      {children}
    </DialogShell>
  );
}
