import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import SpinStarImage from "./MissionStar";
import { MISSION_PARAGRAPHS } from "~/components/homeCopy";

/* The wash is two hues at two strengths each. */
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
            {MISSION_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
