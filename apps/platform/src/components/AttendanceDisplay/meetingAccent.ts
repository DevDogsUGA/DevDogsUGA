import type { AccentColor } from "~/ui/accent-blobs";

/**
 * What the title card's chip and wash key off, for a meeting kind.
 *
 * Everything the title card shows has to come off the meeting row -- see
 * the module doc on `TitleCard` -- so this maps `meetings.kind` (the four
 * `MEETING_KIND_CHOICES` from `@devdogsuga/events`, or null) onto one of
 * `AccentBlobs`'s six colors and a chip label, rather than an officer typing
 * either per event the way a hand-authored slide deck would.
 *
 * The mapping is a plain guess at which of the app's six accents reads best
 * for each kind, in the same spirit as (but not copied from) the Slidev
 * theme's `Chip.vue` `TYPE_ACCENT` table, which has no equivalent of "Build
 * Session" to draw from since its decks are authored per meeting.
 */
const KIND_ACCENT: Record<string, AccentColor> = {
  "Dev Session": "emerald",
  "Study Session": "cyan",
  "Interest Meeting": "violet",
  Social: "rose",
};

const DEFAULT_ACCENT: AccentColor = "blue";
const DEFAULT_CHIP = "MEETING";

export function meetingAccent(kind: string | null): AccentColor {
  if (kind === null) return DEFAULT_ACCENT;
  return KIND_ACCENT[kind] ?? DEFAULT_ACCENT;
}

export function meetingChip(kind: string | null): string {
  if (kind === null) return DEFAULT_CHIP;
  return kind.toUpperCase();
}
