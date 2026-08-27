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
  /** The disc behind the icon. */
  dot: string;
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
 * black type sits on them. See ~/components/AnnouncementBanner.
 */
const TONES: Record<Props["type"], ToneClasses> = {
  success: {
    card: "bg-cyan-300",
    dot: "bg-cyan-700/40",
    blockShadow: "shadow-cyan-600",
  },
  error: {
    card: "bg-rose-300",
    dot: "bg-rose-700/40",
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
      className={`shadow-block-outlined-lg relative isolate flex w-90 items-start gap-3 overflow-hidden rounded-lg border-2 border-black px-4 py-3 text-black ${tone.card} ${tone.blockShadow}`}
    >
      {/* The site's dot texture, dialled to the same 0.07 as the notice, where
          it reads as paper grain rather than as a pattern of its own. */}
      <span
        aria-hidden
        className="bg-dot-grid-dense pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
      />

      {/* A filled glyph on a translucent disc of the tone, as on the notice.
          Neither glyph is round: a circled icon inside the disc would read as
          two concentric rings, so the check keeps its bare stroke and the
          warning takes the triangle it used to wear as a circle. */}
      <span className="relative flex size-7 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full ${tone.dot}`}
        />
        {type === "success" ? (
          <CheckIcon weight="bold" className="relative size-4" />
        ) : (
          <WarningIcon weight="fill" className="relative size-4" />
        )}
      </span>

      <p className="mt-1 flex-1 text-sm leading-snug font-semibold text-balance">
        {message}
      </p>

      <button
        onClick={() => sonnerToast.dismiss(id)}
        className="mt-1.5 shrink-0 rounded-sm transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Dismiss"
      >
        {/* `fill` to match the notice's dismiss tab, whose stroke weights
            topped out lighter than the type beside them. */}
        <XIcon aria-hidden weight="fill" className="size-3.5" />
      </button>
    </div>
  );
}
