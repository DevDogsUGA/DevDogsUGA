"use client";

import { toast as sonnerToast } from "sonner";
import { CheckIcon, WarningIcon, XIcon } from "@phosphor-icons/react/ssr";

interface Props {
  id: string | number;
  message: string;
  type: "success" | "error";
}

interface ToneClasses {
  /** The card itself. */
  card: string;
  /**
   * The block the card rests on. `shadow-block-outlined-lg`, the same
   * construction the announcement notice uses and for the same reason: the
   * body is `bg-black`, so a black block is no block at all and the colour
   * has to carry it, while a coloured block with no edge is a smear. One size
   * down from the notice's xl — this card is a fifth the width, and an offset
   * that reads as depth there reads as a slab here.
   */
  blockShadow: string;
}

/**
 * Dark-on-bright, matching the announcement notice. Toasts land over the same
 * near-black chrome, and a saturated light card is what the site uses to sit
 * on top of it. The tones stay in the families the toast already spoke — cyan
 * for done, rose for wrong — pitched up to the notice's 300-level fill so
 * black type sits on them, which is also what lets the glyph go plain black
 * and still read. See ~/components/AnnouncementBanner.
 */
const TONES: Record<Props["type"], ToneClasses> = {
  success: {
    card: "bg-cyan-300",
    blockShadow: "shadow-cyan-600",
  },
  error: {
    card: "bg-rose-300",
    blockShadow: "shadow-rose-600",
  },
};

export default function Toast({ id, message, type }: Props) {
  const tone = TONES[type];
  return (
    // Template literal rather than cn(): tailwind-merge files
    // `shadow-block-outlined-lg` and `shadow-cyan-600` under one `shadow`
    // group and keeps only the last, which deletes the block and leaves a
    // colour with nothing to colour. Every block-shadow call site on the site
    // concatenates for this reason.
    <div
      className={`shadow-block-outlined-lg flex w-90 items-start gap-3 rounded-lg border-2 border-black px-4 py-3 text-black ${tone.card} ${tone.blockShadow}`}
    >
      {/* No badge here, unlike the notice's megaphone: a badge says "something
          new arrived", which is the notice's whole job and none of a toast's —
          a toast is already the arrival. The glyph carries it alone. */}
      {type === "success" ? (
        <CheckIcon weight="bold" className="mt-0.5 size-5 shrink-0" />
      ) : (
        <WarningIcon weight="bold" className="mt-0.5 size-5 shrink-0" />
      )}

      <p className="flex-1 text-sm leading-snug font-semibold text-balance">
        {message}
      </p>

      <button
        onClick={() => sonnerToast.dismiss(id)}
        className="mt-0.5 shrink-0 rounded-sm transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Dismiss"
      >
        {/* Not `fill`: Phosphor draws X at fill weight as a rounded square
            with the cross knocked out of it, which reads as a button inside
            the button. `bold` is the bare cross, as on the notice's tab. */}
        <XIcon aria-hidden weight="bold" className="size-4" />
      </button>
    </div>
  );
}
