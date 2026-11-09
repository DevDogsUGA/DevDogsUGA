"use client";

import type { ReactNode } from "react";
import { MapPinIcon } from "@phosphor-icons/react/ssr";
import { DialogDescription, DialogTitle } from "~/classic/ui/dialog";
import DialogShell, {
  type DialogPairRole,
  type DialogTone,
} from "~/classic/ui/dialog-shell";
import {
  describePlace,
  type Place,
} from "~/components/EventsSection/FindUs/place";

interface Props {
  /** Omit both to let the dialog own its state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The place the header names, from the venue catalog. */
  place: Place;
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
 * The directions dialog's header. The meeting dialog renders the whole dialog
 * below; `/events/directions` is a route dialog whose frame is a layout and
 * cannot read the link's place, so it prints the place at the top of its body
 * instead and does not use this.
 *
 * The title is the place as a member says it, "DLW 124". The two lines under
 * it are the same place as a stranger needs it: the building's full name, then
 * its street address. Nothing about what happens there; that is the meeting
 * dialog's job, and this one is only ever about *where*.
 */
export function FindUsHeader({
  place,
  tone = "light",
}: {
  place: Place;
  tone?: DialogTone;
}) {
  const t = HEADER_TONES[tone];
  const view = describePlace(place);
  return (
    <div className="flex flex-col gap-2">
      <DialogTitle
        className={`font-display flex items-center gap-2 text-2xl leading-none font-extrabold ${t.title}`}
      >
        <MapPinIcon className={t.icon} weight="fill" />
        {view.title}
      </DialogTitle>
      <DialogDescription className={`text-sm ${t.blurb}`}>
        {view.subtitle.length === 0
          ? "Where this meeting is."
          : view.subtitle.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
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
  place,
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
      header={<FindUsHeader place={place} tone={tone} />}
      tone={tone}
      pair={pair}
      backLabel="Meeting"
    >
      {children}
    </DialogShell>
  );
}
