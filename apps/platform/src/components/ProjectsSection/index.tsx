import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import ibm from "~/assets/ibm.gif";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import { PROJECTS } from "~/config/projects";
import ProjectCard from "./ProjectCard";

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

function RotatedImage() {
  return (
    <div className="@container-[size] flex grow items-center justify-center drop-shadow-[12px_0px_0_var(--color-mauve-800)]">
      <div className="relative -ml-12 size-[calc(100cqh/sqrt(2))] rotate-45 overflow-hidden rounded-sm border-2 border-black">
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
        <div className="relative z-10 mx-auto max-w-6xl space-y-16 px-12 py-12 md:py-16">
          <div className="-mt-12 flex">
            <div className="max-w-prose space-y-4 pt-12 text-left text-balance">
              <h2 className="font-display mb-8 text-4xl font-extrabold text-black md:text-5xl">
                Projects
              </h2>
              <div className="mx-auto flex max-w-2xl flex-col gap-3 text-base/relaxed text-mauve-700">
                <p>
                  At DevDogs, every project is a real product built for real
                  users — not a toy app or a class assignment.
                </p>
                <p>
                  Each semester, members collaborate across design, engineering,
                  and product to ship something that matters.
                </p>
              </div>
            </div>
            <RotatedImage />
          </div>

          <div className="grid items-stretch gap-4 md:grid-cols-2">
            {PROJECTS.map((project) => (
              <ProjectCard key={project.title} {...project} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <Suspense fallback={null}>{streakCta}</Suspense>
          </div>
        </div>
      </section>
    </div>
  );
}
