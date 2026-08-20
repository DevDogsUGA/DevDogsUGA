import Link from "next/link";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import type { Project } from "~/config/projects";
import { TECH } from "~/config/tech";
import { PROJECT_ICONS } from "./project-icons";

export default function ProjectCard({
  badge,
  icon,
  year,
  title,
  titleColor,
  tagline,
  description,
  note,
  techStack,
  githubUrl,
  liveUrl,
  shadow = "shadow-block-lg",
}: Project) {
  const Icon = icon ? PROJECT_ICONS[icon] : null;
  return (
    <div
      className={`flex h-full flex-col gap-4 rounded-sm border-2 border-black bg-white p-6 ${shadow}`}
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
        <h3
          className={`font-display flex items-center gap-2 text-2xl font-bold ${titleColor}`}
        >
          {Icon && <Icon className="size-6 shrink-0" />}
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
                className="flex items-center gap-1.5 rounded-sm border border-mauve-300 px-2 py-0.5 font-mono text-xs text-mauve-500 transition-colors hover:border-mauve-400 hover:bg-mauve-50 hover:text-mauve-700"
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
      {(githubUrl ?? liveUrl) && (
        <div className="flex gap-3 border-t border-mauve-200 pt-4">
          {githubUrl && (
            <Link
              href={githubUrl}
              target="_blank"
              className="flex items-center gap-1.5 rounded-sm border border-mauve-300 bg-white px-3 py-1.5 text-sm font-medium text-mauve-700 transition-colors hover:bg-mauve-50"
            >
              <GithubLogoIcon /> GitHub
            </Link>
          )}
          {liveUrl && (
            <Link
              href={liveUrl.href}
              target="_blank"
              className="flex items-center gap-1.5 rounded-sm border border-emerald-500 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              <ArrowSquareOutIcon /> {liveUrl.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
