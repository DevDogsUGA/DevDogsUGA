"use client";

import type { ReactNode } from "react";
import { MapPinIcon } from "@phosphor-icons/react/ssr";
import { DialogDescription, DialogTitle } from "~/ui/dialog";
import DialogShell, {
  type DialogPairRole,
  type DialogTone,
} from "~/ui/dialog-shell";
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
 * need it separately: the homepage renders the whole dialog below, while
 * `/events/directions` hands this to the shared {@link RouteDialog}, which
 * owns the close behaviour a route dialog needs. Both get the same title from
 * the same place instead of two copies drifting apart.
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
        {FIND_US_TITLE}
      </DialogTitle>
      <DialogDescription className={`text-sm ${t.blurb}`}>
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
    >
      {children}
    </DialogShell>
  );
}
