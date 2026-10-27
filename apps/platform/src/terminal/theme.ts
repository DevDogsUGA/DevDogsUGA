import { COSMIC, DEVDOGS, KIND } from "@devdogsuga/sdk/brand";
import { CATEGORY_LABEL, categoryOf } from "../lib/eventKind";

/**
 * The terminal's colours, every one borrowed rather than chosen.
 *
 * Text tones are the Cosmic ink steps and event colours are the Cosmic
 * category hues (`KIND`, step 3, the light one that reads on a dark ground),
 * the same source `data-kind` paints on the site, so a build night is sky
 * here too. Nothing paints a background except a chip: a terminal's own
 * ground is whatever the reader chose, and these all read on dark and light
 * alike.
 */
export const TONE = {
  ink: COSMIC.text,
  mute: COSMIC["text-3"],
  /** The neutral card ring (FACTS), the dimmest text that still reads. */
  dim: "#6a6082",
  rule: COSMIC["line-strong"],
  /** The club red: the cursor underscore, the `$`, the "you are here" marks. */
  brand: DEVDOGS[6],
  /** Anything a reader might copy: URLs and curl commands. Brand pink, never a category. */
  link: DEVDOGS[3],
  /** Chip label text, drawn on a chip's colour. */
  onChip: COSMIC["on-accent"],
} as const;

/**
 * Page accents, one per `PageShell` accent the site uses. Colour means a
 * category on the site, so these borrow the category hues (and the brand pink
 * for rose). Cyan has no Cosmic hue of its own; like `PageHeader`'s
 * `ACCENT_HEAD`, it takes build's sky.
 */
export const ACCENT = {
  rose: DEVDOGS[3],
  amber: KIND.info[3],
  cyan: KIND.build[3],
  emerald: KIND.workshop[3],
  violet: KIND.milestone[3],
  sky: KIND.build[3],
} as const;

export type Accent = keyof typeof ACCENT;

/** A chip's label and colour, for an event category or segment. */
export interface Chip {
  label: string;
  color: string;
}

/** The chip for a meeting: its resolved category's label and colour. */
export function meetingChip(category: string | null): Chip {
  const resolved = categoryOf({ category });
  return { label: CATEGORY_LABEL[resolved], color: KIND[resolved][3] };
}

/** The struck-through state a cancelled night wears everywhere. */
export const CANCELLED_CHIP: Chip = { label: "Cancelled", color: TONE.dim };
