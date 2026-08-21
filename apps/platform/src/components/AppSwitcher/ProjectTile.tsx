import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import * as icons from "~/config/icons";
import type { SwitcherProject } from "~/config/projects";

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
 * The homepage cards are for reading about a project — full description, tech
 * stack, repo links, the year it ran. This is for opening one.
 */
export default function ProjectTile({ project, onNavigate }: Props) {
  const { icon, iconBg, blurb, url, badge } = project.switcher;
  const Icon = icons[icon];
  const external = url?.startsWith("http") ?? false;

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
          {project.title}
        </h3>
        <p className="text-xs/relaxed text-balance text-mauve-400">{blurb}</p>
      </div>

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

  // No `group` here: it goes on the link alone, so nothing on a disabled tile
  // responds to a hover it cannot act on.
  const shell = "flex items-center gap-4 rounded-md border px-4 py-3";

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
    <Link
      href={url}
      {...(external
        ? { target: "_blank" }
        : // In-app, so the overlay has to get out of the way behind it.
          { onClick: onNavigate })}
      className={`${shell} group border-mauve-700 bg-mauve-800 transition-colors hover:border-mauve-500 hover:bg-mauve-700`}
    >
      {body}
    </Link>
  );
}
