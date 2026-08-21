import type * as icons from "./icons";
import type { TechKey } from "./tech";

/**
 * The DevDogs projects, shared by the homepage Projects section and the
 * fullscreen app switcher so both render from one source.
 *
 * The two surfaces show different amounts of it: the homepage cards carry the
 * full `description` and `techStack`, while the switcher lists projects as app
 * icons and shows only `icon`, `blurb`, the badge, and the links.
 *
 * Ordered by what someone can join today: the `"open"` projects lead, and the
 * `"closed"` ones follow, rendered recessed so they read as secondary without
 * needing a label to say so.
 */
export interface Project {
  badge: { label: string; bg: string; text: string };
  year: string;
  title: string;
  titleColor: string;
  /** The app icon, drawn on {@link iconBg} in the switcher. */
  icon: keyof typeof icons;
  /**
   * Fill behind {@link icon} — a solid, saturated background, since the
   * switcher tiles sit on black and the mark is drawn in black on top.
   */
  iconBg: string;
  /** The "what is it, in four words" line that sits under the title. */
  tagline: string;
  /**
   * One sentence, for the switcher tiles. The switcher is for picking a
   * project, not reading about one — the full pitch lives in `description`.
   */
  blurb: string;
  description: string;
  /**
   * Whether anyone can pick up an issue, or only a closed group can. Drives
   * how prominently the card renders — `"closed"` projects are real work worth
   * listing, but they are not what a prospective member should click first.
   */
  contributions: "open" | "closed";
  /** Why contributions are closed, or any other one-line caveat. */
  note?: string;
  techStack?: TechKey[];
  githubUrl?: string;
  /** A deployed site, with the label its button carries. */
  liveUrl?: { href: string; label: string };
  /** Block shadow override; each surface picks its own default. */
  shadow?: string;
}

/**
 * Where the "Suggest a Project" card sends people.
 *
 * TODO: set this to the idea-submission form once it exists. While it is null
 * the card renders its button disabled, so nothing links to a dead target.
 */
export const SUGGEST_PROJECT_FORM_URL: string | null = null;

export const PROJECTS: Project[] = [
  {
    badge: { label: "In Progress", bg: "bg-cyan-400", text: "text-black" },
    year: "2026 – 2027",
    title: "DogDays",
    icon: "CalendarDotsIcon",
    iconBg: "bg-red-400",
    tagline: "Schedule Builder",
    titleColor: "text-red-700",
    blurb: "Conflict-free semester schedules, built from live registrar data.",
    description:
      "Plan your semester against live UGA registrar data. Answer a short questionnaire, and DogDays generates conflict-free schedules — weighing professor ratings, walking distance between buildings, and the credits you already have.",
    contributions: "open",
    techStack: [
      "next",
      "typescript",
      "tailwind",
      "drizzle",
      "supabase",
      "postgres",
    ],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/schedule-builder",
    liveUrl: { href: "https://dogdays.dev", label: "Public Beta" },
  },
  {
    badge: { label: "In Progress", bg: "bg-cyan-400", text: "text-black" },
    year: "2026 – 2027",
    title: "DogPack",
    icon: "UsersIcon",
    iconBg: "bg-purple-400",
    tagline: "Study Group Finder",
    titleColor: "text-purple-700",
    blurb:
      "Find classmates already studying what you're studying, on iOS and Android.",
    description:
      "Our first mobile app: find the people already studying what you're studying. Match with classmates by course, form a group, and pick a time that works — built in Flutter for iOS and Android.",
    contributions: "open",
    techStack: ["flutter", "dart", "supabase", "postgres"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/study-group-finder",
  },
  {
    badge: { label: "Invite-Only", bg: "bg-amber-400", text: "text-black" },
    year: "2026 – 2027",
    title: "DevDogs Platform",
    icon: "HouseIcon",
    iconBg: "bg-cyan-400",
    tagline: "Member Portal & Dev Tools",
    titleColor: "text-mauve-950",
    blurb:
      "The site you're on — member portal, OAuth server, and club tooling.",
    description:
      "The site you're on. A member portal and developer platform for the club — profiles, contribution streaks, an OAuth server our other apps sign in against, and the tooling that runs DevDogs.",
    contributions: "closed",
    note: "Built and maintained by DevDogs officers.",
    techStack: [
      "next",
      "typescript",
      "tailwind",
      "drizzle",
      "supabase",
      "postgres",
    ],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/platform",
  },
  {
    badge: { label: "Paused", bg: "bg-mauve-300", text: "text-mauve-800" },
    year: "2025 – 2026",
    title: "Community Resource Forum",
    icon: "MagnifyingGlassIcon",
    iconBg: "bg-emerald-400",
    tagline: "Athens Services Directory",
    titleColor: "text-emerald-700",
    blurb: "A searchable directory of Athens community services and orgs.",
    description:
      "A searchable hub connecting Athens residents to local community services, events, and organizations. Development is paused before launch — the groundwork is built and waiting on a team to carry it the rest of the way.",
    contributions: "closed",
    techStack: ["next", "typescript", "drizzle", "supabase", "postgres"],
    githubUrl: "https://github.com/DevDogs-UGA/Community-Resource-Forum",
  },
];
