"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import * as icons from "~/config/icons";
import type { SwitcherProject } from "~/config/projects";
import { useLongPress } from "~/lib/useLongPress";
import { useShare } from "~/lib/useShare";
import ShareButton from "~/ui/share-button";

interface Props {
  project: SwitcherProject;
  /** Dismisses the overlay when an in-app tile is followed. */
  onNavigate: () => void;
}

/**
 * One project, as an app icon rather than a card: the mark, its name and
 * status, and a one-line blurb. The whole tile is the link — a project with
 * nothing shipped yet has nowhere to send you, so it renders disabled instead.
 *
 * Either destination, two ways: tapping opens the project, while a pointer
 * that can hover gets a share button and a finger gets a long press. Both
 * reach the same sheet.
 *
 * The homepage cards are for reading about a project — full description, tech
 * stack, repo links, the year it ran. This is for opening one.
 */
export default function ProjectTile({ project, onNavigate }: Props) {
  const { icon, iconBg, blurb, url, badge } = project.switcher;
  const Icon = icons[icon];
  const external = url?.startsWith("http") ?? false;

  const share = useShare({ title: project.title, url: url ?? "/" });
  const longPress = useLongPress(share);

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
          {/* The link wraps the name and stretches over the whole tile with
              its own ::after, so the tile is one anchor with the share button
              beside it rather than a button nested inside a link. */}
          {url ? (
            <Link
              href={url}
              {...(external
                ? { target: "_blank" }
                : // In-app, so the overlay has to get out of the way behind it.
                  { onClick: onNavigate })}
              className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-white"
            >
              {project.title}
            </Link>
          ) : (
            project.title
          )}
        </h3>
        <p className="text-xs/relaxed text-balance text-mauve-400">{blurb}</p>
      </div>

      {/* Kept in the DOM rather than rendered on hover, so a screen reader
          still finds it — a long press is not an affordance it can announce.
          Invisible and untappable at rest, which is the state touch stays in,
          since Tailwind gates `hover:` behind a pointer that can hover. */}
      {url && (
        <ShareButton
          title={project.title}
          url={url}
          label={project.title}
          className="pointer-events-none relative z-10 shrink-0 rounded-sm p-1 text-mauve-400 opacity-0 transition-[opacity,color] outline-none group-hover:pointer-events-auto group-hover:opacity-100 hover:text-white focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white"
        />
      )}

      {/* The same arrow whether the tile leaves the site or not — where it
          lands is the tile's business, and two glyphs only made the row of
          them look inconsistent. */}
      {url && (
        <span className="shrink-0 text-mauve-400 transition-colors group-hover:text-white">
          <ArrowRightIcon weight="bold" />
        </span>
      )}
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
    // `select-none` and the callout reset keep iOS from selecting the blurb or
    // popping its own link menu partway through a long press.
    <div
      {...longPress}
      className={`${shell} group border-mauve-700 bg-mauve-800 transition-colors select-none [-webkit-touch-callout:none] hover:border-mauve-500 hover:bg-mauve-700`}
    >
      {body}
    </div>
  );
}
