import type { TechKey } from "./tech";

/**
 * The DevDogs projects, shared by the homepage Projects section and the
 * fullscreen app switcher so both render the same cards from one source.
 *
 * Ordered by what someone can join today: DogDays, DogPack, the Platform, then
 * the paused Community Resource Forum.
 */
export interface Project {
  badge: { label: string; bg: string; text: string };
  year: string;
  title: string;
  titleColor: string;
  /** The "what is it, in four words" line that sits under the title. */
  tagline: string;
  description: string;
  /** Who can contribute, when that is not simply "anyone who shows up". */
  note?: string;
  techStack?: TechKey[];
  githubUrl?: string;
  /** A deployed site, with the label its button carries. */
  liveUrl?: { href: string; label: string };
  /** Block shadow used on the homepage; the overlay picks its own. */
  shadow?: string;
}

export const PROJECTS: Project[] = [
  {
    badge: { label: "In Progress", bg: "bg-cyan-400", text: "text-black" },
    year: "2026 – 2027",
    title: "DogDays",
    tagline: "Schedule Builder",
    titleColor: "text-amber-700",
    description:
      "Plan your semester against live UGA registrar data. Answer a short questionnaire, and DogDays generates conflict-free schedules — weighing professor ratings, walking distance between buildings, and the credits you already have.",
    techStack: ["next", "typescript", "tailwind", "drizzle", "supabase"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/schedule-builder",
    liveUrl: { href: "https://dogdays.dev", label: "Public Beta" },
  },
  {
    badge: { label: "In Design", bg: "bg-rose-400", text: "text-black" },
    year: "2026 – 2027",
    title: "DogPack",
    tagline: "Study Group Finder",
    titleColor: "text-indigo-700",
    description:
      "Our first mobile app: find the people already studying what you're studying. Match with classmates by course, form a group, and pick a time that works — built in Flutter for iOS and Android.",
    techStack: ["flutter", "dart", "supabase", "postgres"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/study-group-finder",
  },
  {
    badge: { label: "In Progress", bg: "bg-cyan-400", text: "text-black" },
    year: "2026 – 2027",
    title: "DevDogs Platform",
    tagline: "Member Portal & Dev Tools",
    titleColor: "text-mauve-950",
    description:
      "The site you're on. A member portal and developer platform for the club — profiles, contribution streaks, an OAuth server our other apps sign in against, and the tooling that runs DevDogs.",
    note: "Built and maintained by DevDogs officers.",
    techStack: ["next", "typescript", "tailwind", "drizzle", "supabase"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/platform",
  },
  {
    badge: { label: "Paused", bg: "bg-mauve-300", text: "text-mauve-800" },
    year: "2025 – 2026",
    title: "Community Resource Forum",
    tagline: "Athens Services Directory",
    titleColor: "text-emerald-700",
    description:
      "A searchable hub connecting Athens residents to local community services, events, and organizations. Development is paused before launch — the groundwork is built and waiting on a team to carry it the rest of the way.",
    techStack: ["next", "typescript", "drizzle", "supabase", "postgres"],
    githubUrl: "https://github.com/DevDogs-UGA/Community-Resource-Forum",
  },
];
