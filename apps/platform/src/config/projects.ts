/**
 * The DevDogs projects, shared by the homepage Projects section and the
 * fullscreen app switcher so both render the same cards from one source.
 *
 * Ordered by what someone can join today: DogDays, DogPack, the Platform,
 * then the shipped Community Resource Forum.
 */
export interface Project {
  badge: { label: string; bg: string; text: string };
  year: string;
  title: string;
  titleColor: string;
  /** The "what is it, in four words" line that sits under the title. */
  tagline: string;
  description: string;
  techStack?: string[];
  githubUrl?: string;
  liveUrl?: string;
  /** Block shadow used on the homepage; the overlay picks its own. */
  shadow?: string;
}

export const PROJECTS: Project[] = [
  {
    badge: { label: "In Progress", bg: "bg-cyan-400", text: "text-black" },
    year: "2025 – 2026",
    title: "DogDays",
    tagline: "Schedule Builder",
    titleColor: "text-amber-700",
    description:
      "Plan your semester against live UGA registrar data. Answer a short questionnaire, and DogDays generates conflict-free schedules — weighing professor ratings, walking distance between buildings, and the credits you already have.",
    techStack: ["Next.js", "Drizzle", "Supabase", "Cloudflare"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/schedule-builder",
    shadow: "shadow-block-lg shadow-amber-400",
  },
  {
    badge: { label: "In Design", bg: "bg-rose-400", text: "text-black" },
    year: "2025 – 2026",
    title: "DogPack",
    tagline: "Study Group Finder",
    titleColor: "text-indigo-700",
    description:
      "Our first mobile app: find the people already studying what you're studying. Match with classmates by course, form a group, and pick a time that works — built in Flutter for iOS and Android.",
    techStack: ["Flutter", "Dart", "Supabase", "PostgreSQL"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/study-group-finder",
    shadow: "shadow-block-lg shadow-indigo-400",
  },
  {
    badge: { label: "In Progress", bg: "bg-cyan-400", text: "text-black" },
    year: "2025 – 2026",
    title: "DevDogs Platform",
    tagline: "Member Portal & Dev Tools",
    titleColor: "text-mauve-950",
    description:
      "The site you're on. A member portal and developer platform for the club — profiles, contribution streaks, an OAuth server our other apps sign in against, and the tooling that runs DevDogs.",
    techStack: ["Next.js", "Drizzle", "Supabase", "Cloudflare"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/platform",
    shadow: "shadow-block-lg shadow-cyan-400",
  },
  {
    badge: { label: "Shipped", bg: "bg-amber-400", text: "text-black" },
    year: "2024 – 2025",
    title: "Community Resource Forum",
    tagline: "Athens Services Directory",
    titleColor: "text-emerald-700",
    description:
      "A searchable hub connecting Athens residents to local community services, events, and organizations. Built from concept to production by DevDogs in one academic year.",
    techStack: ["Next.js", "PostgreSQL", "Supabase", "Drizzle"],
    githubUrl: "https://github.com/DevDogs-UGA/Community-Resource-Forum",
    liveUrl: "https://forum.devdogsuga.org",
    shadow: "shadow-block-lg shadow-emerald-400",
  },
];
