"use client";

import { useState } from "react";
import * as icons from "~/config/icons";
import type { SwitcherProject } from "~/config/projects";
import OpenOrShareDialog from "./OpenOrShareDialog";

interface Props {
  project: SwitcherProject;
  /** Dismisses the overlay when an in-app tile is followed. */
  onNavigate: () => void;
}

/**
 * One project, as an app icon rather than a card: the mark, its name and
 * status, and a one-line blurb. A project with nothing shipped yet has
 * nowhere to send you, so it renders disabled instead.
 *
 * Pressing a live tile asks — open or share? — rather than deciding for you,
 * so the tile itself carries no arrow or share control at all.
 *
 * The homepage cards are for reading about a project — full description, tech
 * stack, repo links, the year it ran. This is for opening one.
 */
export default function ProjectTile({ project, onNavigate }: Props) {
  const { icon, iconBg, blurb, url, badge } = project.switcher;
  const Icon = icons[icon];
  const [open, setOpen] = useState(false);

  const shell = "relative flex items-center gap-4 rounded-md border px-4 py-3";

  const body = (
    <>
      {/* The icon carries the block shadow the cards used to, so the tile
          itself can stay flat and let the mark be the thing you look at. Rim
          and shadow stay black, as everywhere else on the site — it is the
          tile beneath that lifts, to give them something to read against. */}
      <div
        className={`shadow-block-sm flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-black text-2xl text-black shadow-black transition-transform group-hover:-translate-y-0.5 ${iconBg}`}
      >
        <Icon weight="bold" />
      </div>

      {/* The gap is the tight one, between the name and the line describing
          it; the badge buys its own room back with a margin, so it sits apart
          from the pair rather than evenly among them. */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {/* On its own line above the name rather than beside it: the longer
            labels were wrapping the pill onto a second row anyway. */}
        {badge && (
          <span
            className={`mb-1 rounded-sm ${badge.bg} ${badge.text} px-1.5 py-0.5 text-[0.625rem] leading-none font-bold tracking-wide uppercase`}
          >
            {badge.label}
          </span>
        )}
        <h3 className="font-display leading-none font-bold text-white">
          {/* The button wraps the name and stretches over the whole tile with
              its own ::after — the tile acts as one control without nesting
              block content inside a button element. */}
          {url ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-white"
            >
              {project.title}
            </button>
          ) : (
            project.title
          )}
        </h3>
        <p className="text-xs/relaxed text-balance text-mauve-400">{blurb}</p>
      </div>
    </>
  );

  if (!url) {
    return (
      <div
        aria-disabled="true"
        className={`${shell} cursor-not-allowed border-mauve-700 bg-mauve-800 opacity-60`}
      >
        {body}
      </div>
    );
  }

  return (
    <>
      <div
        className={`${shell} group cursor-pointer border-mauve-700 bg-mauve-800 transition-colors hover:border-mauve-500 hover:bg-mauve-700`}
      >
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
