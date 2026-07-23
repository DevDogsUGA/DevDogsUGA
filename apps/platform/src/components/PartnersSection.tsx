import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";

const BADGE_POINTS =
  "50,4 58,11 68,8 72,17 83,18 83,28 93,32 89,42 96,50 89,58 93,68 83,72 83,83 72,83 68,93 58,89 50,96 42,89 32,93 28,83 18,83 17,72 8,68 11,58 4,50 11,42 8,32 17,28 18,18 28,17 32,8 42,11";

const PARTNERS_BLOBS: BlobDef[] = [
  { cx: "18%", cy: "35%", rx: "50%", ry: "55%", fill: "#e9d5ff" }, // purple
  { cx: "75%", cy: "60%", rx: "55%", ry: "50%", fill: "#c084fc", opacity: 0.6 }, // purple
  { cx: "70%", cy: "10%", rx: "44%", ry: "36%", fill: "#fbcfe8", opacity: 0.5 }, // pink
  { cx: "12%", cy: "82%", rx: "40%", ry: "30%", fill: "#f9a8d4", opacity: 0.5 }, // pink
];

function MarchingAntsBadge() {
  return (
    <div className="relative grow">
      <Link
        href="mailto:devdogs@uga.edu"
        className="absolute inset-1/2 flex aspect-square -translate-1/2 items-center justify-center transition-transform will-change-transform hover:scale-105 md:w-56 md:shrink-0"
        aria-label="Partner with DevDogs"
      >
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon points={BADGE_POINTS} fill="var(--color-purple-200)" />
          <polygon
            points={BADGE_POINTS}
            fill="none"
            stroke="black"
            strokeWidth="1.5"
            strokeLinejoin="round"
            className="animate-march-dashes"
          />
        </svg>
        <div className="relative z-10 flex rotate-[8deg] flex-col items-center gap-2 px-8 py-6 text-center">
          <p className="font-display text-sm leading-tight font-extrabold text-mauve-800">
            Your Logo Here
          </p>
          <p className="text-xs text-purple-700 underline">Reach out →</p>
        </div>
      </Link>
    </div>
  );
}

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

export default function PartnersSection({ topEdge, bottomEdge }: Props) {
  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        className="relative w-full overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
        data-animate="scale-up"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#faf5ff"
          blobs={PARTNERS_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-14 md:px-12 md:py-20">
          <div className="flex flex-wrap gap-6 md:flex-nowrap md:items-center md:gap-16">
            <div className="w-full max-w-prose space-y-4 text-balance">
              <h2 className="font-display mb-8 text-left text-4xl font-extrabold text-black md:text-5xl">
                Partners
              </h2>
              <p className="text-base/relaxed text-mauve-700">
                DevDogs is a student-run software development club at UGA with
                350+ active members. We build real products shipped to the
                community each semester — not toy apps.
              </p>
              <p className="text-base/relaxed text-mauve-700">
                Partnering with DevDogs puts your brand directly in front of
                driven students. We offer sponsorship tiers, recruiting access,
                and mentorship opportunities.
              </p>
              <div className="shadow-block-lg mx-auto mt-8 flex flex-col gap-3 rounded-sm border-2 border-black bg-white p-4 sm:flex-row sm:items-center sm:gap-6">
                <p className="flex-1 text-sm text-mauve-600">
                  <span className="inline-block">
                    Interested in sponsoring DevDogs?
                  </span>
                  <span className="inline-block font-bold text-mauve-900">
                    Put your brand in front of 350+ driven builders.
                  </span>
                </p>
                <Link
                  href="mailto:devdogs@uga.edu"
                  className="transition-lift flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-mauve-950 px-4 py-2 text-sm font-semibold text-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-purple-400)]"
                >
                  Get in Touch
                  <ArrowRightIcon className="text-xs" />
                </Link>
              </div>
            </div>
            <MarchingAntsBadge />
          </div>
        </div>
      </section>
    </div>
  );
}
