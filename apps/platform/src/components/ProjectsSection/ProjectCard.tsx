import Link from "next/link";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";

interface ProjectCardProps {
  badge: { label: string; bg: string; text: string };
  year: string;
  title: string;
  titleColor: string;
  description: string;
  techStack?: string[];
  githubUrl?: string;
  liveUrl?: string;
  joinCta?: { text: string; href: string; linkText: string };
  shadow?: string;
}

export default function ProjectCard({
  badge,
  year,
  title,
  titleColor,
  description,
  techStack,
  githubUrl,
  liveUrl,
  joinCta,
  shadow = "shadow-block-lg",
}: ProjectCardProps) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-sm border-2 border-black bg-white p-6 ${shadow}`}
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
      <h3 className={`font-display text-2xl font-bold ${titleColor}`}>
        {title}
      </h3>
      <p className="text-sm/relaxed text-mauve-600">{description}</p>
      {techStack && techStack.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2">
          {techStack.map((t) => (
            <span
              key={t}
              className="rounded-sm border border-mauve-300 px-2 py-0.5 font-mono text-xs text-mauve-500"
            >
              {t}
            </span>
          ))}
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
              href={liveUrl}
              target="_blank"
              className="flex items-center gap-1.5 rounded-sm border border-emerald-500 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              <ArrowSquareOutIcon /> Live Site
            </Link>
          )}
        </div>
      )}
      {joinCta && (
        <p className="border-t border-mauve-200 pt-4 text-sm text-mauve-500">
          {joinCta.text}{" "}
          <Link
            href={joinCta.href}
            className="text-emerald-700 hover:underline"
          >
            {joinCta.linkText}
          </Link>{" "}
          and start shipping.
        </p>
      )}
    </div>
  );
}
