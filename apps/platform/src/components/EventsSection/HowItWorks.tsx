"use client";

import { useState } from "react";
import type { StaticImageData } from "next/image";
import type { ReactNode } from "react";
import type { MeetingSegment } from "~/lib/meetingSegments";
import CompetitionTimeline, {
  type StripDay,
  type Tone,
} from "./CompetitionTimeline";
import CrtTv from "./CrtTv";
import { CHIP_CLS, CHIP_DARK_CLS, segmentBadge } from "./meetingView";
import bruceAlmighty from "~/assets/bruce-almighty.gif";
import charlieConspiracy from "~/assets/charlie-conspiracy.gif";
import informationGif from "~/assets/information.gif";
import muybridgeHorse from "~/assets/muybridge-horse.gif";

/**
 * The club's format, said once and drawn twice.
 *
 * The copy has to keep the model straight (see `docs/platform/guides/meetings-
 * and-teams`): a competition is a week bracketed by two Mondays, and every
 * Monday does both jobs — judges last week's, kicks off this week's. The
 * timeline strip draws that loop; the day cards around it carry the
 * sentences, and they sit on the strip's own eight columns, above and below
 * it, so each card is beside the day it is about with a pointer at its dot.
 *
 * The television is the other drawing. It sits beside the heading, and
 * hovering a card changes the channel — the GIF on screen is that card's.
 * Static plays whenever no card is live. The set is a hand-drawn SVG (see
 * {@link CrtTv}) and the static is drawn too, a frame at a time on the client
 * (see {@link useTvStatic}) rather than the 1.8 MB GIF it used to be. The
 * clips are still GIFs, running from 200 KB to 2.4 MB, and next/image passes
 * animated files through unoptimized, so each mounts only while its card is
 * hovered rather than putting megabytes on a page most visitors never hover
 * at all. The build-week clip is Muybridge's 1878 race horse, public domain
 * via Wikimedia Commons — the original "something running".
 *
 * Renders on both pages, in both dialects. The homepage uses it on its light
 * marketing plate; /events renders it `tone="dark"` inside a console card.
 * `tone` swaps neutrals only — the segment hues are information and never
 * change.
 *
 * `id` is a prop rather than a constant so the two pages can pick their own
 * anchor. Both jump to it from links, so the section carries a scroll margin
 * that clears the sticky TopNav.
 */

interface Beat {
  /** Which day, as the card prints it. */
  day: string;
  title: string;
  body: ReactNode;
  /** The chips under the title. Empty for the async window, which is not a
   *  meeting and so has no segment. */
  segments: MeetingSegment[];
  /**
   * What the television shows while this card is hovered, or null to let the
   * static show through. Mounted only while hovered — see the note above.
   */
  gif: StaticImageData | null;
  /** Which part of the strip this card is about — what lights up. */
  strip: StripDay;
  /**
   * Where the card sits on the strip's eight columns from `lg`: above or
   * below the track, starting on which column, and which of its two columns
   * its caret points from — or none, for the async window, which has no dot.
   */
  place: {
    side: "above" | "below";
    col: 1 | 3 | 5 | 7;
    caret: "start" | "end" | null;
  };
}

const BEATS: Beat[] = [
  {
    day: "Monday",
    title: "Workshop, Then Kickoff",
    body: (
      <>
        One workshop per project, all at once — each self-contained, and none
        assuming you were here last week. Most end with &ldquo;now go build
        this&rdquo; — that&rsquo;s the kickoff.
      </>
    ),
    segments: ["workshop", "kickoff"],
    gif: informationGif,
    strip: "monday",
    place: { side: "above", col: 1, caret: "start" },
  },
  {
    day: "Wednesday",
    // Named, because it is a night the club runs rather than a gap in the
    // week. "Open Build" was the old label for the structural fallback, which
    // is now called Unscheduled and means something else entirely.
    title: "Build Session",
    body: (
      <>
        The room&rsquo;s open and officers are around. Build with your team,
        get your laptop set up, or just come work.
      </>
    ),
    // No segment: a build session is AUTHORED on the meeting rather than
    // derived from its structure, so there is no entry in `segmentBadge` to
    // point at — its chip comes from `kindBadge` instead. The card carries the
    // name on its own. It used to claim `open`, which is now the label for a
    // night nobody scheduled at all.
    segments: [],
    gif: bruceAlmighty,
    strip: "wednesday",
    place: { side: "below", col: 3, caret: "start" },
  },
  {
    day: "All week",
    title: "Build It",
    body: (
      <>
        Up to four per team, wherever and whenever. Open a pull request before
        Monday.
      </>
    ),
    segments: [],
    gif: muybridgeHorse,
    strip: "week",
    place: { side: "above", col: 5, caret: null },
  },
  {
    day: "Next Monday",
    title: "Judging, Then It All Starts Again",
    body: (
      <>
        Teams demo, the winning pull request merges, the rest close. Showing up
        earns the star either way. Then a new workshop kicks off the next one —
        some weeks it&rsquo;s just the workshop.
      </>
    ),
    segments: ["judging"],
    gif: charlieConspiracy,
    strip: "nextMonday",
    place: { side: "below", col: 7, caret: "end" },
  },
];

