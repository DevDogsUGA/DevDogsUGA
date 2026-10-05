import type { AccentColor } from "~/ui/accent-blobs";

/**
 * What the title card's chip, date line and corner wash key off, for a
 * meeting kind.
 *
 * Everything the title card shows has to come off the meeting row -- see
 * the module doc on `TitleCard` -- so this maps `meetings.kind` (the five
 * `MEETING_KIND_CHOICES` from `@devdogsuga/events`, or null) onto one of
 * `AccentBlobs`'s six colors, rather than an officer picking a slide layout
 * per event the way a hand-authored deck does. The deck's speaker notes ask
 * for the same thing: Interest Meeting purple, Build Session emerald
 * (`DD_EMERALD`), workshops amber.
 */
const KIND_ACCENT: Record<string, AccentColor> = {
  "Build Session": "emerald",
  "Study Session": "cyan",
  "Interest Meeting": "violet",
  Social: "rose",
  "Demo Night": "blue",
};

const DEFAULT_ACCENT: AccentColor = "blue";

export function meetingAccent(kind: string | null): AccentColor {
  if (kind === null) return DEFAULT_ACCENT;
  return KIND_ACCENT[kind] ?? DEFAULT_ACCENT;
}
