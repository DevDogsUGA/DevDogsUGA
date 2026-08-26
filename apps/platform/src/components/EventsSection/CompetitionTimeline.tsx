import type { ReactNode } from "react";
import type { MeetingSegment } from "~/lib/meetingSegments";
import { CHIP_CLS, segmentBadge } from "./meetingView";

/**
 * One competition, drawn as the week it actually is.
 *
 * The model this has to keep straight (see `docs/platform/guides/meetings-and-
 * teams`): a competition is not an evening. It is a week-long window bracketed
 * by two in-person moments that belong to two *different* meetings — the
 * workshop that opens it and the judging that closes it — so a meeting
 * straddles two competitions. Three stacked cards said that in prose and
 * looked like three events. A strip of days with a bar across it says it
 * without prose: two dots a week apart, and the thing being judged is the bar
 * between them.
 *
 * Two parts, deliberately. The strip is the diagram — which day each thing
 * happens on — and it stays terse because at eight columns there is no room
 * for a sentence under a dot. The list below carries the sentences, one per
 * beat, each labelled with the same day so a reader can match them up. On a
 * phone the strip keeps its dots and bar but drops its labels; the list is
 * where the words are at that width anyway.
 *
 * Colour is the same information it is everywhere else on the events pages:
 * `segmentBadge` decides it. Kickoff and judging share the competition cyan,
 * which is why the bar between them is cyan too — they are the two ends of one
 * thing.
 *
 * Reads no clock and no database. It is a fixed diagram of the club's format,
 * so it is safe inside any cache scope and on any page.
 */

/**
 * The club meets on Tuesday nights and the open build session is the Wednesday
 * after. This is the one place that fact is written down for the diagram, so a
 * change of night is a one-line change here.
 */
const WEEK = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"] as const;

/** Grid columns are 1-based, like `grid-column-start`. */
const MEETING_COL = 1;
const OPEN_BUILD_COL = 2;
const JUDGING_COL = WEEK.length;

interface Beat {
  /** Which day, as the list prints it. */
  day: string;
  title: string;
  body: ReactNode;
  /** The chips under the title. Empty for the async window, which is not a
   *  meeting and so has no segment. */
  segments: MeetingSegment[];
}

const BEATS: Beat[] = [
  {
    day: "Tuesday",
    title: "The workshop opens it",
    body: (
      <>
        A meeting runs one workshop per project, in parallel. Most end by
        announcing the feature to build next, and that announcement is the
        kickoff. The same night also judges last week&rsquo;s competition.
      </>
    ),
    segments: ["workshop", "kickoff"],
  },
  {
    day: "Wednesday",
    title: "Open build in the room",
    body: (
      <>
        No agenda: the room is open and officers are around. Come work on the
        feature with your team, or just work.
      </>
    ),
    segments: ["open"],
  },
  {
    day: "Wednesday to Monday",
    title: "Teams build it, asynchronously",
    body: (
      <>
        Up to four people per team, no room and no fixed hours. Each team opens
        a pull request against the competition&rsquo;s branch before judging.
      </>
    ),
    segments: [],
  },
  {
    day: "Next Tuesday",
    title: "The next meeting judges it",
    body: (
      <>
        Teams present what they built and the winning pull request gets merged.
        The rest are closed unmerged — taking part is what earns the star, so a
        losing entry does not cost one.
      </>
    ),
    segments: ["judging"],
  },
];

/** A grid dot on the strip: the in-person moments. */
function Dot({ col, dot, label }: { col: number; dot: string; label: string }) {
  return (
    <span
      className="relative z-10 flex justify-center"
      style={{ gridColumnStart: col }}
    >
      <span
        role="img"
        aria-label={label}
        className={`size-4 rounded-full border-2 border-black ${dot}`}
      />
    </span>
  );
}

