"use client";

import Image from "next/image";

/** "Jack Harrington" -> "JH". */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * The line under a leader's name: pronouns, class year, or both.
 *
 * Built by filtering rather than interpolating, because for this board most of
 * it is missing. Nobody stated pronouns and one officer of seven gave a
 * graduation year, so the template this replaced —
 * `{pronouns} · Class of {year}` — would have rendered a bare " · Class of "
 * under six names. Empty string means the caller omits the element.
 */
export function formatLeaderMeta(
  pronouns: string | null,
  year: string | null,
): string {
  return [pronouns, year ? `Class of ${year}` : null]
    .filter(Boolean)
    .join(" · ");
}

interface Props {
  name: string;
  src: string | null;
  blurDataUrl: string | null;
  /**
   * The circle's rendered width in CSS pixels. Always a constant, never a
   * viewport fraction: `fill` defaults `sizes` to `100vw`, which fetched these
   * headshots at w=1920 to fill 112 physical pixels.
   */
  sizes: string;
}

/**
 * An officer's headshot, or their initials when there is not one yet.
 *
 * `headshotPath` is nullable in the database because officers join the board
 * before they send a photo, and a card that renders a broken image is worse
 * than one that renders a monogram.
 */
export default function Headshot({ name, src, blurDataUrl, sizes }: Props) {
  if (!src) {
    return (
      <div
        aria-hidden
        className="font-display flex size-full items-center justify-center bg-amber-100 text-lg font-extrabold text-mauve-700"
      >
        {initials(name)}
      </div>
    );
  }

  return (
    <Image
      fill
      alt={name}
      src={src}
      sizes={sizes}
      // Derived at seed time from the uploaded image. A static import would
      // have given next/image one for free; a runtime URL gives it nothing,
      // so it is stored beside the key and passed back in here.
      {...(blurDataUrl
        ? { placeholder: "blur" as const, blurDataURL: blurDataUrl }
        : {})}
      className="object-cover object-center"
    />
  );
}
