import Link from "next/link";
import { ArrowRightIcon, ArrowSquareOutIcon } from "@phosphor-icons/react/ssr";
import * as icons from "~/config/icons";
import type { Project } from "~/config/projects";

interface Props {
  project: Project;
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
          itself can stay flat and let the mark be the thing you look at. */}
      <div
        className={`shadow-block-sm flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-black text-2xl text-black shadow-black transition-transform group-hover:-translate-y-0.5 ${iconBg}`}
      >
        <Icon weight="bold" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display leading-none font-bold text-white">
            {project.title}
          </h3>
          {badge && (
            <span
              className={`rounded-sm ${badge.bg} ${badge.text} px-1.5 py-0.5 text-[0.625rem] leading-none font-bold tracking-wide uppercase`}
            >
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-xs/relaxed text-balance text-mauve-400">{blurb}</p>
      </div>

      {/* Which way the tile takes you: out to the project's own site, or
          further into this one. */}
      {url && (
        <span className="shrink-0 self-center text-mauve-600 transition-colors group-hover:text-white">
          {external ? <ArrowSquareOutIcon /> : <ArrowRightIcon />}
        </span>
      )}
    </>
  );

  const shell = "group flex items-start gap-3 rounded-sm border p-3";

  if (!url) {
    return (
      <div
        aria-disabled="true"
        className={`${shell} cursor-not-allowed border-mauve-900 bg-mauve-950 opacity-60`}
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
      className={`${shell} border-mauve-800 bg-mauve-950 transition-colors hover:border-mauve-600 hover:bg-mauve-900`}
    >
      {body}
    </Link>
  );
}
