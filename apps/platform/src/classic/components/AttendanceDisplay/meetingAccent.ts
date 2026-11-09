import type { AccentColor } from "~/classic/ui/accent-blobs";

/**
 * What the title card's chip, date line and corner wash key off, for a
 * meeting category.
 *
 * Everything the title card shows has to come off the meeting row -- see
 * the module doc on `TitleCard` -- so this maps `meetings.category` (the six
 * `EVENT_CATEGORIES`, or null) onto one of `AccentBlobs`'s six colors, rather
 * than an officer picking a slide layout per event the way a hand-authored
 * deck does. The baseline mapped the five meeting kinds: Build Session
 * emerald, Study Session cyan, Interest Meeting violet, Social rose and Demo
 * Night blue; the categories that replaced them take the same colors, and a
 * workshop night takes the deck's workshop amber.
 */
const CATEGORY_ACCENT: Record<string, AccentColor> = {
  build: "emerald",
  study: "cyan",
  info: "violet",
  social: "rose",
  milestone: "blue",
  workshop: "amber",
};

const DEFAULT_ACCENT: AccentColor = "blue";

export function meetingAccent(category: string | null): AccentColor {
  if (category === null) return DEFAULT_ACCENT;
  return CATEGORY_ACCENT[category] ?? DEFAULT_ACCENT;
}
