import type { ReactNode } from "react";
import { kindBadge, segmentBadge } from "./meetingView";

/**
 * One week of the club, drawn as the loop it is.
 *
 * The model (see `docs/platform/guides/meetings-and-teams`): a competition is a
 * week-long window between two Mondays. The first Monday's workshop kicks it
 * off, the next Monday judges it, and the moment judging is done that same
 * night's workshop kicks off the next one. So the strip is the middle of a
 * chain, not one bar with two ends: last week's bar arrives from the left in
 * grey and ends in rose at the first Monday, this week's runs muted yellow from
 * there
 * to the next Monday, where an emerald kickoff dot starts the one after, whose
 * bar leaves to the right in grey. Grey is "not the week in view"; the dots on
 * the Monday in view are always coloured, because that Monday's meeting always
 * happens.
 *
 * The bars are striped and the stripes crawl, so a week in progress reads as a
 * progress bar. `motion-safe` gates the crawl.
 *
 * No labels of its own. The day cards in {@link HowItWorks} sit on this strip's
 * eight columns, above and below it, each pointing at its dot, so a second set
 * here would say everything twice. The strip answers the cards instead:
 * `active` names the card under the pointer, and the matching dots swell with a
 * ring pulsing out behind them, the bar brightens and hurries when the build
 * week is the one, and the other day names step back.
 *
 * `segmentBadge` decides colour, the same as everywhere else on the events
 * pages. `tone` swaps the *neutrals* only.
 *
 * Reads no clock and no database: a fixed diagram of the format, safe inside
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

/** The four things a card can be about, in the strip's vocabulary. */
export type StripDay = "monday" | "wednesday" | "week" | "nextMonday";

/** Which day-name columns each StripDay lights up (0-based into WEEK). */
const DAY_COLUMNS: Record<StripDay, readonly number[]> = {
  monday: [0],
  wednesday: [2],
  week: [3, 4, 5, 6],
  nextMonday: [7],
};

/** The neutral colours per plate; the accent hues never change with tone. */
const TONES = {
  light: {
    meetingDay: "text-black",
    otherDay: "text-mauve-600",
    dotRing: "border-black",
    tail: "bg-mauve-400",
    halo: "bg-black/25",
  },
  dark: {
    meetingDay: "text-white",
    otherDay: "text-mauve-400",
    dotRing: "border-mauve-950",
    tail: "bg-mauve-600",
    halo: "bg-white/30",
  },
} satisfies Record<Tone, Record<string, string>>;

/** Fraction of the strip's width that half a column takes: where col 1's
 *  centre is from the left edge, and col 8's from the right. */
const HALF = `${100 / WEEK.length / 2}%`;

function Dot({
  dot,
  ring,
  label,
}: {
  dot: string;
  ring: string;
  label: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`size-4 rounded-full border-2 transition-transform duration-300 group-data-[active=true]/cell:scale-125 ${ring} ${dot}`}
    />
  );
}

/**
 * A cell on the strip holding one or two dots, centred on its column. When it
 * is the active one its dots swell and a ring pulses out from behind them, the
 * strip's answer to a card being hovered.
 */
function Cell({
  col,
  active,
  halo,
  children,
}: {
  col: number;
  active: boolean;
  halo: string;
  children: ReactNode;
}) {
  return (
    <span
      data-active={active}
      className="group/cell relative z-10 flex items-center justify-center gap-1"
      style={{ gridColumnStart: col }}
    >
      <span
        aria-hidden
        className={`absolute top-1/2 left-1/2 size-8 -translate-1/2 rounded-full opacity-0 group-data-[active=true]/cell:opacity-100 motion-safe:group-data-[active=true]/cell:animate-ping ${halo}`}
      />
      {children}
    </span>
  );
}

const BAR_CLS =
  "slants motion-safe:animate-slants absolute top-1/2 h-3 -translate-y-1/2 rounded-full";

const DAY_CLS =
  "font-display text-center text-xs font-extrabold tracking-widest uppercase transition-[opacity,scale] duration-300 group-data-[hovering=true]/strip:opacity-40 group-data-[hovering=true]/strip:data-[active=true]:scale-110 group-data-[hovering=true]/strip:data-[active=true]:opacity-100";

