import CompetitionTimeline from "./CompetitionTimeline";

/**
 * The club's format, said once and drawn once.
 *
 * The copy has to keep the model straight (see `docs/platform/guides/meetings-
 * and-teams`): a competition is a week-long window bracketed by two in-person
 * moments belonging to two *different* meetings, so a meeting straddles two
 * competitions — it judges last week's and opens next week's. Writing it as
 * "the workshop, then the hackathon" would be the exact mistake the schema was
 * designed to rule out, and the timeline exists so the shape is visible rather
 * than only stated.
 *
 * This used to be a card holding three more cards, and it lived only on the
 * homepage. It is now a band with no box of its own — the heading, the
 * paragraph and the timeline sit straight on the section — and it renders on
 * both pages. The homepage uses it to make the case that the club is worth
 * turning up to; `/events` uses it so the chips on every row mean something to
 * somebody seeing "Kickoff" for the first time, without a hop back to the
 * homepage.
 *
 * `id` is a prop rather than a constant so the two pages can pick their own
 * anchor. Both jump to it from links, so the section carries a scroll margin
 * that clears the sticky TopNav.
 */
export default function HowItWorks({ id = "how-it-works" }: { id?: string }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-28 flex-col gap-8"
      data-animate="fade-up"
    >
      <div className="max-w-prose text-left">
        <h2
          id={`${id}-heading`}
          className="font-display mb-4 text-3xl font-extrabold text-black md:text-4xl"
        >
          How a competition works
        </h2>
        <p className="text-base/relaxed text-balance text-mauve-700">
          A competition is a week, not an evening. One meeting&rsquo;s workshop
          opens it and the following meeting judges it — so every meeting is
          doing both at once: judging the competition that opened last week, and
          opening the next one.
        </p>
      </div>

      <CompetitionTimeline />

      <p className="max-w-prose text-sm/relaxed text-mauve-700">
        <strong className="font-semibold text-black">
          Not every workshop opens a competition.
        </strong>{" "}
        A supplementary workshop is complete on its own — nothing to build
        afterwards, nothing to judge — and is worth exactly one star.
      </p>
    </section>
  );
}
