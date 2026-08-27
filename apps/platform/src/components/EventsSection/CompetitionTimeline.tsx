import type { ReactNode } from "react";
import { segmentBadge } from "./meetingView";

/**
 * One competition, drawn as the week it actually is.
 *
 * The model this has to keep straight (see `docs/platform/guides/meetings-and-
 * teams`): a competition is not an evening. It is a week-long window bracketed
 * by two in-person moments that belong to two *different* meetings — the
 * workshop that opens it and the judging that closes it — so a meeting
 * straddles two competitions. A strip of days with a bar across it says that
 * without prose: two dots a week apart, and the thing being judged is the bar
 * between them.
 *
 * This is only the diagram. The sentences live in {@link HowItWorks}, which
 * renders a beat list under this strip and a television beside it; the strip
 * stays terse because at eight columns there is no room for a sentence under a
 * dot. On a phone it keeps its dots and bar but drops its labels — the beat
 * list is where the words are at that width anyway.
 *
 * Colour is the same information it is everywhere else on the events pages:
 * `segmentBadge` decides it. Kickoff and judging share the competition cyan,
 * which is why the bar between them is cyan too — they are the two ends of one
 * thing. `tone` swaps the *neutrals* only — the explainer renders on the
 * homepage's light plate and on /events' console dark — never the hues.
 *
 * Reads no clock and no database. It is a fixed diagram of the club's format,
 * so it is safe inside any cache scope and on any page.
 */

/**
 * The club meets on Monday nights and the open build session is the Wednesday
 * in between. This is the one place those facts are written down for the
 * diagram, so a change of night is a one-line change here.
 */
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"] as const;

/** Grid columns are 1-based, like `grid-column-start`. */
const MEETING_COL = 1;
const OPEN_BUILD_COL = 3;
const JUDGING_COL = WEEK.length;

export type Tone = "light" | "dark";

/** The neutral colours per plate; the accent hues never change with tone. */
const TONES = {
  light: {
    meetingDay: "text-black",
    otherDay: "text-mauve-600",
    label: "text-black",
    windowLabel: "text-mauve-700",
    track: "bg-mauve-300",
    openDot: segmentBadge.open.bg,
  },
  dark: {
    meetingDay: "text-white",
    otherDay: "text-mauve-400",
    label: "text-white",
    windowLabel: "text-mauve-300",
    track: "bg-mauve-700",
    openDot: segmentBadge.open.dotDark,
  },
} satisfies Record<Tone, Record<string, string>>;

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
  className,
  children,
}: {
  col: number;
  span?: number;
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`hidden justify-self-center text-xs font-bold whitespace-nowrap md:block ${className}`}
      style={{ gridColumn: `${col} / span ${span}` }}
    >
      {children}
    </span>
  );
}

export default function CompetitionTimeline({
  tone = "light",
}: {
  tone?: Tone;
}) {
  const t = TONES[tone];
  // The bar runs from the centre of the first column to the centre of the
  // last, so it starts under the kickoff dot and ends under the judging dot.
  const half = `${100 / WEEK.length / 2}%`;

  return (
    /* The strip. Four rows of the same eight columns: day names, the labels
       above the track, the track itself, and the labels below it. Labels
       alternate above and below so two moments a day apart do not collide
       at 768px. */
    <div
      className="grid grid-cols-8 gap-y-2"
      role="figure"
      aria-label="One competition across a week, from the Monday workshop that opens it to the following Monday's judging"
    >
      {WEEK.map((day, i) => {
        const isMeeting = i === 0 || i === WEEK.length - 1;
        return (
          <span
            key={i}
            className={`font-display text-center text-xs font-extrabold tracking-widest uppercase ${
              isMeeting ? t.meetingDay : t.otherDay
            }`}
          >
            {day}
          </span>
        );
      })}

      {/* Above the track. */}
      <div className="col-span-8 hidden h-5 grid-cols-8 items-end md:grid">
        <StripLabel col={MEETING_COL} className={t.label}>
          Workshop + kickoff
        </StripLabel>
        <StripLabel col={JUDGING_COL} className={t.label}>
          Judging
        </StripLabel>
      </div>

      {/* The track. */}
      <div className="relative col-span-8 grid h-6 grid-cols-8 items-center">
        <span
          aria-hidden
          className={`absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 ${t.track}`}
        />
        <span
          aria-hidden
          className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border-2 border-black ${segmentBadge.kickoff.bg}`}
          style={{ left: half, right: half }}
        />
        <Dot
          col={MEETING_COL}
          dot={segmentBadge.workshop.bg}
          label="Monday: workshop and kickoff"
        />
        <Dot
          col={OPEN_BUILD_COL}
          dot={t.openDot}
          label="Wednesday: open build"
        />
        <Dot
          col={JUDGING_COL}
          dot={segmentBadge.judging.bg}
          label="Next Monday: judging"
        />
      </div>

      {/* Below the track. */}
      <div className="col-span-8 hidden h-5 grid-cols-8 items-start md:grid">
        <StripLabel col={OPEN_BUILD_COL} className={t.label}>
          Open build
        </StripLabel>
        <StripLabel col={OPEN_BUILD_COL + 1} span={4} className={t.windowLabel}>
          Competition open — teams build asynchronously
        </StripLabel>
      </div>
    </div>
  );
}
