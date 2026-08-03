import Link from "next/link";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import LeaderCluster from "./LeaderCluster";
import { execBoard } from "~/app/(site)/homeData";

const LEADERSHIP_BLOBS: BlobDef[] = [
  { cx: "20%", cy: "28%", rx: "50%", ry: "55%", fill: "#fde68a" }, // amber
  { cx: "78%", cy: "68%", rx: "55%", ry: "50%", fill: "#fbbf24", opacity: 0.7 }, // amber
  {
    cx: "72%",
    cy: "12%",
    rx: "42%",
    ry: "36%",
    fill: "#fda4af",
    opacity: 0.45,
  }, // rose
  { cx: "12%", cy: "80%", rx: "40%", ry: "32%", fill: "#f9a8d4", opacity: 0.5 }, // rose
];

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

export default function LeadershipSection({ topEdge, bottomEdge }: Props) {
  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        className="relative w-full pt-(--section-skew-slope) pb-(--section-skew-slope)"
        data-animate="fade-up"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#fffbeb"
          blobs={LEADERSHIP_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-14 md:py-20">
          <div className="mb-10 text-center">
            <h2 className="font-display mb-4 text-4xl font-extrabold text-black md:text-5xl">
              Leadership
            </h2>
            <p className="mx-auto max-w-2xl text-mauve-700">
              DevDogs is led by a diverse executive board of UGA students across
              all disciplines and years.
            </p>
          </div>

          <LeaderCluster profiles={execBoard} />

          <p className="mx-auto mt-12 max-w-2xl border-t border-amber-200 pt-8 text-center text-sm text-balance text-mauve-600">
            DevDogs leadership is elected each spring semester from the active
            member pool.{" "}
            <Link
              href="/join"
              // Starts an OAuth handshake, not a page — never prefetch.
              prefetch={false}
              className="font-semibold text-amber-700 hover:underline"
            >
              Get involved
            </Link>{" "}
            and grow with us.
          </p>
        </div>
      </section>
    </div>
  );
}
