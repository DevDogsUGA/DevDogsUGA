import Link from "next/link";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import type { Project } from "~/config/projects";
import { TECH } from "~/config/tech";

interface Props extends Project {
  /**
   * Sits the card back from the ones beside it, for projects that are not open
   * to contributions. Same card — this only scales and fades it, the way
   * `EventCard` recedes an event that is not the highlighted one, and hovering
   * brings it fully back. Only from `lg` up, where there is room for the size
   * difference to read as depth rather than as a smaller card.
   */
  recessed?: boolean;
}

export default function ProjectCard({
  badge,
  year,
  title,
  titleColor,
  tagline,
  description,
  note,
  techStack,
  githubUrl,
  liveUrl,
  recessed = false,
  shadow = "shadow-block-lg",
}: Props) {
  return (
    <div
      className={`flex h-full flex-col gap-4 rounded-sm border-2 border-black bg-white p-6 ${shadow} ${
        recessed
          ? "transition-[opacity,scale] hover:scale-100 hover:opacity-100 lg:scale-90 lg:opacity-75"
          : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`rounded-sm ${badge.bg} ${badge.text} px-2 py-0.5 text-xs font-bold tracking-wide uppercase`}
        >
          {badge.label}
        </span>
        <span className="rounded-sm bg-mauve-100 px-2 py-0.5 font-mono text-xs text-mauve-500">
          {year}
        </span>
      </div>
      <div className="space-y-1">
        <h3 className={`font-display text-2xl font-bold ${titleColor}`}>
          {title}
        </h3>
        <p className="text-sm font-semibold text-mauve-500">{tagline}</p>
      </div>
      <p className="text-sm/relaxed text-mauve-600">{description}</p>
      {note && <p className="text-sm text-mauve-500 italic">{note}</p>}
      {techStack && techStack.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {techStack.map((key) => {
            const tech = TECH[key];
            return (
              <Link
                key={key}
                href={tech.href}
                target="_blank"
                // Sides and top at 1px, bottom at 2px — the chips pick up the
                // same weighted underline the block shadows give the cards,
                // and sit a step darker than the card they lie on.
                className="flex items-center gap-1.5 rounded-sm border-x border-t border-b-2 border-mauve-300 bg-mauve-50 px-2 py-0.5 font-mono text-xs text-mauve-500 transition-colors hover:border-mauve-400 hover:bg-mauve-100 hover:text-mauve-700"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-3 shrink-0 fill-current"
                >
                  <path d={tech.path} />
                </svg>
                {tech.label}
              </Link>
            );
          })}
        </div>
      )}
      {/* Both buttons carry the streak CTA's shapes: the outline for the
          secondary repo link, the solid fill for the deployed site. */}
      {(githubUrl ?? liveUrl) && (
        <div className="flex justify-end gap-3 border-t border-mauve-200 pt-4">
          {githubUrl && (
            <Link
              href={githubUrl}
              target="_blank"
              className="transition-lift hover:shadow-block-md flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <GithubLogoIcon /> GitHub
            </Link>
          )}
          {liveUrl && (
            <Link
              href={liveUrl.href}
              target="_blank"
              className="transition-lift hover:shadow-block-sm flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-mauve-950 px-4 py-2 text-sm font-semibold text-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-cyan-400"
            >
              <ArrowSquareOutIcon /> {liveUrl.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
