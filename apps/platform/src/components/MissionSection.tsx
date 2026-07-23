import Image, { getImageProps } from "next/image";
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

function SpinStarImage() {
  return (
    <div
      className="@container-[size] relative -my-6 min-w-64 grow drop-shadow-[8px_8px_0_var(--color-cyan-500),10px_10px_0_var(--color-indigo-700),12px_12px_0_var(--color-mauve-800)]"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-1/2 aspect-square size-[min(100cqh,100cqw)] -translate-1/2"
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
          href={getImageProps({ alt: "", src: lecture, height: 400 }).props.src}
          height="100"
          clipPath="url(#todo-replaceme-clipPath)"
        />
      </svg>
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
        <div className="relative z-10 mx-auto flex max-w-6xl gap-4 px-12 py-14 md:py-20">
          <SpinStarImage />
          <div className="w-full max-w-prose space-y-4 text-right text-base/relaxed text-mauve-700 *:text-balance md:text-lg/relaxed">
            <h2 className="font-display mb-8 text-right text-4xl font-extrabold text-black md:text-5xl">
              Our Mission
            </h2>
            <p>
              DevDogs is a student-run club at UGA where members learn real
              skills and build software that matters.
            </p>
            <p>
              Every week, we run workshops on the technical concepts behind our
              current project, followed by hackathon sessions where you apply
              what you learned and ship features directly to the codebase.
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
