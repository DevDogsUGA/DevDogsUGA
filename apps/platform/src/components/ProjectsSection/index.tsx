import { Suspense } from "react";
import Image from "next/image";
import ibm from "~/assets/ibm.gif";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import ProjectCard from "./ProjectCard";
import StreakCTA from "./StreakCTA";

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
}

export default function ProjectsSection({ topEdge, bottomEdge }: Props) {
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

          <div className="grid gap-4 md:grid-cols-2">
            <ProjectCard
              badge={{
                label: "Featured",
                bg: "bg-amber-400",
                text: "text-black",
              }}
              year="2024 – 2025"
              title="Community Resource Forum"
              titleColor="text-emerald-700"
              description="A searchable hub connecting Athens residents to local community services, events, and organizations. Built from concept to production by DevDogs in one academic year."
              techStack={["Next.js", "PostgreSQL", "Supabase", "Drizzle"]}
              githubUrl="https://github.com/DevDogs-UGA/Community-Resource-Forum"
              liveUrl="https://forum.devdogsuga.org"
              shadow="shadow-block-lg shadow-cyan-400"
            />
            <ProjectCard
              badge={{
                label: "In Progress",
                bg: "bg-cyan-400",
                text: "text-black",
              }}
              year="2025 – 2026"
              title="DevDogs Platform"
              titleColor="text-mauve-950"
              description="A member portal and developer platform for the DevDogs community — featuring profiles, leaderboards, OAuth, and the tools that run our club."
              joinCta={{
                text: "Want to contribute?",
                href: "/join",
                linkText: "Join DevDogs",
              }}
            />
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <Suspense fallback={null}>
              <StreakCTA />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  );
}
