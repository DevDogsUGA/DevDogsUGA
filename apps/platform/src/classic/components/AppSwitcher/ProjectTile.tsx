"use client";

import Image from "next/image";
import { useState } from "react";
import devdog from "~/assets/devdog.svg";
import * as icons from "~/config/icons";
import type { SwitcherProject } from "~/classic/config/projects";
import { cn } from "~/lib/cn";
import OpenOrShareDialog from "./OpenOrShareDialog";
import { LIFT, PLAIN, PLAIN_HOVER, ROW } from "./rowStyles";

interface Props {
  project: SwitcherProject;
  /** Dismisses the overlay when an in-app tile is followed. */
  onNavigate: () => void;
}

/**
 * Tighter than a listing row on phones, where the tiles sit two up, and
 * deeper at the top, where the badge overlaps the rim.
 */
const TILE_SPACING = "gap-2 px-2 pt-4 pb-3.5 sm:gap-3 sm:px-4 sm:pt-5 sm:pb-4";

/**
 * One project, as the switcher's button rather than a card: the mark, its
 * status, name and what it is in a couple of words. A project with nothing
 * shipped yet has nowhere to send you, so it renders disabled instead.
 *
 * Pressing a live tile asks whether to open or share rather than deciding for
 * you, so the tile itself carries no arrow or share control at all.
 *
 * The homepage cards are for reading about a project: full description, tech
 * stack, repo links, the year it ran. This is for opening one.
 */
export default function ProjectTile({ project, onNavigate }: Props) {
  const { icon, color, logo, blurb, url, badge } = project.switcher;
  const Icon = icons[icon];
  const [open, setOpen] = useState(false);

  const body = (
    <>
      {/* The mark as the homepage and the docs draw it: the mascot, or a
          bare filled glyph in the app's color, with no tile of its own. The
          row around it is the button. */}
      {logo ? (
        <div className="flex size-8 shrink-0 items-center justify-center sm:size-10">
          <Image alt="" src={devdog} sizes="(min-width: 40rem) 40px, 32px" />
        </div>
      ) : (
        <div
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center text-3xl sm:size-10 sm:text-4xl",
            color,
          )}
        >
          <Icon weight="fill" />
        </div>
      )}

      {/* The status rides the tile's top edge, centered on the rim like a
          tab, so the name and its label have the inside to themselves. The
          switcher's grid leaves the extra row gap this needs. */}
      {badge && (
        <span
          className={cn(
            "absolute -top-px left-2 -translate-y-1/2 rounded-sm px-1.5 py-0.5 text-[0.625rem] leading-none font-bold tracking-wide whitespace-nowrap uppercase sm:left-4",
            badge.bg,
            badge.text,
          )}
        >
          {badge.label}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <h3 className="font-display text-[0.8125rem] leading-none font-bold text-white sm:text-base">
          {/* The button wraps the name and stretches over the whole tile with
              its own ::after, so the tile acts as one control without nesting
              block content inside a button element. */}
          {url ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-sm text-left outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-white"
            >
              {project.title}
            </button>
          ) : (
            project.title
          )}
        </h3>
        <p className="text-[0.6875rem] leading-tight text-mauve-400 sm:text-xs">
          {blurb}
        </p>
      </div>
    </>
  );

  if (!url) {
    return (
      <div
        aria-disabled="true"
        className={cn(
          ROW,
          PLAIN,
          TILE_SPACING,
          "cursor-not-allowed opacity-60",
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <>
      <div className={cn(ROW, PLAIN, PLAIN_HOVER, LIFT, TILE_SPACING)}>
        {body}
      </div>
      <OpenOrShareDialog
        title={project.title}
        url={url}
        external={url.startsWith("http")}
        open={open}
        onOpenChange={setOpen}
        onNavigate={onNavigate}
      />
    </>
  );
}
