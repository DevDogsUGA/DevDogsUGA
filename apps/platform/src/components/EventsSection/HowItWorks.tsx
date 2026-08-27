"use client";

import { useState } from "react";
import type { StaticImageData } from "next/image";
import type { ReactNode } from "react";
import type { MeetingSegment } from "~/lib/meetingSegments";
import CompetitionTimeline, { type Tone } from "./CompetitionTimeline";
import CrtTv from "./CrtTv";
import { CHIP_CLS, CHIP_DARK_CLS, segmentBadge } from "./meetingView";
import bruceAlmighty from "~/assets/bruce-almighty.gif";
import charlieConspiracy from "~/assets/charlie-conspiracy.gif";
import informationGif from "~/assets/information.gif";
import staticGif from "~/assets/static.gif";

/**
 * The club's format, said once and drawn twice.
 *
 * The copy has to keep the model straight (see `docs/platform/guides/meetings-
 * and-teams`): a competition is a week bracketed by two Mondays, and every
 * Monday does both jobs — judges last week's, kicks off this week's. The
 * timeline strip draws that loop; the day cards under it carry the sentences,
 * and they sit on the strip's own eight columns so each card is under the day
 * it is about, with a little pointer up at its dot.
 *
 * The television is the other drawing. It sits beside the heading, and
 * hovering a card changes the channel — the GIF on screen is that card's.
 * Static plays whenever no card is live, including on the open build night,
 * which has no agenda and so, fittingly, no programme. The set is a
 * hand-drawn SVG (see {@link CrtTv}); the GIFs run from 200 KB to 2.4 MB and
 * next/image passes animated files through unoptimized, so each mounts only
 * while its card is hovered rather than putting megabytes on a page most
 * visitors never hover at all.
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
  /** Where the pointer up at the strip goes: over the card's first column,
   *  its second, or nowhere (the async window has no dot to point at). */
  caret: "start" | "end" | null;
}

const BEATS: Beat[] = [
  {
    day: "Monday",
    title: "Workshop, then kickoff",
    body: (
      <>
        One workshop per project, all at once. Most end with &ldquo;now go build
        this&rdquo; — that&rsquo;s the kickoff.
      </>
    ),
    segments: ["workshop", "kickoff"],
    gif: informationGif,
    caret: "start",
  },
  {
    day: "Wednesday",
    title: "Open build",
    body: (
      <>
        No agenda. The room&rsquo;s open and officers are around. Build with
        your team, or just come work.
      </>
    ),
    segments: ["open"],
    // No programme for a night with no agenda — the static IS the channel.
    gif: null,
    caret: "start",
  },
  {
    day: "All week",
    title: "Build it",
    body: (
      <>
        Up to four per team, wherever and whenever. Open a pull request before
        Monday.
      </>
    ),
    segments: [],
    gif: bruceAlmighty,
    caret: null,
  },
  {
    day: "Next Monday",
    title: "Judging, then it all starts again",
    body: (
      <>
        Teams demo, the winning pull request merges, the rest close. Showing up
        earns the star either way. Then a new workshop kicks off the next one —
        some weeks it&rsquo;s just the workshop.
      </>
    ),
    segments: ["judging"],
    gif: charlieConspiracy,
    caret: "end",
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
 * The caret is a CSS triangle in the card's border colour, drawn by `before:`
 * at 25% or 75% of the card's width — the centres of its two columns — and
 * only from `lg`, where the cards actually sit on the strip's columns.
 */
const CARET_CLS =
  "lg:before:absolute lg:before:-top-2 lg:before:size-0 lg:before:-translate-x-1/2 lg:before:border-x-8 lg:before:border-b-8 lg:before:border-x-transparent";

const TONES = {
  light: {
    heading: "text-black",
    intro: "text-mauve-700",
    beat: `relative flex flex-col gap-2 border-t-2 border-black pt-3 transition-colors ${CARET_CLS} lg:before:border-b-black`,
    beatDay:
      "font-display text-xs font-extrabold tracking-widest text-mauve-600 uppercase",
    beatTitle: "font-display text-lg leading-tight font-extrabold text-black",
    beatBody: "text-sm/relaxed text-mauve-700",
  },
  dark: {
    heading: "text-white",
    intro: "text-mauve-300",
    beat: `relative flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4 transition-colors data-[active=true]:border-white/40 ${CARET_CLS} lg:before:border-b-white/20`,
    beatDay:
      "font-display text-xs font-extrabold tracking-widest text-mauve-400 uppercase",
    beatTitle: "font-display text-lg leading-tight font-extrabold text-white",
    beatBody: "text-sm/relaxed text-mauve-300",
  },
} satisfies Record<Tone, Record<string, string>>;

const CARET_POS = {
  start: "lg:before:left-1/4",
  end: "lg:before:left-3/4",
  null: "lg:before:hidden",
} as const;

export default function HowItWorks({
  id = "how-it-works",
  tone = "light",
}: {
  id?: string;
  tone?: Tone;
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
      {/* Heading and television in one row, the set level with the words
          rather than floating beside a list twice its height. */}
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-8">
        <div className="max-w-prose text-left lg:col-span-5">
          <h2
            id={`${id}-heading`}
            className={`font-display mb-4 text-3xl font-extrabold md:text-4xl ${t.heading}`}
          >
            How a week works
          </h2>
          <p className={`text-base/relaxed text-balance ${t.intro}`}>
            A competition is a week, not a night. Monday&rsquo;s workshop kicks
            it off, teams build all week, and next Monday judges it — then kicks
            off the next one. Some weeks are just a workshop. Hover a day to
            change the channel.
          </p>
        </div>
        <div className="mx-auto w-full max-w-sm lg:col-span-3 lg:max-w-none">
          <CrtTv
            noSignal={staticGif}
            showing={
              active?.gif ? { key: active.title, image: active.gif } : null
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <CompetitionTimeline tone={tone} />

        {/* The same eight columns as the strip, so each card starts under
            its day. Two columns each, in order: Mon (1–2), Wed (3–4), the
            rest of the week (5–6) and next Mon (7–8), whose caret sits on
            the strip's last column. The order of BEATS IS the layout. */}
        <ol className="grid grid-cols-1 gap-4 lg:grid-cols-8">
          {BEATS.map((beat, i) => (
            <li
              key={beat.title}
              data-active={hovered === i}
              className={`${t.beat} ${CARET_POS[beat.caret ?? "null"]} lg:col-span-2`}
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
