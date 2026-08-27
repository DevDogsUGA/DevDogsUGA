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
 * and-teams`): a competition is a week-long window bracketed by two in-person
 * moments belonging to two *different* meetings, so a meeting straddles two
 * competitions — it judges last week's and opens next week's. The timeline
 * strip draws that shape; the beats below carry the sentences, one per moment,
 * each labelled with the day the strip put its dot on.
 *
 * The television is the other drawing. Hovering a beat is what changes the
 * channel — the GIF on screen is that beat's — and static plays whenever no
 * beat is live, including on the open build night, which has no agenda and so,
 * fittingly, no programme. The set is a hand-drawn SVG (see {@link CrtTv});
 * the GIFs run from 200 KB to 2.4 MB and next/image passes animated files
 * through unoptimized, so each mounts only while its beat is hovered rather
 * than putting megabytes on a page most visitors never hover at all.
 *
 * Renders on both pages, in both dialects. The homepage uses it on its light
 * marketing plate to make the case that the club is worth turning up to;
 * /events renders it `tone="dark"` inside a console card so the chips on every
 * row mean something to somebody seeing "Kickoff" for the first time. `tone`
 * swaps neutrals only — the segment hues are information and never change.
 *
 * `id` is a prop rather than a constant so the two pages can pick their own
 * anchor. Both jump to it from links, so the section carries a scroll margin
 * that clears the sticky TopNav.
 */

interface Beat {
  /** Which day, as the list prints it — matching the strip's dots. */
  day: string;
  title: string;
  body: ReactNode;
  /** The chips under the title. Empty for the async window, which is not a
   *  meeting and so has no segment. */
  segments: MeetingSegment[];
  /**
   * What the television shows while this beat is hovered, or null to let the
   * static show through. Mounted only while hovered — see the note above.
   */
  gif: StaticImageData | null;
}

const BEATS: Beat[] = [
  {
    day: "Monday",
    title: "The workshop opens it",
    body: (
      <>
        A meeting runs one workshop per project, in parallel. Most end by
        announcing the feature to build next, and that announcement is the
        kickoff. The same night also judges last week&rsquo;s competition.
      </>
    ),
    segments: ["workshop", "kickoff"],
    gif: informationGif,
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
    // No programme for a night with no agenda — the static IS the channel.
    gif: null,
  },
  {
    day: "Through the week",
    title: "Teams build it, asynchronously",
    body: (
      <>
        Up to four people per team, no room and no fixed hours. Each team opens
        a pull request against the competition&rsquo;s branch before judging.
      </>
    ),
    segments: [],
    gif: bruceAlmighty,
  },
  {
    day: "Next Monday",
    title: "The next meeting judges it",
    body: (
      <>
        Teams present what they built and the winning pull request gets merged.
        The rest are closed unmerged — taking part is what earns the star, so a
        losing entry does not cost one.
      </>
    ),
    segments: ["judging"],
    gif: charlieConspiracy,
  },
];

/**
 * The two dialects' neutrals. Class strings are CONSTANT per tone — which beat
 * is live is a data attribute, never a class change: `[data-animate]` starts
 * at `opacity: 0` in globals.css and only becomes visible when AnimationInit
 * adds `.is-visible`, a class added outside React to an element React believes
 * it owns. Deriving className from hover state makes React rewrite the class
 * attribute and delete `is-visible`, and the observer has already unobserved
 * the node, so nothing ever puts it back — hovering a beat deletes the beat.
 */
const TONES = {
  light: {
    heading: "text-black",
    intro: "text-mauve-700",
    beat: "flex flex-col gap-2 border-t-2 border-black pt-3 transition-colors",
    beatDay:
      "font-display text-xs font-extrabold tracking-widest text-mauve-600 uppercase",
    beatTitle: "font-display text-lg leading-tight font-extrabold text-black",
    beatBody: "text-sm/relaxed text-mauve-700",
  },
  dark: {
    heading: "text-white",
    intro: "text-mauve-300",
    beat: "flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4 transition-colors data-[active=true]:border-white/40",
    beatDay:
      "font-display text-xs font-extrabold tracking-widest text-mauve-400 uppercase",
    beatTitle: "font-display text-lg leading-tight font-extrabold text-white",
    beatBody: "text-sm/relaxed text-mauve-300",
  },
} satisfies Record<Tone, Record<string, string>>;

export default function HowItWorks({
  id = "how-it-works",
  tone = "light",
}: {
  id?: string;
  tone?: Tone;
}) {
  // `null` is the resting state, not "beat 0": static plays underneath until a
  // pointer lands on a beat.
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
      <div className="max-w-prose text-left">
        <h2
          id={`${id}-heading`}
          className={`font-display mb-4 text-3xl font-extrabold md:text-4xl ${t.heading}`}
        >
          How a competition works
        </h2>
        <p className={`text-base/relaxed text-balance ${t.intro}`}>
          A competition is a week, not an evening. One meeting&rsquo;s workshop
          opens it and the following meeting judges it — so every meeting is
          doing both at once: judging the competition that opened last week, and
          opening the next one.
        </p>
      </div>

      <CompetitionTimeline tone={tone} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <ol className="flex flex-col gap-4 lg:col-span-3">
          {BEATS.map((beat, i) => (
            <li
              key={beat.title}
              data-active={hovered === i}
              className={t.beat}
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

        {/* Centred rather than stretched: the column is as tall as the four
            beats beside it, and a television told to fill it would be a
            television two feet deep. It keeps its proportions and sits in the
            middle of whatever height the row ends up with. */}
        <div className="flex items-center justify-center lg:col-span-2">
          <CrtTv
            noSignal={staticGif}
            showing={
              active?.gif ? { key: active.title, image: active.gif } : null
            }
          />
        </div>
      </div>
    </section>
  );
}
