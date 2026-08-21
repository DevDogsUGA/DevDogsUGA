import Link from "next/link";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import * as icons from "~/config/icons";
import type { Project } from "~/config/projects";

/**
 * One project, as an app icon rather than a card: the mark, its name and
 * status, a one-line blurb, and wherever it can be opened.
 *
 * The homepage cards are for reading about a project — full description, tech
 * stack, the year it ran. This is for picking one, so it carries none of that.
 */
export default function ProjectTile({
  badge,
  title,
  icon,
  iconBg,
  blurb,
  githubUrl,
  liveUrl,
}: Project) {
  const Icon = icons[icon];

  return (
    <div className="flex items-start gap-3 rounded-sm border border-mauve-800 bg-mauve-950 p-3 transition-colors hover:border-mauve-600">
      {/* The icon carries the block shadow the cards used to, so the tile
          itself can stay flat and let the mark be the thing you look at. */}
      <div
        className={`shadow-block-sm flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-black text-2xl text-black shadow-black ${iconBg}`}
      >
        <Icon weight="bold" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display leading-none font-bold text-white">
            {title}
          </h3>
          <span
            className={`rounded-sm ${badge.bg} ${badge.text} px-1.5 py-0.5 text-[0.625rem] leading-none font-bold tracking-wide uppercase`}
          >
            {badge.label}
          </span>
        </div>

        <p className="text-xs/relaxed text-balance text-mauve-400">{blurb}</p>

        {/* Same outline-then-solid pairing as the homepage cards, inverted for
            the black overlay: the repo link outlined, the live site filled. */}
        {(githubUrl ?? liveUrl) && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {githubUrl && (
              <Link
                href={githubUrl}
                target="_blank"
                className="flex items-center gap-1.5 rounded-sm border border-mauve-700 px-2 py-1 text-xs font-semibold text-mauve-200 transition-colors hover:border-mauve-500 hover:bg-mauve-900 hover:text-white"
              >
                <GithubLogoIcon /> GitHub
              </Link>
            )}
            {liveUrl && (
              <Link
                href={liveUrl.href}
                target="_blank"
                className="flex items-center gap-1.5 rounded-sm border border-white bg-white px-2 py-1 text-xs font-semibold text-black transition-colors hover:border-cyan-400 hover:bg-cyan-400"
              >
                <ArrowSquareOutIcon /> {liveUrl.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
