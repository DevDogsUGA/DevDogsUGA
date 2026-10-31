"use client";

import Image from "next/image";
import { useState } from "react";
import devdog from "~/assets/devdog.svg";
import { showcaseColor, showcaseIcon } from "~/config/showcaseKeys";
import type { SwitcherProject } from "~/server/projects/showcase";
import OpenOrShareDialog from "./OpenOrShareDialog";
import { Card } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { LIFT, ROW } from "./rowStyles";

interface Props {
  project: SwitcherProject;
  /** Dismisses the overlay when an in-app tile is followed. */
  onNavigate: () => void;
}

/**
 * Tighter than a listing row on phones, where the tiles sit two up.
 */
const TILE_SPACING = "gap-2 px-3 py-3.5 sm:gap-3 sm:px-4 sm:py-4";

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
  const { name, blurb, url, badge } = project;
  const { Icon, logo } = showcaseIcon(project.iconKey);
  const color = showcaseColor(project.colorKey);
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
          className={`flex size-8 shrink-0 items-center justify-center text-3xl sm:size-10 sm:text-4xl ${color}`}
        >
          <Icon weight="fill" />
        </div>
      )}

      {/* The status rides the tile's top edge, centered on the rim like a
          tab, so the name and its label have the inside to themselves. The
          switcher's grid leaves the extra row gap this needs. */}
      {badge && (
        <Chip outline className="switcher-badge">
          {badge}
        </Chip>
      )}

      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <h3 className="switcher-tile-name">
          {/* The button wraps the name and stretches over the whole tile with
              its own ::after, so the tile acts as one control without nesting
              block content inside a button element. */}
          {url ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="switcher-hit text-[length:inherit]"
            >
              {name}
            </button>
          ) : (
            name
          )}
        </h3>
        {blurb && <p className="small muted">{blurb}</p>}
      </div>
    </>
  );

  if (!url) {
    return (
      <Card aria-disabled="true" className={`${ROW} ${TILE_SPACING}`}>
        {body}
      </Card>
    );
  }

  return (
    <>
      <Card className={`${ROW} ${LIFT} ${TILE_SPACING}`}>{body}</Card>
      <OpenOrShareDialog
        title={name}
        url={url}
        external={url.startsWith("http")}
        open={open}
        onOpenChange={setOpen}
        onNavigate={onNavigate}
      />
    </>
  );
}
