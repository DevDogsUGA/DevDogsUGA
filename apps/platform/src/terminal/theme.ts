import {
  EVENT_KIND_VISUALS,
  EVENT_SEGMENT_VISUALS,
} from "@devdogsuga/brand/event";
import { KIND, PALETTE, UGA } from "@devdogsuga/newsletter";

/**
 * The terminal's colours, every one borrowed rather than chosen.
 *
 * Text tones come from the Changelog's palette, because the Changelog is
 * already the club's terminal voice and these pages are its siblings. Event
 * colours come from `@devdogsuga/brand/event`, the same source the site's
 * calendar chips and the email's chips read, so a build session is sky here
 * too. Nothing paints a background except a chip: a terminal's own ground is
 * whatever the reader chose, and these all read on dark and light alike.
 */
export const TONE = {
  ink: PALETTE.ink,
  mute: PALETTE.mute,
  dim: PALETTE.dim,
  rule: PALETTE.border,
  /** The club red: the cursor underscore, the `$`, the "you are here" marks. */
  brand: UGA,
  /** Anything a reader might copy: URLs and curl commands. */
  link: KIND.workshop,
  /** Chip label text, drawn on a chip's colour. */
  onChip: PALETTE.bar,
} as const;

/**
 * Page accents, one per `PageShell` accent the site uses, so a section keeps
 * its hue between the browser and the terminal. Tailwind's 400 step, the one
 * the site's blobs and headings are drawn from.
 */
export const ACCENT = {
  rose: "#fb7185",
  amber: "#fbbf24",
  cyan: "#22d3ee",
  emerald: "#34d399",
  violet: "#a78bfa",
  sky: "#38bdf8",
} as const;

export type Accent = keyof typeof ACCENT;

/** A chip's label and colour, for an event kind or segment. */
export interface Chip {
  label: string;
  color: string;
}

/**
 * The chip for a meeting: its authored kind when it has one, else what its
 * structure says (a workshop night, or an unscheduled one). The same
 * precedence `primaryBadge` applies on the site.
 */
export function meetingChip(kind: string | null, hasWorkshops: boolean): Chip {
  if (kind !== null) {
    const visual = (
      EVENT_KIND_VISUALS as Record<string, { accent: string } | undefined>
    )[kind];
    return { label: kind, color: visual?.accent ?? TONE.mute };
  }
  const segment = hasWorkshops
    ? EVENT_SEGMENT_VISUALS.workshop
    : EVENT_SEGMENT_VISUALS.open;
  return { label: segment.label, color: segment.accent };
}

/** The struck-through state a cancelled night wears everywhere. */
export const CANCELLED_CHIP: Chip = { label: "Cancelled", color: TONE.dim };
