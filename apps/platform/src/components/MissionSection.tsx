import { getImageProps } from "next/image";
import type { CSSProperties } from "react";
import lecture from "~/assets/lecture.jpg";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";

const STAR_POINTS =
  "50,8 62.9,32.2 90,37 70.9,56.8 74.7,84 50,72 25.3,84 29.1,56.8 10,37 37.1,32.2";

const MISSION_BLOBS: BlobDef[] = [
  { cx: "15%", cy: "25%", rx: "50%", ry: "55%", fill: "#a5f3fc" }, // cyan
  { cx: "80%", cy: "75%", rx: "60%", ry: "50%", fill: "#22d3ee", opacity: 0.7 }, // cyan
  { cx: "78%", cy: "12%", rx: "42%", ry: "38%", fill: "#c4b5fd", opacity: 0.5 }, // violet
  { cx: "20%", cy: "80%", rx: "38%", ry: "32%", fill: "#a78bfa", opacity: 0.4 }, // violet
];

/* The star and the spark shower share this box, so the sparks track the star's
   responsive size and spawn on its silhouette rather than at fixed pixels. The
   negative margin lifts it off the container's centre line, which is the space
   the sparks then fall through. */
const STAR_BOX =
  "pointer-events-none absolute inset-1/2 aspect-square size-[min(100cqh,100cqw)] -mt-4 -translate-1/2 md:-mt-6";

/** One falling spark. Positions are percentages of the star's own box; `fall`
    and `drift` are the distance travelled before it burns out. */
interface SparkDef {
  left: string;
  top: string;
  width: string;
  height: string;
  drift: string;
  fall: string;
  delay: string;
  duration: string;
  color: string;
}

/* Spawn points sit on the star's lower half and the colours are the same three
   the block shadow casts, so the shower reads as the star shedding itself.
   Every spark carries its own delay and duration -- shared timing makes a rank
   of dots dropping in unison, not a shower. */
const STAR_SPARKS: SparkDef[] = [
  {
    left: "24%",
    top: "60%",
    width: "0.3rem",
    height: "1.1rem",
    drift: "-0.7rem",
    fall: "3.6rem",
    delay: "0s",
    duration: "3.4s",
    color: "var(--color-cyan-500)",
  },
  {
    left: "38%",
    top: "72%",
    width: "0.25rem",
    height: "0.9rem",
    drift: "0.5rem",
    fall: "2.8rem",
    delay: "0.9s",
    duration: "2.8s",
    color: "var(--color-indigo-700)",
  },
  {
    left: "50%",
    top: "78%",
    width: "0.35rem",
    height: "1.4rem",
    drift: "-0.3rem",
    fall: "4.4rem",
    delay: "0.4s",
    duration: "3.9s",
    color: "var(--color-mauve-800)",
  },
  {
    left: "61%",
    top: "68%",
    width: "0.3rem",
    height: "1rem",
    drift: "0.9rem",
    fall: "3.2rem",
    delay: "1.7s",
    duration: "3.1s",
    color: "var(--color-cyan-500)",
  },
  {
    left: "74%",
    top: "58%",
    width: "0.25rem",
    height: "1.2rem",
    drift: "0.4rem",
    fall: "4rem",
    delay: "2.3s",
    duration: "3.6s",
    color: "var(--color-indigo-700)",
  },
  {
    left: "32%",
    top: "84%",
    width: "0.25rem",
    height: "0.8rem",
    drift: "-1rem",
    fall: "2.4rem",
    delay: "1.3s",
    duration: "2.6s",
    color: "var(--color-mauve-800)",
  },
  {
    left: "68%",
    top: "82%",
    width: "0.3rem",
    height: "1rem",
    drift: "0.2rem",
    fall: "3rem",
    delay: "2.9s",
    duration: "3.3s",
    color: "var(--color-cyan-500)",
  },
];

function SpinStarImage() {
  return (
    <div
      className="@container-[size] relative h-64 min-w-64 grow md:-my-6 md:h-auto"
      aria-hidden="true"
    >
      {/* Weighted downward rather than evenly diagonal: chained drop-shadows
          compound, so these three stack to a 12px sideways / 30px vertical
          offset -- the same depth as before, read as the star hanging over the
          section instead of leaning out of it. */}
      <div
        className={`${STAR_BOX} drop-shadow-[3px_8px_0_var(--color-cyan-500),4px_10px_0_var(--color-indigo-700),5px_12px_0_var(--color-mauve-800)]`}
      >
        <svg
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          className="size-full"
        >
          <defs>
            <clipPath id="todo-replaceme-clipPath">
              <polygon
                points={STAR_POINTS}
                className="animate-spin-slow origin-center"
              />
            </clipPath>
          </defs>
          <image
            href={
              getImageProps({ alt: "", src: lecture, height: 400 }).props.src
            }
            height="100"
            clipPath="url(#todo-replaceme-clipPath)"
          />
        </svg>
      </div>

      {/* Deliberately a sibling of the star rather than a child: a filter
          applies to the whole subtree, so sparks nested under the drop-shadow
          would each trail three offset copies of themselves. */}
      <div className={`${STAR_BOX} motion-reduce:hidden`}>
        {STAR_SPARKS.map((spark, i) => (
          <span
            key={i}
            className="animate-star-spark absolute rounded-full"
            style={
              {
                left: spark.left,
                top: spark.top,
                width: spark.width,
                height: spark.height,
                // Transparent at the tail, solid at the head, so the spark
                // points the way it is falling.
                backgroundImage: `linear-gradient(to bottom, transparent, ${spark.color})`,
                animationDelay: spark.delay,
                animationDuration: spark.duration,
                "--spark-drift": spark.drift,
                "--spark-fall": spark.fall,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

export default function MissionSection({ topEdge, bottomEdge }: Props) {
  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="mission"
        className="relative w-full overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
        data-animate="fade-up"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#f0fdff"
          blobs={MISSION_BLOBS}
        />
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 md:flex-row md:gap-4 md:px-12 md:py-20">
          <SpinStarImage />
          <div className="w-full max-w-prose space-y-4 text-left text-base/relaxed text-mauve-700 *:text-balance md:text-right md:text-lg/relaxed">
            <h2 className="font-display mb-8 text-left text-4xl font-extrabold text-black md:text-right md:text-5xl">
              Our Mission
            </h2>
            <p>
              DevDogs is a student-run club at UGA where members learn real
              skills and build software that matters.
            </p>
            <p>
              Every week: a workshop on the concepts behind our project, then a
              competition where you ship what you learned straight to the
              codebase.
            </p>
            <p>
              Whether you&rsquo;re writing your first line of code or your
              thousandth — there&rsquo;s a place for you here.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