/**
 * The two dialects' neutrals. Class strings are CONSTANT per tone — which
 * card is live is a data attribute, never a class change: `[data-animate]`
 * starts at `opacity: 0` in globals.css and only becomes visible when
 * AnimationInit adds `.is-visible`, a class added outside React to an element
 * React believes it owns. Deriving className from hover state makes React
 * rewrite the class attribute and delete `is-visible`, and the observer has
 * already unobserved the node, so nothing ever puts it back — hovering a card
 * deletes the card.
 *
 * The caret is part of the card: a rotated square in the card's own fill,
 * with two of its borders drawn and the corner between them rounded off,
 * laid over the card's edge so the border appears to run out around the
 * point and back. That only works with an OPAQUE fill — a translucent one
 * would show the edge through the square — which is why the dark card is
 * solid `mauve-900` rather than the console's usual `white/5`. It sits at
 * 25% or 75% of the card's width, the centres of its two strip columns, and
 * only from `lg`, where the cards are on the columns at all. Cards above the
 * track point down; cards below point up.
 *
 * The light card's shadow is a `drop-shadow`, not a `box-shadow`, on
 * purpose: a filter follows the painted shape, caret included, where a box
 * shadow would stop at the rectangle and leave the point casting nothing.
 *
 * While any card is hovered the live one leans in toward the strip and the
 * others step back from it — a little smaller, a little dimmer — so it reads
 * as the channel that is on. See `SIDE` for the direction.
 */
const CARET_BASE =
  "lg:before:absolute lg:before:size-3.5 lg:before:-translate-x-1/2 lg:before:rotate-45 lg:before:transition-colors";

const HOVER =
  "transition-[opacity,scale,translate,border-color] duration-200 group-data-[hovering=true]/beats:data-[active=false]:scale-[0.97] group-data-[hovering=true]/beats:data-[active=false]:opacity-60";

const TONES = {
  light: {
    heading: "text-black",
    intro: "text-mauve-700",
    tvShadow: "drop-shadow-block-md shadow-black",
    beat: `drop-shadow-block-md relative flex flex-col gap-2 rounded-sm border-2 border-black bg-white p-4 ${CARET_BASE} lg:before:border-black lg:before:bg-white ${HOVER}`,
    beatDay:
      "font-display text-xs font-extrabold tracking-widest text-mauve-600 uppercase",
    beatTitle: "font-display text-lg leading-tight font-extrabold text-black",
    beatBody: "text-sm/relaxed text-mauve-700",
    // Two borders, 2px, at the top-left of the rotated square (pointing up)
    // or the bottom-right (pointing down), with that corner rounded.
    caretUp:
      "lg:before:-top-2 lg:before:rounded-tl-[2px] lg:before:border-t-2 lg:before:border-l-2",
    caretDown:
      "lg:before:-bottom-2 lg:before:rounded-br-[2px] lg:before:border-b-2 lg:before:border-r-2",
  },
  dark: {
    heading: "text-white",
    intro: "text-mauve-300",
    tvShadow: "drop-shadow-block-md shadow-black/60",
    beat: `relative flex flex-col gap-2 rounded-lg border border-mauve-700 bg-mauve-900 p-4 data-[active=true]:border-white/60 lg:data-[active=true]:before:border-white/60 ${CARET_BASE} lg:before:border-mauve-700 lg:before:bg-mauve-900 ${HOVER}`,
    beatDay:
      "font-display text-xs font-extrabold tracking-widest text-mauve-400 uppercase",
    beatTitle: "font-display text-lg leading-tight font-extrabold text-white",
    beatBody: "text-sm/relaxed text-mauve-300",
    caretUp:
      "lg:before:-top-[calc(0.4375rem+1px)] lg:before:rounded-tl-[2px] lg:before:border-t lg:before:border-l",
    caretDown:
      "lg:before:-bottom-[calc(0.4375rem+1px)] lg:before:rounded-br-[2px] lg:before:border-b lg:before:border-r",
  },
} satisfies Record<Tone, Record<string, string>>;

