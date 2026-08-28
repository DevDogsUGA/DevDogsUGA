"use client";

import Image from "next/image";
import { useState } from "react";

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
  /**
   * The circle's rendered width in CSS pixels. Always a constant, never a
   * viewport fraction: `fill` defaults `sizes` to `100vw`, which fetched these
   * headshots at w=1920 to fill 112 physical pixels.
   */
  sizes: string;
}

/**
 * An officer's headshot, or their initials when there is not one.
 *
 * The `avatars` bucket is keyed by bare user id, so a URL can always be
 * composed for an officer whether or not they have ever uploaded anything --
 * "no avatar" is a 404, not a null. That is why the error branch matters as
 * much as the missing-src one, and why it is the same branch: it mirrors what
 * `ui/avatar.tsx` gets from Radix's `Avatar.Fallback` for every other avatar
 * in the app. Officers join the board before they send a photo, and a card
 * showing a broken image is worse than one showing a monogram.
 */
export default function Headshot({ name, src, sizes }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
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
      onError={() => setFailed(true)}
      className="object-cover object-center"
    />
  );
}
