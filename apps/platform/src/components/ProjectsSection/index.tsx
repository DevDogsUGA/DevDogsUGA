import { Suspense, type ReactNode } from "react";
// Parked with `RotatedImage` below — restore both together.
// import Image from "next/image";
// import ibm from "~/assets/ibm.gif";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import { PROJECTS } from "~/config/projects";
import ProjectCard from "./ProjectCard";
import SuggestProjectCard from "./SuggestProjectCard";

const OPEN_PROJECTS = PROJECTS.filter((p) => p.contributions === "open");
const CLOSED_PROJECTS = PROJECTS.filter((p) => p.contributions === "closed");

const PROJECTS_BLOBS: BlobDef[] = [
  { cx: "20%", cy: "30%", rx: "55%", ry: "50%", fill: "#a7f3d0" }, // emerald
  { cx: "78%", cy: "65%", rx: "50%", ry: "55%", fill: "#34d399", opacity: 0.6 }, // emerald
  { cx: "74%", cy: "12%", rx: "44%", ry: "36%", fill: "#a5b4fc", opacity: 0.5 }, // indigo
  {
    cx: "10%",
    cy: "78%",
    rx: "38%",
    ry: "32%",
    fill: "#c7d2fe",
    opacity: 0.45,
  }, // indigo
];

/* Parked, not deleted: the header is centered copy for now, with no room for
   the rotated diamond beside it. Uncomment this, its two imports above, and
   the call in the header to bring it back.

function RotatedImage() {
  return (
    <div className="@container-[size] flex h-64 grow items-center justify-center drop-shadow-[12px_0px_0_var(--color-mauve-800)] md:h-auto">
      <div className="relative size-[calc(100cqh/sqrt(2))] rotate-45 overflow-hidden rounded-sm border-2 border-black md:-ml-12">
        <div className="absolute inset-1/2 size-[100cqh] -translate-1/2 -rotate-45">
          <Image
            alt=""
            className="absolute inset-0 size-full object-cover"
            src={ibm}
          />
        </div>
      </div>
    </div>
  );
}
*/

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
  /**
   * The streak call-to-action, which reads the visitor's session and so cannot
   * be prerendered. It is passed in rather than rendered here because this
   * section renders inside the homepage's `"use cache"` scope, and `cookies()`
   * is an error anywhere inside one. Created by an uncached caller, the element
   * renders outside the cache boundary and streams into the Suspense below.
   */
  streakCta: ReactNode;
}

export default function ProjectsSection({
  topEdge,
  bottomEdge,
  streakCta,
}: Props) {
  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="projects"
        className="relative w-full overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
        data-animate="fade-up"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#f0fdf4"
          blobs={PROJECTS_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl space-y-16 px-6 py-12 md:px-12 md:py-16">
          <div className="mx-auto max-w-prose space-y-4 text-center text-balance">
            <h2 className="font-display mb-8 text-4xl font-extrabold text-black md:text-5xl">
              Projects
            </h2>
            <div className="mx-auto flex max-w-2xl flex-col gap-3 text-base/relaxed text-mauve-700">
              <p>
                At DevDogs, every project is a real product built for real users
                — not a toy app or a class assignment.
              </p>
              <p>
                Each semester, members collaborate across design, engineering,
                and product to ship something that matters.
              </p>
            </div>
            {/* <RotatedImage /> */}
          </div>

          {/* Two rows rather than one 2x2: the projects you can join get the
              full-width pair, and the closed ones share a row of three with
              the card that asks for the next project. */}
          <div className="space-y-4">
            <div className="grid items-stretch gap-4 md:grid-cols-2">
              {OPEN_PROJECTS.map((project) => (
                <ProjectCard key={project.title} {...project} />
              ))}
            </div>
            <div className="grid items-stretch gap-4 md:grid-cols-3">
              {CLOSED_PROJECTS.map((project) => (
                <ProjectCard key={project.title} {...project} recessed />
              ))}
              <SuggestProjectCard />
            </div>
          </div>

          {/* No wrapper: `StreakCTA` returns null for most visitors, and
              Suspense renders no element of its own, so the section's spacing
              skips it entirely rather than leaving a gap. The CTA centers
              itself when it does render. */}
          <Suspense fallback={null}>{streakCta}</Suspense>
        </div>
      </section>
    </div>
  );
}
