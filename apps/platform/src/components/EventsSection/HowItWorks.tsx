"use client";

import { useState } from "react";
import type { StaticImageData } from "next/image";
import type { ReactNode } from "react";
import CrtTv from "./CrtTv";
import bruceAlmighty from "~/assets/bruce-almighty.gif";
import charlieConspiracy from "~/assets/charlie-conspiracy.gif";
import informationGif from "~/assets/information.gif";
import staticGif from "~/assets/static.gif";

interface Beat {
  title: string;
  body: ReactNode;
  /**
   * Mounted only while this beat is hovered. The GIFs run from 200 KB to
   * 2.4 MB, and next/image passes animated files through unoptimized, so
   * rendering all three up front would put megabytes on a marketing page that
   * most visitors never hover at all.
   */
  gif: StaticImageData;
}

/**
 * The three beats of one competition, in order — the numbering is load-bearing
 * rather than decorative, because the whole point is that these happen in
 * sequence across two different meetings.
 */
const BEATS: Beat[] = [
  {
    title: "A workshop teaches the feature area",
    body: (
      <>
        A meeting runs one workshop per project, in parallel. Most of them end
        by announcing the feature to build next, and that announcement is what
        opens the competition.
      </>
    ),
    gif: informationGif,
  },
  {
    title: "Teams build it over the following week",
    body: (
      <>
        Up to four people per team, working asynchronously — no room, no fixed
        hours. Each team opens a pull request against the competition&rsquo;s
        branch.
      </>
    ),
    gif: bruceAlmighty,
  },
  {
    title: "The next meeting judges it",
    body: (
      <>
        Teams present what they built and the winning pull request gets merged.
        The rest are closed unmerged — taking part is what earns the star, so a
        losing entry does not cost one.
      </>
    ),
    gif: charlieConspiracy,
  },
];

/**
 * The club's format, said once.
 *
 * This replaces four cards that looked like schedule data and were not: each
 * invented a description, a set of steps, and a recurrence for an event type
 * that exists in no table. The only real content in them was the format, which
 * is one shape repeated weekly rather than four kinds of night.
 *
 * The copy has to keep the model straight (see `docs/platform/meetings-and-
 * teams.md`): a competition is a week-long window bracketed by two in-person
 * moments belonging to two *different* meetings, so a meeting straddles two
 * competitions — it judges last week's and opens next week's.
 * Writing it as "the workshop, then the hackathon" would be the exact mistake
 * the schema was designed to rule out.
 *
 * It lives on the homepage and nowhere else. `/events` used to render it too,
 * which made the bottom half of the two pages the same page; a visitor there
 * came for a date and gets the vocabulary in one sentence in the header plus a
 * link back to this. The band is the answer to "is this club worth turning up
 * to", which is the homepage's question, not the schedule's.
 */
export default function HowItWorks() {
  // `null` is the resting state, not "beat 0": static.gif plays underneath
  // until a pointer lands on a beat.
  const [hovered, setHovered] = useState<number | null>(null);
  // noUncheckedIndexedAccess is on, so this is Beat | undefined either way —
  // which is what the panel wants anyway, since undefined *is* the rest state.
  const active = hovered === null ? undefined : BEATS[hovered];

  return (
    <section
      id="how-it-works"
      // The band carries its own ground rather than inheriting the section's:
      // mauve-on-white copy needs a known plate under it, and the blobs behind
      // the section run from rose to amber, which is not one.
      //
      // No horizontal margin of its own — it sits inside the section's padded
      // column and lines up with the strip above it. It used to be inset,
      // which read as deliberate when the band was one of five and as a
      // misalignment when it is one of two.
      //
      // scroll-mt clears the sticky TopNav, the same idea as `ui/card` — but a
      // much larger number than the 20 that uses, because what has to clear is
      // the *heading*, not the border. That sits 40-60px inside the card's own
      // padding, and the homepage's reveal animations settle after the jump,
      // reflowing the anchor another ~50px upward on a phone. Measured against
      // a production build at 1440 and 390: at 20 the heading landed under the
      // nav at both widths.
      //
      // This is a jump target now because /events links back to
      // `/#how-it-works` rather than rendering its own copy of the band.
      className="scroll-mt-48 overflow-hidden rounded-xl border-2 border-black bg-rose-50"
      data-animate="fade-up"
    >
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10 md:px-12 md:py-14">
        <div className="max-w-prose text-left">
          <h2 className="font-display mb-4 text-3xl font-extrabold text-black md:text-4xl">
            How a competition works
          </h2>
          <p className="text-base/relaxed text-balance text-mauve-700">
            A competition is a week, not an evening. One meeting&rsquo;s
            workshop opens it and the following meeting judges it — so every
            meeting is doing both at once: judging the competition that opened
            last week, and opening the next one.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <ol
            className="flex flex-col gap-4 lg:col-span-3"
            data-animate-stagger
          >
            {BEATS.map((beat, i) => (
              <li
                key={beat.title}
                /* Which beat is live is a data attribute, and the class list is
                   a constant. It cannot be derived from `hovered`, because
                   `[data-animate]` starts at `opacity: 0` in globals.css and
                   only becomes visible when AnimationInit adds `.is-visible` —
                   a class, added outside React, to an element React believes it
                   owns. Re-deriving className from state made React rewrite the
                   whole class attribute, which deleted `is-visible`; the
                   observer had already unobserved the node, so nothing ever put
                   it back. Hovering a beat deleted the beat.

                   Only the shadow moves. The obvious emphasis — dimming the
                   other two — is not available here: `[data-animate]` sets
                   opacity, transform and transition unlayered, so it outranks
                   every Tailwind utility for those three properties, and the
                   `opacity-75` this used to carry was inert long before it was
                   removed. box-shadow is untouched by that rule, so it is the
                   one thing that can actually respond. The real feedback is the
                   television changing channel. */
                data-active={hovered === i}
                className="shadow-block-md data-[active=true]:shadow-block-xl flex gap-4 rounded-sm border-2 border-black bg-white p-5"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                data-animate="fade-up"
              >
                {/* aria-hidden because the <ol> already carries the ordering to
                    assistive tech; this is the same number drawn twice. */}
                <span
                  aria-hidden
                  className="font-display flex size-8 shrink-0 items-center justify-center rounded-sm border-2 border-black bg-rose-200 text-sm font-extrabold text-black"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <h3 className="font-display text-lg leading-tight font-extrabold text-black">
                    {beat.title}
                  </h3>
                  <p className="text-sm/relaxed text-mauve-600">{beat.body}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Centred rather than stretched. The panel used to be a rectangle
              told to fill the column, which is as tall as the three beats
              beside it; a television given the same instruction would be a
              television two feet deep. It keeps its proportions and sits in
              the middle of whatever height the row ends up with. */}
          <div className="flex items-center justify-center lg:col-span-2">
            <CrtTv
              noSignal={staticGif}
              showing={active ? { key: active.title, image: active.gif } : null}
            />
          </div>
        </div>

        <p className="max-w-prose text-sm/relaxed text-mauve-700">
          <strong className="font-semibold text-black">
            Not every workshop opens a competition.
          </strong>{" "}
          A supplementary workshop is complete on its own — nothing to build
          afterwards, nothing to judge — and is worth exactly one star.
        </p>
      </div>
    </section>
  );
}
