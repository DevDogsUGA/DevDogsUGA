"use client";

import type { ReactNode } from "react";
import { MapPinIcon } from "@phosphor-icons/react/ssr";
import { DialogDescription, DialogTitle } from "~/ui/dialog";
import DialogShell, {
  type DialogPairRole,
  type DialogTone,
} from "~/ui/dialog-shell";
import {
  BUILDING_ADDRESS,
  BUILDING_FULL_NAME,
  locationLine,
} from "./buildings";
import type { BuildingKey } from "./campusMapMeta";

interface Props {
  /** Omit both to let the dialog own its state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which building the header names. */
  building?: BuildingKey;
  /** The room inside it, for the title. */
  room?: string | null;
  /** The element that opens it; none when a route decides that instead. */
  trigger?: ReactNode;
  /** The body below the title, normally {@link FindUsContent}. */
  children: ReactNode;
  /** Passed to the shell; the header follows it. */
  tone?: DialogTone;
  pair?: DialogPairRole;
}

const HEADER_TONES = {
  light: {
    title: "text-black",
    icon: "text-mauve-500",
    blurb: "text-mauve-600",
  },
  dark: {
    title: "text-white",
    icon: "text-mauve-400",
    blurb: "text-mauve-400",
  },
} satisfies Record<DialogTone, Record<string, string>>;

/**
 * The directions dialog's header, exported on its own because the two ways in
 * need it separately: the meeting dialog renders the whole dialog below, while
 * `/events/directions` hands this to the shared {@link RouteDialog}, which
 * owns the close behaviour a route dialog needs.
 *
 * The title is the place as a member says it, "DLW 124". The two lines under
 * it are the same place as a stranger needs it: the building's full name, then
 * its street address. Nothing about what happens there; that is the meeting
 * dialog's job, and this one is only ever about *where*.
 */
export function FindUsHeader({
  building = "DLW",
  room = "124",
  tone = "light",
}: {
  building?: BuildingKey;
  room?: string | null;
  tone?: DialogTone;
} = {}) {
  const t = HEADER_TONES[tone];
  return (
    <div className="flex flex-col gap-2">
      <DialogTitle
        className={`font-display flex items-center gap-2 text-2xl leading-none font-extrabold ${t.title}`}
      >
        <MapPinIcon className={t.icon} weight="fill" />
        {locationLine(building, room)}
      </DialogTitle>
      <DialogDescription className={`text-sm ${t.blurb}`}>
        <span className="block">{BUILDING_FULL_NAME[building]}</span>
        <span className="block">{BUILDING_ADDRESS[building]}</span>
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
  tone = "light",
  pair,
}: Props) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={<FindUsHeader building={building} room={room} tone={tone} />}
      tone={tone}
      pair={pair}
      backLabel="Meeting"
    >
      {children}
    </DialogShell>
  );
}
