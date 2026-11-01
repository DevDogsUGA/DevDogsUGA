import "./weeklyArt.css";

import type { EmptyWeekTreatment } from "@devdogsuga/events";
import {
  artRuns,
  type ArtKind,
  type SemesterView,
  type SemesterWeek,
} from "~/lib/weeklyArt";
import { cn } from "~/lib/cn";

const KIND_CLASS: Record<ArtKind, string> = {
  scenery: "wa-scenery",
  lit: "wa-lit",
  dark: "wa-dark",
  open: "wa-open",
  frost: "wa-frost",
  blank: "",
};

/**
 * One semester's picture and the sentence that says the same thing. The
 * picture is decoration, `aria-hidden`; the text ("Fall 2026: 8 of 14 weeks")
 * carries the meaning for everyone.
 */
export function SemesterArt({
  view,
  treatment,
}: {
  view: SemesterView;
  treatment: EmptyWeekTreatment;
}) {
  return (
    <figure className="wa-sem" data-testid={`semester-${view.id}`}>
      <figcaption className="wa-text">{view.text}</figcaption>
      <div className="wa-art" aria-hidden="true">
        {view.art ? (
          <ArtPicture view={view} treatment={treatment} />
        ) : (
          <WeekCells weeks={view.weeks} treatment={treatment} />
        )}
      </div>
    </figure>
  );
}

function ArtPicture({
  view,
  treatment,
}: {
  view: SemesterView;
  treatment: EmptyWeekTreatment;
}) {
  const art = view.art!;
  const lines = artRuns(art, view.weeks, treatment);
  const columns = Math.max(...art.lines.map((line) => line.length));
  return (
    <pre
      className="wa-pre"
      style={{ "--wa-cols": columns } as React.CSSProperties}
    >
      {lines.map((runs, line) => (
        <span key={line}>
          {runs.map((run, index) =>
            run.kind === "blank" ? (
              run.text
            ) : (
              <i key={index} className={cn(KIND_CLASS[run.kind])}>
                {run.text}
              </i>
            ),
          )}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

/** No art for the semester: a plain row of week cells. */
function WeekCells({
  weeks,
  treatment,
}: {
  weeks: SemesterWeek[];
  treatment: EmptyWeekTreatment;
}) {
  const shown = weeks.filter(
    (week) => week.state !== "no-meeting" || treatment === "frost",
  );
  return (
    <ol className="wa-cells">
      {shown.map((week) => (
        <li
          key={week.week}
          className={cn(
            "wa-cell",
            week.state === "lit" && "wa-lit",
            week.state === "dark" && "wa-dark",
            week.state === "no-meeting" && "wa-frost",
          )}
        />
      ))}
    </ol>
  );
}

function unit(count: number): string {
  return count === 1 ? "week" : "weeks";
}

/**
 * The streak numbers and every semester's picture, newest first with earlier
 * semesters folded away. Shown on /dashboard/attendance (own) and on every public
 * profile (always: it follows the streak's visibility, which has no toggle).
 */
export default function WeeklyArt({
  heading,
  headingId,
  current,
  longest,
  semesters,
  treatment,
  note,
  headingClassName,
}: {
  heading: string;
  headingId: string;
  current: number;
  longest: number;
  semesters: SemesterView[];
  treatment: EmptyWeekTreatment;
  /** A line under the numbers, e.g. what Streak Freeze means. */
  note?: string;
  headingClassName?: string;
}) {
  const [latest, ...earlier] = semesters;
  return (
    <section aria-labelledby={headingId} data-testid="weekly-art">
      <h2 id={headingId} className={headingClassName}>
        {heading}
      </h2>
      <dl className="wa-streak" aria-label="Streak">
        <div>
          <dt>Current streak</dt>
          <dd>
            {current} <small>{unit(current)}</small>
          </dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>
            {longest} <small>{unit(longest)}</small>
          </dd>
        </div>
      </dl>
      {note && <p className="wa-note">{note}</p>}
      {latest ? (
        <div className="wa-sems">
          <SemesterArt view={latest} treatment={treatment} />
          {earlier.length > 0 && (
            <details className="wa-earlier">
              <summary>Earlier semesters</summary>
              <div className="wa-sems">
                {earlier.map((view) => (
                  <SemesterArt
                    key={view.id}
                    view={view}
                    treatment={treatment}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <p className="wa-note">No semester has started yet.</p>
      )}
    </section>
  );
}
