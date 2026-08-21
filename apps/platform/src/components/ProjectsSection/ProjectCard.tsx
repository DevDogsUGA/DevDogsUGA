import Link from "next/link";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import type { Project } from "~/config/projects";
import { TECH } from "~/config/tech";

interface Props extends Project {
  /**
   * De-emphasizes the card, for projects that are not open to contributions.
   *
   * Not a transform: every size steps down a notch so the card is genuinely
   * smaller and its text genuinely shorter, rather than a full-size card drawn
   * at 90%. The border and block shadow lighten from black to mauve, and the
   * fill darkens off white, so the card settles into the section instead of
   * standing off it.
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
  shadow = recessed ? "shadow-block-md shadow-mauve-400" : "shadow-block-lg",
}: Props) {
  // One step down in size and one step down in contrast, kept together so the
  // two variants cannot drift apart. `chip` stays a step darker than `card`
  // in both, which is the rule the tags follow everywhere.
  const t = recessed
    ? {
        card: "gap-3 border-mauve-400 bg-mauve-100 p-5",
        title: "text-xl",
        label: "text-[0.65rem]",
        body: "text-xs/relaxed",
        meta: "bg-mauve-200",
        chip: "bg-mauve-200 hover:bg-mauve-300",
        chipIcon: "size-2.5",
        button: "px-3 py-1.5 text-xs",
        rule: "border-mauve-300",
      }
    : {
        card: "gap-4 border-black bg-white p-6",
        title: "text-2xl",
        label: "text-xs",
        body: "text-sm/relaxed",
        meta: "bg-mauve-100",
        chip: "bg-mauve-50 hover:bg-mauve-100",
        chipIcon: "size-3",
        button: "px-4 py-2 text-sm",
        rule: "border-mauve-200",
      };

  return (
    <div
      className={`flex h-full flex-col rounded-sm border-2 ${shadow} ${t.card}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`rounded-sm ${badge.bg} ${badge.text} px-2 py-0.5 ${t.label} font-bold tracking-wide uppercase`}
        >
          {badge.label}
        </span>
        <span
          className={`rounded-sm ${t.meta} px-2 py-0.5 font-mono ${t.label} text-mauve-500`}
        >
          {year}
        </span>
      </div>
      <div className="space-y-1">
        <h3 className={`font-display ${t.title} font-bold ${titleColor}`}>
          {title}
        </h3>
        <p className={`${t.body} font-semibold text-mauve-500`}>{tagline}</p>
      </div>
      <p className={`${t.body} text-mauve-600`}>{description}</p>
      {note && <p className={`${t.body} text-mauve-500 italic`}>{note}</p>}
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
                className={`flex items-center gap-1.5 rounded-sm border-x border-t border-b-2 border-mauve-300 ${t.chip} px-2 py-0.5 font-mono ${t.label} text-mauve-500 transition-colors hover:border-mauve-400 hover:text-mauve-700`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={`${t.chipIcon} shrink-0 fill-current`}
                >
                  <path d={tech.path} />
                </svg>
                {tech.label}
              </Link>
            );
          })}
        </div>
      )}
      {/* Both buttons carry the streak CTA's shapes and its black block shadow:
          the outline for the secondary repo link, the solid fill for the site. */}
      {(githubUrl ?? liveUrl) && (
        <div className={`flex justify-end gap-3 border-t ${t.rule} pt-4`}>
          {githubUrl && (
            <Link
              href={githubUrl}
              target="_blank"
              className={`transition-lift hover:shadow-block-md flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-white ${t.button} font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5`}
            >
              <GithubLogoIcon /> GitHub
            </Link>
          )}
          {liveUrl && (
            <Link
              href={liveUrl.href}
              target="_blank"
              className={`transition-lift hover:shadow-block-md flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-emerald-600 ${t.button} font-semibold text-white hover:-translate-x-0.5 hover:-translate-y-0.5`}
            >
              <ArrowSquareOutIcon /> {liveUrl.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
