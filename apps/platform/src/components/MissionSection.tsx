import { getImageProps } from "next/image";
import type { CSSProperties } from "react";
import lecture from "~/assets/lecture.jpg";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";

const STAR_POINTS =
  "50,8 62.9,32.2 90,37 70.9,56.8 74.7,84 50,72 25.3,84 29.1,56.8 10,37 37.1,32.2";

/* The wash is two hues at two strengths each. Named rather than inlined
   because the star's shadow reaches for BLOB_AMBER by name (see SHADOW_STEPS).
   Retint the blob and the star's leading edge follows, instead of the two
   drifting a shade apart the way they had. */
const BLOB_ROSE_PALE = "#fecdd3";
const BLOB_ROSE = "#fb7185";
const BLOB_AMBER_PALE = "#fed7aa";
const BLOB_AMBER = "#fdba74";

export const MISSION_BLOBS: BlobDef[] = [
  { cx: "15%", cy: "25%", rx: "50%", ry: "55%", fill: BLOB_ROSE_PALE },
  { cx: "80%", cy: "75%", rx: "60%", ry: "50%", fill: BLOB_ROSE, opacity: 0.7 },
  {
    cx: "78%",
    cy: "12%",
    rx: "42%",
    ry: "38%",
    fill: BLOB_AMBER_PALE,
    opacity: 0.5,
  },
  {
    cx: "20%",
    cy: "80%",
    rx: "38%",
    ry: "32%",
    fill: BLOB_AMBER,
    opacity: 0.4,
  },
];

/* The star and the spark shower share this box, so the sparks track the star's
   responsive size and spawn on its silhouette rather than at fixed pixels. The
   negative margin lifts it off the container's centre line, which is the space
   the sparks then fall through. */
const STAR_BOX =
  "pointer-events-none absolute inset-1/2 aspect-square size-[min(100cqh,100cqw)] -mt-4 -translate-1/2 md:-mt-6";

/* The shadow, and everything aimed along it.

   These three offsets are the only place the star's shadow direction is
   written down. CSS filter functions pipe each result into the next, so the
   copies compound rather than overlap, and the outermost lands at the running
   sum, (12px, 30px), measured by rendering the chain and scanning the raster.
   Both the filter string and the angle the sparks fall at come from this array,
   so retuning the shadow re-aims the shower and the two cannot disagree.

   Amber first and rose under it, not the section's dominant rose first. The
   slab has to separate from the pale rose plate it is cast on: a rose band
   there reads as a smudge, the amber one reads as an edge, and the dark rose
   behind it makes the stack look like depth instead of an outline.

   Every band is the wash's own colour. The bright one is BLOB_AMBER rather than
   amber-400, which is #fcbb00 here, a gold against the #fdba74 the two warm
   blobs are painted in, so the star's leading edge was the one warm thing on
   the section no blob could account for. The dark bands are the far end of the
   same rose ramp the wash starts on, rose-900 into rose-950, where the
   outermost used to be mauve-800, a near-black with a violet cast left over
   from the cyan/violet palette this section used to wear.

   The swaps are lightness-neutral, so none of that moves the stack's read. The
   bright-to-dark step goes 5.6:1 -> 5.7:1 and the dark-to-darkest 1.62:1 ->
   1.63:1, so the three bands separate exactly as far as they did. That
   lightness spread is also what the sparks need. See SPARK_TINTS. */
const SHADOW_STEPS = [
  { x: 3, y: 8, color: BLOB_AMBER },
  { x: 4, y: 10, color: "var(--color-rose-900)" },
  { x: 5, y: 12, color: "var(--color-rose-950)" },
] as const;

const STAR_SHADOW_FILTER = SHADOW_STEPS.map(
  (step) => `drop-shadow(${step.x}px ${step.y}px 0 ${step.color})`,
).join(" ");

const SHADOW_TIP = SHADOW_STEPS.reduce(
  (tip, step) => ({ x: tip.x + step.x, y: tip.y + step.y }),
  { x: 0, y: 0 },
);

/* Negated on purpose. CSS rotate(a) resolves to matrix(cos a, sin a, -sin a,
   cos a, 0, 0), so rotating a straight-down vector by a POSITIVE angle moves it
   left: rotate(21.8deg) translate3d(0, 120px, 0) comes out at dx = -44.6. The
   shadow leans right, so the sparks rotate by -21.8deg to lean right with it. */
const SPARK_ANGLE_DEG =
  (-Math.atan2(SHADOW_TIP.x, SHADOW_TIP.y) * 180) / Math.PI;

/* Pale bodies with white heads, and a dark rim from the CSS below. The first
   version painted its sparks in the same three colours as the shadow slab they
   fall through, so a spark crossing its own band measured 1.00:1, invisible by
   construction however big it got.

   A spark is never one colour against a backdrop, it is a white head and a dark
   rim, so what has to hold is that *one of those two* separates from whatever
   it crosses. That is about lightness, not hue, which is why the section could
   trade its cyan/violet wash for rose/amber and keep it, but only once the
   bands were re-picked to sit at opposite ends of the range. Hue-for-hue
   substitution put both mid-range and dropped the worst pair to 5.2:1.

   Measured on the built page, worst backdrop, better of head and rim:

   - BLOB_AMBER band ....... 11.75:1  (rim carries it)
   - rose-900 band ......... 9.61:1   (head carries it)
   - rose-950 band ........ 15.70:1   (head)
   - the section base ..... 18.03:1   (rim)

   So 9.61:1 at worst, against 8.38:1 for the cyan/violet original. Pulling the
   outer bands onto the wash's exact hues cost the shower nothing: amber-400 ->
   BLOB_AMBER went 11.55 -> 11.75 and mauve-800 -> rose-950 went 15.53 -> 15.70,
   because both swaps hold their lightness. The worst pair is the rose-900 band
   either way. */
