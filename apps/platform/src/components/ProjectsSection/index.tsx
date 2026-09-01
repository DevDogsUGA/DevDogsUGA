import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import { PROJECTS } from "~/config/projects";
import ProjectCard from "./ProjectCard";
import Link from "next/link";

const OPEN_PROJECTS = PROJECTS.filter((p) => p.contributions === "open");
const CLOSED_PROJECTS = PROJECTS.filter((p) => p.contributions === "closed");

export const PROJECTS_BLOBS: BlobDef[] = [
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

/* Parked, not deleted: the header is centered copy for now, with no room for
   the rotated diamond beside it. Uncommenting this and the call in the header
   brings it back, but it needs a picture and a `next/image` import first. The
   638 KB `ibm.gif` it used to point at was deleted rather than shipped to every
   visitor of a page that has not rendered it in months. Whatever replaces it
   should not be an animated GIF, which `next/image` cannot optimise and passes
   through whole.

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
}

export default function ProjectsSection({ topEdge, bottomEdge }: Props) {
  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="projects"
        // scroll-mt clears the h-16 sticky TopNav when a marquee card jumps
        // to #id, the same idea as `ui/card`. It is measured from the border
        // box, whose top is where pt-(--section-skew-slope) begins, so the
        // slanted top edge clears the nav too, not just the copy below it.
        className="relative w-full scroll-mt-20 overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#fffbeb"
          blobs={PROJECTS_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl space-y-16 px-6 py-12 md:px-12 md:py-16">
          <div className="mx-auto max-w-prose space-y-4 text-center text-balance">
            <h2 className="font-display mb-8 text-4xl font-extrabold text-black md:text-5xl">
              Projects
            </h2>
            <div className="mx-auto flex max-w-prose flex-col gap-5 text-base font-medium text-mauve-800 *:text-balance">
              <p>
                Every semester, DevDogs members collaborate across design,
                frontend, and backend to ship a product consumed by real users.
                Our projects are built by students, for students.
              </p>
              <p>
                We&rsquo;re committed to keeping all of our active projects free
                and open-source, and all of those projects live in a{" "}
                <Link
                  href="https://opensource.org/license/BSD-3-clause"
                  prefetch={false}
                  target="_blank"
                  className="underline hover:no-underline"
                >
                  BSD-licensed
                </Link>{" "}
                monorepo on GitHub.
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
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