/** Static class lookups, so Tailwind sees every utility it has to emit. */
const CARET_X = {
  start: "lg:before:left-1/4",
  end: "lg:before:left-3/4",
  null: "lg:before:hidden",
} as const;

const COL_START = {
  1: "lg:col-start-1",
  3: "lg:col-start-3",
  5: "lg:col-start-5",
  7: "lg:col-start-7",
} as const;

/**
 * Placement, plus the direction of the hover: the live card moves TOWARD the
 * strip and the others shrink AWAY from it, which is a matter of where each
 * card's transform origin sits. A card above the strip scales about its top
 * edge, so getting smaller pulls its bottom — the strip-facing edge — away;
 * a card below scales about its bottom. Below `lg` every card is under the
 * strip, so "toward" is up for all of them.
 */
const SIDE = {
  above:
    "lg:row-start-1 lg:self-end data-[active=true]:-translate-y-1 lg:origin-top lg:data-[active=true]:translate-y-1 lg:group-data-[hovering=true]/beats:data-[active=false]:-translate-y-0.5",
  below:
    "lg:row-start-3 lg:self-start data-[active=true]:-translate-y-1 lg:origin-bottom lg:group-data-[hovering=true]/beats:data-[active=false]:translate-y-0.5",
} as const;

export default function HowItWorks({
  id = "how-it-works",
  tone = "light",
  cutout = false,
}: {
  id?: string;
  tone?: Tone;
  /**
   * Cut the strip's band out of the plate behind it, edge to edge, so the
   * timeline runs on the page's own black through a slot in the section.
   * Homepage only — it assumes it is inside a `SectionBackground` plate
   * that the `@container` site layout sizes, and draws the plate's rounded
   * corners at the slot's four corners itself.
   */
  cutout?: boolean;
}) {
  // `null` is the resting state, not "beat 0": static plays underneath until a
  // pointer lands on a card.
  const [hovered, setHovered] = useState<number | null>(null);
  // noUncheckedIndexedAccess is on, so this is Beat | undefined either way —
  // which is what the television wants anyway, since undefined IS static.
  const active = hovered === null ? undefined : BEATS[hovered];
  const t = TONES[tone];

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-28 flex-col gap-8"
      // The console page reveals nothing on scroll — that is the marketing
      // pages' idiom — so the attribute only exists on the light plate.
      data-animate={tone === "light" ? "fade-up" : undefined}
    >
      {/* The heading spans the whole section rather than sitting in the text
          column, so it titles the television as much as the words — the set is
          part of what this section is, not an illustration hung beside a
          heading that belongs to something else. Left-justified, so it still
          starts on the same line the paragraphs under it do. */}
      <div className="flex flex-col gap-4">
        <h2
          id={`${id}-heading`}
          className={`font-display text-2xl font-extrabold md:text-3xl ${t.heading}`}
        >
          A Week in DevDogs
        </h2>

        {/* Flex rather than the eight-column grid this used to be, and that is
            what puts the set where it belongs. On a grid the set was centred in
            ITS OWN cell, so the empty run between the prose's right edge — the
            paragraphs stop at `max-w-prose`, well short of the column — and the
            start of the set's column was dead space the centring never saw.
            `flex-1` gives the set exactly the width left over after the prose,
            and centring inside that is centring in the gap a reader sees. */}
        {/* `lg:gap-0` so the leftover space really does start at the prose's
            right edge. A gap here would push the set's box inward and centre
            it in something narrower than the gap a reader sees, which is the
            error this layout was changed to fix — just smaller. The set is
            centred in that space, so it keeps clear of the text on its own. */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-0">
          <div className="flex max-w-prose flex-col gap-4 text-left">
            <p className={`text-base/relaxed text-balance ${t.intro}`}>
              One feature, one week, every team at once. Monday&rsquo;s workshop
              teaches the tools and hands out the build; teams ship a pull
              request by the next Monday; we demo, one merges, and that
              night&rsquo;s workshop kicks off the next one.
            </p>
            <p className={`text-base/relaxed text-balance ${t.intro}`}>
              That&rsquo;s a sprint — and it&rsquo;s how every project on the
              platform grows, one merged feature at a time. Some weeks are just
              the workshop. Those count too.
            </p>
          </div>
          {/* The set's cell stretches to the row, and the set is absolutely
              positioned inside it from `lg`, so its own height contributes
              nothing: the row is as tall as the WORDS and the set fits that,
              never taller. In flow its natural height would set the row, and
              the television would decide how tall the prose beside it looked.
              Now that the heading has moved out of the row, "as tall as the
              words" means the body text alone, which is the height wanted. */}
          <div className="mx-auto w-full max-w-sm lg:relative lg:mx-0 lg:max-w-none lg:flex-1">
            <div className="lg:absolute lg:inset-0 lg:flex lg:justify-center">
              <CrtTv
                className={`lg:h-full lg:w-auto lg:max-w-full ${t.tvShadow}`}
                showing={
                  active?.gif ? { key: active.title, image: active.gif } : null
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* One grid, three rows from `lg`: cards above, the strip, cards
          below — on the strip's own eight columns, so each card starts under
          (or over) the day it is about. The `<ol>` keeps its chronological
          DOM order and dissolves into the grid with `contents`; below `lg`
          it is a plain stack after the strip. */}
      {/* `gap-y-5`: the light cards cast a block drop-shadow, and anything
          tighter let it bleed into the strip's black cutout. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-8 lg:gap-x-4 lg:gap-y-5">
        <div className="relative py-5 lg:col-span-8 lg:row-start-2">
          {cutout && <Cutout />}
          {/* Inside a cutout the strip sits on the page's black, whatever
              plate the rest of the section is on — so it takes the dark
              neutrals there, or the day names would be black on black. */}
          <CompetitionTimeline
            tone={cutout ? "dark" : tone}
            bleed={cutout}
            active={active?.strip ?? null}
          />
        </div>

        <ol
          className="group/beats flex flex-col gap-4 lg:contents"
          data-hovering={hovered !== null}
        >
          {BEATS.map((beat, i) => (
            <li
              key={beat.title}
              data-active={hovered === i}
              className={`${t.beat} ${beat.place.side === "above" ? t.caretDown : t.caretUp} ${CARET_X[beat.place.caret ?? "null"]} ${COL_START[beat.place.col]} ${SIDE[beat.place.side]} lg:col-span-2`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <p className={t.beatDay}>{beat.day}</p>
              <h3 className={t.beatTitle}>{beat.title}</h3>
              {beat.segments.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {beat.segments.map((segment) => {
                    const badge = segmentBadge[segment];
                    return (
                      <span
                        key={segment}
                        className={
                          tone === "dark"
                            ? `${badge.chipDark} ${CHIP_DARK_CLS}`
                            : `${badge.bg} ${badge.text} ${CHIP_CLS}`
                        }
                      >
                        {badge.label}
                      </span>
                    );
                  })}
                </div>
              )}
              <p className={t.beatBody}>{beat.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The slot in the plate that the strip runs through.
 *
 * A black band as wide as the section — the site layout is the `@container`,
 * and a section is that width less its `mx-4` / `md:mx-6`, the same sum
 * `--section-skew-slope` in globals.css is built from — centred on this
 * wrapper, which is centred in the section because the content column is.
 * It paints at `-z-10`, under the strip but inside the content's stacking
 * context, which is above the plate.
 *
 * The four ears are what make it a cutout rather than a stripe: a square at
 * each outer corner, black except for a quarter-circle of transparency
 * where the plate above or below rounds off into the slot. Their radius is
 * the section's own `rounded-xl`, so the slot's corners match the plate's.
 */
function Cutout() {
  return (
    <div
      aria-hidden
      className="absolute inset-y-0 left-1/2 -z-10 w-[calc(100cqw-2rem)] -translate-x-1/2 bg-black md:w-[calc(100cqw-3rem)]"
    >
      <span className="absolute bottom-full left-0 size-3 bg-[radial-gradient(circle_at_top_right,transparent_11.5px,black_12px)]" />
      <span className="absolute right-0 bottom-full size-3 bg-[radial-gradient(circle_at_top_left,transparent_11.5px,black_12px)]" />
      <span className="absolute top-full left-0 size-3 bg-[radial-gradient(circle_at_bottom_right,transparent_11.5px,black_12px)]" />
      <span className="absolute top-full right-0 size-3 bg-[radial-gradient(circle_at_bottom_left,transparent_11.5px,black_12px)]" />
    </div>
  );
}
