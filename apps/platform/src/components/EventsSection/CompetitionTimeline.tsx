import type { ReactNode } from "react";
import { kindBadge, segmentBadge } from "./meetingView";

/**
 * One week of the club, drawn as an open-ended sprint rather than a loop.
 *
 * A competition is a mirrored GitHub issue, kicked off whenever an officer
 * converts a draft in the Competitions Project and closed whenever they merge
 * a winning pull request, neither pinned to a particular Monday. So the strip
 * draws what is still true on a fixed cadence -- Monday's workshop kicks the
 * week off, Wednesday is an open build session -- and lets the build week
 * itself run OFF the right edge rather than closing at a second dot: there is
 * no night this diagram can promise judging happens on.
 *
 * The bar is striped and the stripes crawl, so a week in progress reads as a
 * progress bar. `motion-safe` gates the crawl.
 *
 * No labels of its own. The day cards in {@link HowItWorks} sit on this strip's
 * columns, above and below it, each pointing at its dot, so a second set
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
export const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Grid columns are 1-based, like `grid-column-start`. */
export const MEETING_COL = 1;
export const OPEN_BUILD_COL = 3;

export type Tone = "light" | "dark";

/** The three things a card can be about, in the strip's vocabulary. */
export type StripDay = "monday" | "wednesday" | "week";

/** Which day-name columns each StripDay lights up (0-based into WEEK). */
const DAY_COLUMNS: Record<StripDay, readonly number[]> = {
  monday: [0],
  wednesday: [2],
  week: [3, 4, 5, 6],
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
 *  centre is from the left edge. */
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
 * A cell on the strip holding one dot, centred on its column. When it is the
 * active one its dot swells and a ring pulses out from behind it, the strip's
 * answer to a card being hovered.
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
 * Where the left tail ends. Normally at the strip's own edge; inside the
 * homepage's cutout it runs on to the SECTION's edge, so the fade finishes
 * exactly where the plate does rather than a column's padding short of it. The
 * section is the site layout's `@container` width less its `mx-4` / `md:mx-6`,
 * and the strip is centred in it, the same arithmetic as `Cutout` in
 * HowItWorks, so the tail's far edge is half the strip's width from centre
 * minus half the section's.
 */
const TAIL_EDGE = {
  contained: { left: "left-0" },
  bleed: {
    left: "left-[calc(50%_-_50cqw_+_1rem)] md:left-[calc(50%_-_50cqw_+_1.5rem)]",
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
  /** Run the left tail out to the section's edge. See {@link TAIL_EDGE}. */
  bleed?: boolean;
}) {
  const t = TONES[tone];
  const edge = bleed ? TAIL_EDGE.bleed : TAIL_EDGE.contained;
  const lit = active === null ? [] : DAY_COLUMNS[active];

  return (
    <div
      className="group/strip grid grid-cols-7 gap-y-2"
      data-hovering={active !== null}
      role="figure"
      aria-label="A week of the club: Monday's workshop kicks off the week's competition, teams build through the week with an open build session on Wednesday, and entries stay open -- there is no fixed judging night -- until an officer merges the winning pull request."
    >
      {WEEK.map((day, i) => {
        const isMeeting = i === 0;
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
      <div className="relative col-span-7 grid h-6 grid-cols-7 items-center">
        {/* Before Monday: grey, fading in from the left edge, ending at
            Monday's emerald dot. Texture only -- nothing before Monday belongs
            to this week's competition. */}
        <span
          aria-hidden
          className={`${BAR_CLS} ${edge.left} ${t.tail} [mask-image:linear-gradient(to_right,transparent,black_70%)]`}
          style={{
            right: `calc(100% - ${HALF})`,
            animationDuration: "1.05s",
          }}
        />
        {/* From Monday's kickoff, running off the right edge rather than
            closing at a second dot: entries stay open until an officer merges
            the winning pull request, which this diagram cannot pin to a
            column because nothing schedules it. When the build-week card is
            hovered it shifts lighter and the stripes hurry. Its inline
            duration retimes the already-running animation when the active
            card changes. */}
        <span
          aria-hidden
          data-active={active === "week"}
          className={`${BAR_CLS} bg-yellow-600 transition-colors duration-300 data-[active=true]:bg-yellow-500 data-[active=true]:[--slants-alpha:0.36]`}
          style={{
            left: HALF,
            right: `calc(0% - 6rem)`,
            animationDuration: active === "week" ? "0.22s" : "0.62s",
            maskImage: "linear-gradient(to right, black 80%, transparent)",
          }}
        />

        <Cell col={MEETING_COL} active={active === "monday"} halo={t.halo}>
          <Dot
            dot={segmentBadge.workshop.dot}
            ring={t.dotRing}
            label="Monday: workshop, then the competition kicks off"
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
      </div>
    </div>
  );
}