/**
 * Where the two grey tails end. Normally at the strip's own edges; inside the
 * homepage's cutout they run on to the SECTION's edges, so the fade finishes
 * exactly where the plate does rather than a column's padding short of it. The
 * section is the site layout's `@container` width less its `mx-4` / `md:mx-6`,
 * and the strip is centred in it, the same arithmetic as `Cutout` in
 * HowItWorks, so each tail's far edge is half the strip's width from centre
 * minus half the section's.
 */
const TAIL_EDGE = {
  contained: { left: "left-0", right: "right-0" },
  bleed: {
    left: "left-[calc(50%_-_50cqw_+_1rem)] md:left-[calc(50%_-_50cqw_+_1.5rem)]",
    right:
      "right-[calc(50%_-_50cqw_+_1rem)] md:right-[calc(50%_-_50cqw_+_1.5rem)]",
  },
} as const;

export default function CompetitionTimeline({
  tone = "light",
  active = null,
  bleed = false,
}: {
  tone?: Tone;
  /** The card under the pointer, if any; the strip lights up to match. */
  active?: StripDay | null;
  /** Run the tails out to the section's edges. See {@link TAIL_EDGE}. */
  bleed?: boolean;
}) {
  const t = TONES[tone];
  const edge = bleed ? TAIL_EDGE.bleed : TAIL_EDGE.contained;
  const lit = active === null ? [] : DAY_COLUMNS[active];

  return (
    <div
      className="group/strip grid grid-cols-8 gap-y-2"
      data-hovering={active !== null}
      role="figure"
      aria-label="A week of the club: last week's competition is judged on Monday and the next one kicks off the same night, teams build through the week with an open build on Wednesday, and the following Monday judges it and kicks off the next — if there is one."
    >
      {WEEK.map((day, i) => {
        const isMeeting = i === 0 || i === WEEK.length - 1;
        return (
          <span
            key={i}
            data-active={lit.includes(i)}
            className={`${DAY_CLS} ${isMeeting ? t.meetingDay : t.otherDay}`}
          >
            {day}
          </span>
        );
      })}

      {/* The track. */}
      <div className="relative col-span-8 grid h-6 grid-cols-8 items-center">
        {/* Last week's competition, arriving: grey, fading in from the left
            edge, ending at Monday's rose dot. */}
        <span
          aria-hidden
          className={`${BAR_CLS} ${edge.left} ${t.tail} [mask-image:linear-gradient(to_right,transparent,black_70%)]`}
          style={{
            right: `calc(100% - ${HALF})`,
            animationDuration: "1.05s",
          }}
        />
        {/* This week's: Monday's emerald dot to next Monday's rose one. When
            the build-week card is hovered it shifts lighter and the stripes hurry.
            Its inline duration retimes the already-running animation when the
            active card changes. */}
        <span
          aria-hidden
          data-active={active === "week"}
          className={`${BAR_CLS} bg-yellow-600 transition-colors duration-300 data-[active=true]:bg-yellow-500 data-[active=true]:[--slants-alpha:0.36]`}
          style={{
            left: HALF,
            right: HALF,
            animationDuration: active === "week" ? "0.22s" : "0.62s",
          }}
        />
        {/* Next week's, if there is one: grey, fading out to the right. */}
        <span
          aria-hidden
          className={`${BAR_CLS} ${edge.right} ${t.tail} [mask-image:linear-gradient(to_right,black_30%,transparent)]`}
          style={{
            left: `calc(100% - ${HALF})`,
            animationDuration: "1.05s",
          }}
        />

        <Cell col={MEETING_COL} active={active === "monday"} halo={t.halo}>
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
        <Cell
          col={OPEN_BUILD_COL}
          active={active === "wednesday"}
          halo={t.halo}
        >
          <Dot
            dot={kindBadge["Build Session"]!.dot}
            ring={t.dotRing}
            label="Wednesday: build session"
          />
        </Cell>
        <Cell col={JUDGING_COL} active={active === "nextMonday"} halo={t.halo}>
          <Dot
            dot={segmentBadge.judging.dot}
            ring={t.dotRing}
            label="Next Monday: this week's competition is judged"
          />
          <Dot
            dot={segmentBadge.kickoff.dot}
            ring={t.dotRing}
            label="Next Monday: the next one kicks off"
          />
        </Cell>
      </div>
    </div>
  );
}