/**
 * A label pinned to one column, allowed to be wider than the column: the grid
 * is `minmax(0, 1fr)` so the text overflows the cell rather than stretching
 * it, and `justify-self-center` keeps it centred on the dot beneath.
 */
function StripLabel({
  col,
  span = 1,
  children,
}: {
  col: number;
  span?: number;
  children: ReactNode;
}) {
  return (
    <span
      className="hidden justify-self-center text-xs font-bold whitespace-nowrap text-black md:block"
      style={{ gridColumn: `${col} / span ${span}` }}
    >
      {children}
    </span>
  );
}

export default function CompetitionTimeline() {
  // The bar runs from the centre of the first column to the centre of the
  // last, so it starts under the kickoff dot and ends under the judging dot.
  const half = `${100 / WEEK.length / 2}%`;

  return (
    <div className="flex flex-col gap-10">
      {/* The strip. Four rows of the same eight columns: day names, the labels
          above the track, the track itself, and the labels below it. Labels
          alternate above and below so two moments a day apart do not collide
          at 768px. */}
      <div
        className="grid grid-cols-8 gap-y-2"
        role="figure"
        aria-label="One competition across a week, from the Tuesday workshop that opens it to the following Tuesday's judging"
      >
        {WEEK.map((day, i) => {
          const isMeeting = i === 0 || i === WEEK.length - 1;
          return (
            <span
              key={i}
              className={`font-display text-center text-xs font-extrabold tracking-widest uppercase ${
                isMeeting ? "text-black" : "text-mauve-500"
              }`}
            >
              {day}
            </span>
          );
        })}

        {/* Above the track. */}
        <div className="col-span-8 hidden h-5 grid-cols-8 items-end md:grid">
          <StripLabel col={MEETING_COL}>Workshop + kickoff</StripLabel>
          <StripLabel col={JUDGING_COL}>Judging</StripLabel>
        </div>

        {/* The track. */}
        <div className="relative col-span-8 grid h-6 grid-cols-8 items-center">
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-mauve-300"
          />
          <span
            aria-hidden
            className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border-2 border-black ${segmentBadge.kickoff.bg}`}
            style={{ left: half, right: half }}
          />
          <Dot
            col={MEETING_COL}
            dot={segmentBadge.workshop.bg}
            label="Tuesday: workshop and kickoff"
          />
          <Dot
            col={OPEN_BUILD_COL}
            dot={segmentBadge.open.bg}
            label="Wednesday: open build"
          />
          <Dot
            col={JUDGING_COL}
            dot={segmentBadge.judging.bg}
            label="Next Tuesday: judging"
          />
        </div>

        {/* Below the track. */}
        <div className="col-span-8 hidden h-5 grid-cols-8 items-start md:grid">
          <StripLabel col={OPEN_BUILD_COL}>Open build</StripLabel>
          <StripLabel col={OPEN_BUILD_COL + 1} span={5}>
            <span className="flex justify-center text-mauve-700">
              Competition open — teams build asynchronously
            </span>
          </StripLabel>
        </div>
      </div>

      {/* The beats. A ruled list rather than boxes: the top rule per item is
          the only chrome, so four of them read as one row with four columns
          and not as four cards. */}
      <ol className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {BEATS.map((beat) => (
          <li
            key={beat.title}
            className="flex flex-col gap-2 border-t-2 border-black pt-3"
          >
            <p className="font-display text-xs font-extrabold tracking-widest text-mauve-500 uppercase">
              {beat.day}
            </p>
            <h3 className="font-display text-lg leading-tight font-extrabold text-black">
              {beat.title}
            </h3>
            {beat.segments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {beat.segments.map((segment) => {
                  const badge = segmentBadge[segment];
                  return (
                    <span
                      key={segment}
                      className={`${badge.bg} ${badge.text} ${CHIP_CLS}`}
                    >
                      {badge.label}
                    </span>
                  );
                })}
              </div>
            )}
            <p className="text-sm/relaxed text-mauve-700">{beat.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
