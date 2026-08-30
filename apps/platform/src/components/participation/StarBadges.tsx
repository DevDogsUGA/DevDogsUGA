import type { StarTotals } from "~/server/loaders/stars";

/**
 * The three stars a member can earn at one workshop.
 *
 * Three separate marks rather than one count, because they mean different
 * things and collapsing them loses the distinction the model is built on:
 *
 *   * **Workshop**: you were there, or you competed. Competing earns it even
 *     without attendance, which is why a member can hold this with no
 *     attendance row behind it.
 *   * **Competition**: your team's entry was frozen at judging. This is the
 *     one that cannot be taken away afterwards.
 *   * **Win**: your team won.
 *
 * A win implies the other two, so they nest visually rather than reading as
 * three unrelated achievements.
 */

export function StarBadges({
  workshopStar,
  competitionStar,
  won,
  size = "md",
}: {
  workshopStar: boolean;
  competitionStar: boolean;
  won: boolean;
  size?: "sm" | "md";
}) {
  const dot = size === "sm" ? "h-3 w-3 text-[9px]" : "h-5 w-5 text-xs";

  return (
    <span
      className="inline-flex items-center gap-1"
      // One label for the group. Three separate `title` attributes would make
      // a screen reader read "star, star, star" and tell nobody anything.
      role="img"
      aria-label={describe({ workshopStar, competitionStar, won })}
    >
      <Mark on={workshopStar} className={dot} title="Workshop">
        ★
      </Mark>
      <Mark on={competitionStar} className={dot} title="Competed">
        ★
      </Mark>
      <Mark on={won} className={dot} title="Won">
        ♛
      </Mark>
    </span>
  );
}

function Mark({
  on,
  className,
  title,
  children,
}: {
  on: boolean;
  className: string;
  title: string;
  children: string;
}) {
  return (
    <span
      aria-hidden
      title={title}
      className={`inline-flex items-center justify-center leading-none ${className} ${
        on ? "text-amber-500" : "text-black/15"
      }`}
    >
      {children}
    </span>
  );
}

function describe({
  workshopStar,
  competitionStar,
  won,
}: {
  workshopStar: boolean;
  competitionStar: boolean;
  won: boolean;
}): string {
  if (won) return "Won this competition";
  if (competitionStar) return "Competed";
  if (workshopStar) return "Attended the workshop";
  return "No participation recorded";
}

/** The row on a profile: how many of each, across every semester. */
export function StarTotalsRow({ totals }: { totals: StarTotals }) {
  const entries: [string, number, string][] = [
    ["Workshops", totals.workshopStars, "★"],
    ["Competed", totals.competitionStars, "★"],
    ["Won", totals.wins, "♛"],
  ];

  return (
    <dl className="flex gap-6">
      {entries.map(([label, value, glyph]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-xs tracking-wide text-mauve-400 uppercase">
            {label}
          </dt>
          <dd className="flex items-baseline gap-1.5 text-2xl font-bold tabular-nums">
            <span aria-hidden className="text-amber-300">
              {glyph}
            </span>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
