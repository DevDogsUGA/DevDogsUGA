"use client";

import type { ComponentProps } from "react";
import { cn } from "~/lib/cn";
import Headshot from "./Headshot";
import type { LeaderProfile } from "./profile";

interface Props extends ComponentProps<"button"> {
  profile: LeaderProfile;
}

/**
 * The always-visible face of an officer: headshot circle, name, titles.
 * Renders as a button because both hosts open something from it — the grid
 * opens the bottom sheet on tap, the cluster opens the popup on focus. A
 * button's content model is phrasing content, hence spans over divs.
 */
export default function LeaderTile({ profile, className, ...props }: Props) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-30 cursor-pointer flex-col items-center gap-3 text-center",
        className,
      )}
      {...props}
    >
      <span className="shadow-block-md relative block size-28 overflow-hidden rounded-full border-3 border-mauve-950 shadow-mauve-700">
        <Headshot
          name={profile.name}
          src={profile.imageSrc}
          // The circle above is `size-28` at every breakpoint, so this is a
          // constant, not a viewport fraction. It matters more here than
          // anywhere else on the page: without it `fill` defaults to `100vw`
          // and each of these headshots, several of them 3000-4000px wide,
          // was fetched at w=1920 to fill 112 CSS pixels.
          sizes="112px"
        />
      </span>
      <span className="block">
        <span className="block text-sm leading-tight font-bold text-mauve-950">
          {profile.name}
        </span>
        {profile.titles.map((t) => (
          <span key={t} className="mt-0.5 block text-xs text-mauve-600">
            {t}
          </span>
        ))}
      </span>
    </button>
  );
}
