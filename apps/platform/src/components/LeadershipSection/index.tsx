import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import LinkButton from "~/ui/link-button";
import LeaderCluster from "./LeaderCluster";
import { getCurrentOfficers } from "~/server/loaders/officers";

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

export default async function LeadershipSection({
  topEdge,
  bottomEdge,
}: Props) {
  // Cached in the loader, and this whole section renders inside the
  // homepage's `"use cache"` scope, so the await does not make the page
  // dynamic — it resolves once when the prerendered shell is built.
  const officers = await getCurrentOfficers();

  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="leadership"
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

          {/* An empty board is a seeding failure, not a state worth designing
              for -- but rendering the cluster with nothing in it produces a
              660px void under the heading, so the section closes up instead. */}
          {officers.length > 0 && <LeaderCluster profiles={officers} />}

          {/* Says the same thing as the announcement notice, in the same
              words, behind the same button. The notice is dismissible and
              scoped to a session; this is the standing copy that outlives it,
              so the two have to agree. See ~/config/announcement.ts. */}
          <div className="mx-auto mt-12 max-w-2xl border-t border-amber-200 pt-8 text-center">
            <p className="text-sm text-balance text-mauve-600">
              DevDogs leadership is elected each spring semester, and
              applications for the 2026–27 executive board are open to all
              students.
            </p>
            <LinkButton
              href="/leadership"
              // A next.config redirect onto the application form, not a page —
              // never prefetch. It leaves the site, so it leaves this tab
              // alone: the notice's button does the same.
              prefetch={false}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:shadow-block-md transition-lift mx-auto mt-6 flex w-fit items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              Apply Now <ArrowSquareOutIcon />
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
