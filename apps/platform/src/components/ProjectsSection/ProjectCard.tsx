import Link from "next/link";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import type { Project } from "~/config/projects";
import { TECH } from "~/config/tech";
import { PROJECT_ICONS } from "./project-icons";

interface Props extends Project {
  /**
   * De-emphasizes the card, for projects that are not open to contributions.
   *
   * Not a transform: every size steps down a notch, so the card is really
   * smaller and its text really shorter rather than a full-size card drawn at
   * 90%.
   *
   * Border and shadow keep the full card's black and only carry alpha, so the
   * ink thins instead of switching to a gray that reads as a different,
   * muddier color beside it. Fills stay real mauve. A translucent black fill
   * tinted toward whatever the section sat on, which made the card look washed
   * rather than quiet.
   */
  recessed?: boolean;
}

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
  recessed = false,
  shadow = recessed ? "shadow-block-md shadow-black/40" : "shadow-block-lg",
}: Props) {
  // One step down in size, spacing, and contrast, kept in one object so the
  // two variants cannot drift apart. Every padding has an entry: shrinking the
  // type without shrinking what surrounds it is what makes a small card read
  // as a big card squeezed. `chip` stays a step darker than `card` in both
  // variants, and that rule is relative, so it has to move with the fill.
  //
  // `fill` is its own entry because the card and the outlined GitHub button
  // share it. The button is meant to read as a cutout of the card, not a white
  // chip sitting on it.
  const t = recessed
    ? {
        card: "gap-3 border-black/50 p-4",
        fill: "bg-mauve-100",
        title: "text-xl",
        label: "text-[0.65rem]",
        body: "text-xs/relaxed",
        meta: "bg-mauve-200",
        chip: "bg-mauve-200 hover:bg-mauve-300",
        chipPad: "px-1.5 py-px",
        chipIcon: "size-2.5",
        stackPad: "pt-1.5",
        button: "px-3 py-1.5 text-xs",
        rule: "border-black/15",
        footPad: "pt-3",
      }
    : {
        card: "gap-4 border-black p-6",
        fill: "bg-white",
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

  // Capitalized so JSX reads it as a component, and guarded: `Badge.icon` is
  // optional, since the switcher's pills carry none.
  const BadgeIcon = badge.icon;

  // Same guard, same reason: only the apps with a drawn mark carry one.
  const mark = icon ? PROJECT_ICONS[icon] : null;

  return (
    <div
      className={`flex h-full flex-col rounded-sm border-2 ${shadow} ${t.fill} ${t.card}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`flex items-center gap-1 rounded-sm ${badge.bg} ${badge.text} ${t.chipPad} ${t.label} font-bold tracking-wide uppercase`}
        >
          {BadgeIcon && <BadgeIcon className={`${t.chipIcon} shrink-0`} />}
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
          {/* Inline and baseline-aligned rather than flex-centered: the mark
              is drawn to the font's metrics, so standing it on the baseline at
              the height it asks for puts its body exactly at cap height. */}
          {mark && (
            <mark.Icon
              className={`${mark.height} mr-2 inline-block w-auto align-baseline`}
            />
          )}
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
                // Sides and top at 1px, bottom at 2px, so the chips pick up
                // the same weighted underline the block shadows give the
                // cards. They sit a step darker than the card they lie on.
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
              className={`transition-lift hover:shadow-block-md flex shrink-0 items-center gap-2 rounded-sm border-2 border-black ${t.fill} ${t.button} font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5`}
            >
              <GithubLogoIcon /> GitHub
            </Link>
          )}
          {liveUrl && (
            <Link
              href={liveUrl.href}
              target="_blank"
              className={`transition-lift hover:shadow-block-md flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-emerald-400 ${t.button} font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5`}
            >
              <ArrowSquareOutIcon /> {liveUrl.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
