"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import type { LeaderProfile } from ".";
import Headshot, { formatLeaderMeta } from "./Headshot";
import Link from "next/link";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr";

interface Props {
  profile: LeaderProfile;
  side?: "left" | "right" | "top" | "bottom";
  open?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onOpenChange?: (open: boolean) => void;
}

const linkCls =
  "flex items-center gap-1.5 rounded-sm border-2 border-black px-2.5 py-1 text-xs font-semibold text-black transition-lift hover:bg-rose-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-block-sm";

export default function LeaderCard({
  profile,
  side = "right",
  open,
  onHoverStart,
  onHoverEnd,
  onOpenChange,
}: Props) {
  const meta = formatLeaderMeta(profile.pronouns, profile.year);

  return (
    <HoverCard.Root
      open={open}
      openDelay={0}
      closeDelay={150}
      onOpenChange={onOpenChange}
    >
      <HoverCard.Trigger
        className="flex w-30 flex-col items-center gap-3 text-center"
        onMouseEnter={onHoverStart}
      >
        <div className="shadow-block-md relative size-28 overflow-hidden rounded-full border-3 border-mauve-950 shadow-rose-700">
          <Headshot
            name={profile.name}
            src={profile.imageSrc}
            // The circle above is `size-28` at every breakpoint, so this is a
            // constant, not a viewport fraction. It matters more here than
            // anywhere else on the page: without it `fill` defaults to `100vw`
            // and each of these headshots — several of them 3000-4000px wide —
            // was fetched at w=1920 to fill 112 CSS pixels.
            sizes="112px"
          />
        </div>
        <div>
          <p className="text-sm leading-tight font-bold text-mauve-950">
            {profile.name}
          </p>
          {profile.titles.map((t) => (
            <p key={t} className="mt-0.5 text-xs text-mauve-600">
              {t}
            </p>
          ))}
        </div>
      </HoverCard.Trigger>

      <HoverCard.Content
        className="leader-hover-card shadow-block-md flex w-64 flex-col gap-3 overflow-y-auto rounded-sm border-2 border-mauve-900 bg-amber-50 p-4 shadow-black data-[state=closed]:pointer-events-none"
        side={side}
        sideOffset={24}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        avoidCollisions={false}
      >
        {meta && <p className="text-xs text-mauve-500">{meta}</p>}
        <div className="flex flex-col gap-0.5 text-xs text-mauve-600">
          <p>
            <span className="font-semibold text-mauve-800">
              Major{profile.majors.length > 1 ? "s" : ""}:
            </span>{" "}
            {profile.majors.join(", ")}
          </p>
          {profile.minors.length > 0 && (
            <p>
              <span className="font-semibold text-mauve-800">
                Minor{profile.minors.length > 1 ? "s" : ""}:
              </span>{" "}
              {profile.minors.join(", ")}
            </p>
          )}
          {profile.certificates.length > 0 && (
            <p>
              <span className="font-semibold text-mauve-800">
                Cert{profile.certificates.length > 1 ? "s" : ""}:
              </span>{" "}
              {profile.certificates.join(", ")}
            </p>
          )}
        </div>
        {profile.bio && (
          <p className="text-xs leading-relaxed text-mauve-700">
            {profile.bio}
          </p>
        )}
        {profile.links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {profile.links.map((link) => (
              <Link
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={linkCls}
              >
                <ArrowSquareOutIcon size={12} /> {link.title}
              </Link>
            ))}
          </div>
        )}
      </HoverCard.Content>
    </HoverCard.Root>
  );
}