const SPARK_TINTS = [
  "var(--color-rose-200)",
  "var(--color-orange-200)",
  "var(--color-white)",
] as const;

/* Fixed-seed PRNG rather than Math.random. Server and browser have to emit
   byte-identical markup or React throws the tree away as a hydration mismatch.
   Deterministic also means the shower looks the same on every deploy, so
   tuning it stays a code change rather than a coin flip. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spark = mulberry32(0x5eed);

/* Every dimension is in cqmin, percent of the star's own box, because the star
   is sized in container units and the first version's sparks were sized in rem.
   They stayed 4px wide while the star grew from 256px to 336px, so the shower
   shrank to a third of a percent of the viewport on desktop. */
const STAR_SPARKS = Array.from({ length: 16 }, (_, i) => ({
  left: `${(16 + spark() * 68).toFixed(1)}%`,
  top: `${(38 + spark() * 46).toFixed(1)}%`,
  width: `${(2 + spark() * 1.2).toFixed(2)}cqmin`,
  height: `${(8.5 + spark() * 6.5).toFixed(2)}cqmin`,
  fall: `${(40 + spark() * 34).toFixed(1)}cqmin`,
  duration: `${(1.6 + spark() * 0.9).toFixed(2)}s`,
  delay: `${(spark() * 2.6).toFixed(2)}s`,
  // Where a frozen spark sits when the viewer asks for reduced motion.
  rest: (0.25 + spark() * 0.5).toFixed(2),
  tint: SPARK_TINTS[i % SPARK_TINTS.length]!,
}));

function SpinStarImage() {
  return (
    <div
      className="@container-[size] relative h-64 min-w-64 grow md:-my-6 md:h-auto"
      aria-hidden="true"
    >
      {/* Deliberately a sibling of the star rather than a child. A filter
          applies to the whole subtree, so sparks nested under the drop-shadow
          would each trail three offset copies of themselves.

          It sits before the star in the DOM on purpose. Both layers are
          positioned at z-index auto, so document order decides which one paints
          on top. Putting the sparks first drops them behind the star and its
          shadow with no z-index anywhere. The star is clipped to its polygon,
          so sparks show through the gaps between the arms and duck behind the
          arms themselves as it turns. */}
      <div
        className={STAR_BOX}
        style={
          {
            "--spark-angle": `${SPARK_ANGLE_DEG.toFixed(2)}deg`,
          } as CSSProperties
        }
      >
        {STAR_SPARKS.map((s, i) => (
          <span
            key={i}
            data-spark
            className="absolute rounded-full"
            style={
              {
                left: s.left,
                top: s.top,
                width: s.width,
                height: s.height,
                // Never starts at zero alpha. The rim below is drawn around the
                // whole capsule, so a fully transparent tail would leave a
                // hollow outline chasing the head.
                backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${s.tint} 40%, transparent), ${s.tint} 55%, var(--color-white))`,
                // Dark rim so a pale spark still reads against the pale section,
                // faint bloom so it separates from the mid-tone blobs.
                boxShadow:
                  "0 0 0 1px var(--color-mauve-950), 0 0 6px color-mix(in oklab, var(--color-rose-100) 60%, transparent)",
                "--spark-fall": s.fall,
                "--spark-duration": s.duration,
                "--spark-delay": s.delay,
                "--spark-rest": s.rest,
              } as CSSProperties
            }
          />
        ))}
      </div>
      {/* Weighted downward rather than evenly diagonal. The chained offsets
          stack to 12px sideways against 30px down, so the star reads as
          hanging over the section instead of leaning out of it. */}
      <div className={STAR_BOX} style={{ filter: STAR_SHADOW_FILTER }}>
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
          {/* No `sizes` here, deliberately. It would make this worse. An SVG
              <image> takes a single href, so only `.props.src` survives and the
              srcset is thrown away; Next builds that one URL from the LARGEST
              candidate it generated. With no `sizes` the candidates are the
              1x/2x pair around `height`, so `src` comes out at w=828, a sane 2x
              for the ~400px the star renders at. Add a `sizes` and the candidate
              list becomes every configured width, and this single href jumps to
              w=3840. */}
          <image
            href={
              getImageProps({ alt: "", src: lecture, height: 400 }).props.src
            }
            height="100"
            clipPath="url(#todo-replaceme-clipPath)"
          />
        </svg>
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
        // scroll-mt clears the h-16 sticky TopNav when a marquee card jumps to
        // #id, the same idea as `ui/card`. It is measured from the border box,
        // whose top is where pt-(--section-skew-slope) begins, so the slanted
        // top edge clears the nav too and not just the copy below it.
        className="relative w-full scroll-mt-20 overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#fff1f2"
          blobs={MISSION_BLOBS}
        />
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 md:flex-row md:gap-4 md:px-12 md:py-20">
          <SpinStarImage />
          <div className="w-full max-w-prose space-y-4 text-left text-base/relaxed font-medium text-mauve-800 *:text-balance md:text-right md:text-lg/relaxed">
            <h2 className="font-display mb-8 text-left text-4xl font-extrabold text-black md:text-right md:text-5xl">
              Our Mission
            </h2>
            <p>
              DevDogs is the large-scale application development club at UGA
              dedicated to benefitting our community through code.
            </p>
            <p>
              All of our projects are free, open-source, and designed to teach
              students industry-standard technologies and best-practices for
              collaboration in a fun and welcoming environment.
            </p>
            <p>
              Whether you&rsquo;re writing your first line of code or your
              thousandth, there&rsquo;s a place for you here.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
