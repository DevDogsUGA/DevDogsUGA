import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import ibm from "~/assets/ibm.gif";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
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
            <ProjectCard
              badge={{
                label: "In Progress",
                bg: "bg-cyan-400",
                text: "text-black",
              }}
              year="2025 – 2026"
              title="DogDays"
              tagline="Schedule Builder"
              titleColor="text-amber-700"
              description="Plan your semester against live UGA registrar data. Answer a short questionnaire, and DogDays generates conflict-free schedules — weighing professor ratings, walking distance between buildings, and the credits you already have."
              techStack={["Next.js", "Drizzle", "Supabase", "Cloudflare"]}
              githubUrl="https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/schedule-builder"
              shadow="shadow-block-lg shadow-amber-400"
            />
            <ProjectCard
              badge={{
                label: "In Design",
                bg: "bg-rose-400",
                text: "text-black",
              }}
              year="2025 – 2026"
              title="DogPack"
              tagline="Study Group Finder"
              titleColor="text-indigo-700"
              description="Our first mobile app: find the people already studying what you're studying. Match with classmates by course, form a group, and pick a time that works — built in Flutter for iOS and Android."
              techStack={["Flutter", "Dart", "Supabase", "PostgreSQL"]}
              githubUrl="https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/study-group-finder"
              shadow="shadow-block-lg shadow-indigo-400"
            />
            <ProjectCard
              badge={{
                label: "In Progress",
                bg: "bg-cyan-400",
                text: "text-black",
              }}
              year="2025 – 2026"
              title="DevDogs Platform"
              tagline="Member Portal & Dev Tools"
              titleColor="text-mauve-950"
              description="The site you're on. A member portal and developer platform for the club — profiles, contribution streaks, an OAuth server our other apps sign in against, and the tooling that runs DevDogs."
              techStack={["Next.js", "Drizzle", "Supabase", "Cloudflare"]}
              githubUrl="https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/platform"
              shadow="shadow-block-lg shadow-cyan-400"
            />
            <ProjectCard
              badge={{
                label: "Shipped",
                bg: "bg-amber-400",
                text: "text-black",
              }}
              year="2024 – 2025"
              title="Community Resource Forum"
              tagline="Athens Services Directory"
              titleColor="text-emerald-700"
              description="A searchable hub connecting Athens residents to local community services, events, and organizations. Built from concept to production by DevDogs in one academic year."
              techStack={["Next.js", "PostgreSQL", "Supabase", "Drizzle"]}
              githubUrl="https://github.com/DevDogs-UGA/Community-Resource-Forum"
              liveUrl="https://forum.devdogsuga.org"
              shadow="shadow-block-lg shadow-emerald-400"
            />
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <Suspense fallback={null}>{streakCta}</Suspense>
          </div>
        </div>
      </section>
    </div>
  );
}
