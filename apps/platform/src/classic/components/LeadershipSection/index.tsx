import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/classic/ui/section-background";
import LeaderCluster from "./LeaderCluster";
import { getCurrentOfficers } from "~/server/loaders/officers";
import { LEADERSHIP_BLURB } from "~/classic/components/homeCopy";

const LEADERSHIP_BLOBS: BlobDef[] = [
  { cx: "20%", cy: "30%", rx: "55%", ry: "50%", fill: "#a7f3d0" }, // emerald
  { cx: "78%", cy: "65%", rx: "50%", ry: "55%", fill: "#34d399", opacity: 0.6 }, // emerald
  {
    cx: "74%",
    cy: "12%",
    rx: "44%",
    ry: "36%",
    fill: "#a5b4fc",
    opacity: 0.5,
  }, // indigo
  {
    cx: "10%",
    cy: "78%",
    rx: "38%",
    ry: "32%",
    fill: "#c7d2fe",
    opacity: 0.45,
  }, // indigo
];

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

export default async function LeadershipSection({
  topEdge,
  bottomEdge,
}: Props) {
  // Cached in the loader, and this whole section renders inside the
  // homepage's `"use cache"` scope, so the await does not make the page
  // dynamic. It resolves when the prerendered shell is built, and again
  // whenever a board edit or the loader's TTL revalidates it.
  const officers = await getCurrentOfficers();

  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="leadership"
        className="relative w-full pt-(--section-skew-slope) pb-(--section-skew-slope)"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#f0fdf4"
          blobs={LEADERSHIP_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-14 md:py-20">
          <div className="mb-10 text-center">
            <h2 className="font-display mb-4 text-4xl font-extrabold text-black md:text-5xl">
              Leadership
            </h2>
            <p className="font-800 mx-auto max-w-2xl text-mauve-800">
              {LEADERSHIP_BLURB}
            </p>
          </div>

          {/* An empty board is a seeding failure, not a state worth designing
              for. But rendering the cluster with nothing in it produces a 660px
              void under the heading, so the section closes up instead. */}
          {officers.length > 0 && <LeaderCluster profiles={officers} />}
        </div>
      </section>
    </div>
  );
}
