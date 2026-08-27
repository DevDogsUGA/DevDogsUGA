"use client";

import { toast as sonnerToast } from "sonner";
import { CheckIcon, WarningIcon, XIcon } from "@phosphor-icons/react/ssr";
import { blobsBackgroundImage, type BlobDef } from "./blob-gradient";

interface Props {
  id: string | number;
  message: string;
  type: "success" | "error";
}

interface ToneClasses {
  /** The card itself. */
  card: string;
  /**
   * The disc behind the glyph. Solid and dark, so the glyph inverts to white
   * and the icon reads as one mark rather than a stroke lying on the fill.
   * Success pairs a sky disc against its cyan card, the same two-hue move the
   * notice's urgent tone makes with rose on amber; error stays in one family,
   * as the notice's info tone does.
   */
  iconBg: string;
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
 * black type sits on them. The wash over each is the tone's own two colours,
 * so nothing new enters the palette — the card just stops being flat. See
 * ~/components/AnnouncementBanner.
 */
const TONE_BLOBS: Record<Props["type"], BlobDef[]> = {
  success: [
    {
      cx: "8%",
      cy: "0%",
      rx: "52%",
      ry: "160%",
      fill: "#38bdf8",
      opacity: 0.36,
    },
    {
      cx: "96%",
      cy: "100%",
      rx: "48%",
      ry: "170%",
      fill: "#a5f3fc",
      opacity: 0.6,
    },
  ],
  error: [
    {
      cx: "8%",
      cy: "0%",
      rx: "52%",
      ry: "160%",
      fill: "#fb7185",
      opacity: 0.34,
    },
    {
      cx: "96%",
      cy: "100%",
      rx: "48%",
      ry: "170%",
      fill: "#fecdd3",
      opacity: 0.6,
    },
  ],
};

/**
 * Built once at module load rather than per toast. The gradient is a fixed
 * function of a constant, and a burst of toasts would otherwise rebuild the
 * same sixteen `color-mix` stops for each one.
 */
const TONE_BACKGROUND: Record<Props["type"], string> = {
  success: blobsBackgroundImage(TONE_BLOBS.success),
  error: blobsBackgroundImage(TONE_BLOBS.error),
};

const TONES: Record<Props["type"], ToneClasses> = {
  success: {
    card: "bg-cyan-300",
    iconBg: "bg-sky-700",
    blockShadow: "shadow-cyan-600",
  },
  error: {
    card: "bg-rose-300",
    iconBg: "bg-rose-700",
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
      // The wash the sections and the stat cards draw, over the fill the tone's
      // `card` class sets. It goes on the card's own background rather than a
      // layer of its own: nothing here parallaxes, and a background is already
      // cut to the border radius.
      style={{ backgroundImage: TONE_BACKGROUND[type] }}
      className={`shadow-block-outlined-lg flex w-90 items-start gap-3 rounded-lg border-2 border-black px-4 py-3 text-black ${tone.card} ${tone.blockShadow}`}
    >
      {/* A disc, not the notice's corner badge: a badge says "something new
          arrived", which is the notice's whole job and none of a toast's — a
          toast is already the arrival. The glyph sits at two thirds of the
          disc, the proportion the nav's avatar badge holds. */}
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white ${tone.iconBg}`}
      >
        {type === "success" ? (
          <CheckIcon weight="bold" className="size-4" />
        ) : (
          <WarningIcon weight="bold" className="size-4" />
        )}
      </span>

      <p className="flex-1 text-sm leading-snug font-semibold text-balance">
        {message}
      </p>

      <button
        onClick={() => sonnerToast.dismiss(id)}
        className="group/dismiss relative mt-0.5 shrink-0 rounded-sm focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Dismiss"
      >
        {/* The hover state, as a square that grows in behind the cross rather
            than the cross itself growing. Scaling the glyph moved the one
            thing the eye was aiming at; this leaves it still and puts the
            feedback behind it. Tinted from the card's own black text colour,
            so it darkens the fill by the same amount whichever tone it is.

            `-inset-1` squares a size-4 glyph to 24px. It is behind the cross
            in paint order, which is what `relative` on the cross buys. */}
        <span
          aria-hidden
          className="absolute -inset-1 scale-50 rounded-sm bg-black/10 opacity-0 transition duration-150 ease-out group-hover/dismiss:scale-100 group-hover/dismiss:opacity-100 motion-reduce:transition-none"
        />
        {/* Not `fill`: Phosphor draws X at fill weight as a rounded square
            with the cross knocked out of it, which would collide with the
            square this button grows on its own. `bold` is the bare cross. */}
        <XIcon aria-hidden weight="bold" className="relative size-4" />
      </button>
    </div>
  );
}
