import type { CSSProperties, ReactNode } from "react";
import { segmentBadge } from "./meetingView";

/**
 * One week of the club, drawn as the loop it is.
 *
 * The model this has to keep straight (see `docs/platform/guides/meetings-and-
 * teams`): a competition is a week-long window between two Mondays. The first
 * Monday's workshop kicks it off, the next Monday judges it — and the moment
 * judging is done, that same night's workshop kicks off the next one. So the
 * strip is not one bar with two ends; it is the middle of a chain. Last
 * week's bar arrives from the left and ends in rose at the first Monday, this
 * week's bar runs cyan from there to the next Monday, and the one after that
 * leaves to the right, drawn hollow, because some weeks there is no
 * competition and only a workshop.
 *
 * The bars are striped and the stripes crawl: a diagram of something in
 * progress, drawn as a progress bar. `motion-safe` gates the crawl.
 *
 * This is only the diagram. The sentences live in {@link HowItWorks}, whose
 * day cards sit under this strip on the *same eight columns*, so each card is
 * under the day it describes. On a phone the strip keeps its dots and bars
 * and drops its labels — the cards are where the words are at that width.
 *
 * Colour is the same information it is everywhere else on the events pages:
 * `segmentBadge` decides it. `tone` swaps the *neutrals* only.
 *
 * Reads no clock and no database — a fixed diagram of the format, safe inside
 * any cache scope and on any page.
 */

/**
 * The club meets on Monday nights and the open build session is the Wednesday
 * in between. This is the one place those facts are written down for the
 * diagram; the cards in HowItWorks address the same columns by these names.
 */
export const WEEK = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
  "Mon",
] as const;

/** Grid columns are 1-based, like `grid-column-start`. */
export const MEETING_COL = 1;
export const OPEN_BUILD_COL = 3;
export const JUDGING_COL = WEEK.length;

export type Tone = "light" | "dark";

/** The neutral colours per plate; the accent hues never change with tone. */
const TONES = {
  light: {
    meetingDay: "text-black",
    otherDay: "text-mauve-600",
    label: "text-black",
    windowLabel: "text-mauve-700",
    dotRing: "border-black",
    openDot: segmentBadge.open.bg,
    ghostRing: "border-black/40",
  },
  dark: {
    meetingDay: "text-white",
    otherDay: "text-mauve-400",
    label: "text-white",
    windowLabel: "text-mauve-300",
    dotRing: "border-mauve-950",
    openDot: segmentBadge.open.dotDark,
    ghostRing: "border-white/40",
  },
} satisfies Record<Tone, Record<string, string>>;

/** Fraction of the strip's width that half a column takes: where col 1's
 *  centre is from the left edge, and col 8's from the right. */
const HALF = `${100 / WEEK.length / 2}%`;

function Dot({
  dot,
  ring,
  label,
  ghost = false,
}: {
  dot: string;
  ring: string;
  label: string;
  /** Hollow: the kickoff that may or may not happen next Monday. */
  ghost?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`size-4 rounded-full border-2 ${ghost ? "border-dashed" : ""} ${ring} ${ghost ? "" : dot}`}
    />
  );
}

/** A cell on the strip holding one or two dots, centred on its column. */
function Cell({ col, children }: { col: number; children: ReactNode }) {
  return (
    <span
      className="relative z-10 flex items-center justify-center gap-1"
      style={{ gridColumnStart: col }}
    >
      {children}
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
  align = "center",
  className,
  children,
}: {
  col: number;
  span?: number;
  /** The two Monday labels hug the strip's edges rather than centring on a
   *  column they are wider than, which would push them out of the card. */
  align?: "start" | "center" | "end";
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`hidden text-xs font-bold whitespace-nowrap md:block ${ALIGN[align]} ${className}`}
      style={{ gridColumn: `${col} / span ${span}` }}
    >
      {children}
    </span>
  );
}

const ALIGN = {
  start: "justify-self-start",
  center: "justify-self-center",
  end: "justify-self-end",
} as const;

const BAR_CLS =
  "slants motion-safe:animate-slants absolute top-1/2 h-3 -translate-y-1/2 rounded-full";

export default function CompetitionTimeline({
  tone = "light",
}: {
  tone?: Tone;
}) {
  const t = TONES[tone];

  return (
    <div
      className="grid grid-cols-8 gap-y-2"
      role="figure"
      aria-label="A week of the club: last week's competition is judged on Monday and the next one kicks off the same night, teams build through the week with an open build on Wednesday, and the following Monday judges it and kicks off the next — if there is one."
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
        <StripLabel
          col={MEETING_COL}
          span={3}
          align="start"
          className={t.label}
        >
          Judging, then kickoff
        </StripLabel>
        <StripLabel
          col={JUDGING_COL - 2}
          span={3}
          align="end"
          className={t.label}
        >
          Judging, then the next one
        </StripLabel>
      </div>

      {/* The track. */}
      <div className="relative col-span-8 grid h-6 grid-cols-8 items-center">
        {/* Last week's competition, arriving: it fades in from the left edge
            and ends at Monday's rose dot. */}
        <span
          aria-hidden
          className={`${BAR_CLS} left-0 bg-rose-500 [mask-image:linear-gradient(to_right,transparent,black_70%)]`}
          style={{ right: `calc(100% - ${HALF})` } satisfies CSSProperties}
        />
        {/* This week's: Monday's cyan dot to next Monday's rose one. */}
        <span
          aria-hidden
          className={`${BAR_CLS} bg-cyan-500`}
          style={{ left: HALF, right: HALF }}
        />
        {/* Next week's, if there is one: hollow and dashed, fading out. */}
        <span
          aria-hidden
          className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full border-2 border-dashed border-cyan-500 [mask-image:linear-gradient(to_right,black_30%,transparent)]`}
          style={{ left: `calc(100% - ${HALF})`, right: 0 }}
        />

        <Cell col={MEETING_COL}>
          <Dot
            dot={segmentBadge.judging.dot}
            ring={t.dotRing}
            label="Monday: last week's competition is judged"
          />
          <Dot
            dot={segmentBadge.kickoff.dot}
            ring={t.dotRing}
            label="Monday: the workshop kicks off this week's"
          />
        </Cell>
        <Cell col={OPEN_BUILD_COL}>
          <Dot dot={t.openDot} ring={t.dotRing} label="Wednesday: open build" />
        </Cell>
        <Cell col={JUDGING_COL}>
          <Dot
            dot={segmentBadge.judging.dot}
            ring={t.dotRing}
            label="Next Monday: this week's competition is judged"
          />
          <Dot
            dot={segmentBadge.kickoff.dot}
            ring={t.ghostRing}
            ghost
            label="Next Monday: the next one kicks off, some weeks"
          />
        </Cell>
      </div>

      {/* Below the track. */}
      <div className="col-span-8 hidden h-5 grid-cols-8 items-start md:grid">
        <StripLabel col={OPEN_BUILD_COL} className={t.label}>
          Open build
        </StripLabel>
        <StripLabel col={OPEN_BUILD_COL + 1} span={4} className={t.windowLabel}>
          Build all week
        </StripLabel>
      </div>
    </div>
  );
}
