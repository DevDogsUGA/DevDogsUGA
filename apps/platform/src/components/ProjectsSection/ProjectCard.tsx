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
   * at 90%.
   *
   * The tones are the same black the full card uses, just carrying alpha —
   * border, shadow, and fill all thin out rather than switching to a gray. A
   * literal lighter gray reads as a different, muddier color next to the black
   * borders beside it; translucent black reads as the same ink, further away.
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
  shadow = recessed ? "shadow-block-md shadow-black/30" : "shadow-block-lg",
}: Props) {
  // One step down in size, spacing, and contrast, kept in one object so the
  // two variants cannot drift apart. Every padding has an entry: shrinking the
  // type without shrinking what surrounds it is what makes a small card read
  // as a big card squeezed. `chip` also stays a step darker than `card` in
  // both variants — that rule is relative, so it has to move with the fill.
  const t = recessed
    ? {
        card: "gap-3 border-black/40 bg-black/5 p-4",
        title: "text-xl",
        label: "text-[0.65rem]",
        body: "text-xs/relaxed",
        meta: "bg-black/10",
        chip: "bg-black/10 hover:bg-black/15",
        chipPad: "px-1.5 py-px",
        chipIcon: "size-2.5",
        stackPad: "pt-1.5",
        button: "px-3 py-1.5 text-xs",
        rule: "border-black/15",
        footPad: "pt-3",
      }
    : {
        card: "gap-4 border-black bg-white p-6",
        title: "text-2xl",
        label: "text-xs",
        body: "text-sm/relaxed",
        meta: "bg-mauve-100",
        chip: "bg-mauve-50 hover:bg-mauve-100",
        chipPad: "px-2 py-0.5",
        chipIcon: "size-3",
        stackPad: "pt-2",
        button: "px-4 py-2 text-sm",
        rule: "border-mauve-200",
        footPad: "pt-4",
      };

  return (
    <div
      className={`flex h-full flex-col rounded-sm border-2 ${shadow} ${t.card}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`rounded-sm ${badge.bg} ${badge.text} ${t.chipPad} ${t.label} font-bold tracking-wide uppercase`}
        >
          {badge.label}
        </span>
        <span
          className={`rounded-sm ${t.meta} ${t.chipPad} font-mono ${t.label} text-mauve-500`}
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
        <div className={`mt-auto flex flex-wrap gap-2 ${t.stackPad}`}>
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
                className={`flex items-center gap-1.5 rounded-sm border-x border-t border-b-2 border-mauve-300 ${t.chip} ${t.chipPad} font-mono ${t.label} text-mauve-500 transition-colors hover:border-mauve-400 hover:text-mauve-700`}
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
        <div
          className={`flex justify-end gap-3 border-t ${t.rule} ${t.footPad}`}
        >
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
              className={`transition-lift hover:shadow-block-md flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-emerald-500 ${t.button} font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5`}
            >
              <ArrowSquareOutIcon /> {liveUrl.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
