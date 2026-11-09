import type {
  Badge,
  Project,
  ProjectSwitcher,
} from "~/classic/components/ProjectsSection/project";
import { PauseIcon, PlayIcon, WrenchIcon } from "~/config/icons";

/*
 * TEMPORARY (Sloan, 2026-11-09). This is the pre-Cosmic hard-coded project list,
 * restored as-is for the rollback. It does not match the database's project
 * showcase (`~/server/projects/showcase`), which the Cosmic design reads and
 * which today holds only DevDogs Platform, DogDays and DogPack, with different
 * status labels. The homepage Projects section, the app switcher and the footer
 * read this file until Cosmic returns; then delete it and go back to the
 * showcase. Edit the database, not this file, for anything meant to outlast the
 * rollback.
 */

/** Shipping now, and open to whoever shows up. */
const ACTIVE: Badge = {
  label: "Active",
  icon: PlayIcon,
  bg: "bg-cyan-400",
  text: "text-black",
};

/** Still running, but only its owners touch it. */
const MAINTENANCE: Badge = {
  label: "Maintenance",
  icon: WrenchIcon,
  bg: "bg-amber-400",
  text: "text-black",
};

/** Stopped, with the work left where it stands. */
const PAUSED: Badge = {
  label: "Paused",
  icon: PauseIcon,
  bg: "bg-mauve-300",
  text: "text-mauve-800",
};

/**
 * The DevDogs projects, shared by the homepage Projects section and the
 * fullscreen app switcher so both render from one source.
 *
 * The two show different amounts of it: the homepage cards carry the full
 * `description`, `techStack`, and repo links, while the switcher shows only
 * what {@link ProjectSwitcher} holds.
 *
 * Array order is the switcher's order: the platform you are standing in first,
 * then the apps by how far along they are. The homepage regroups these by
 * `contributions`, so reordering here leaves it untouched.
 */
export const PROJECTS: Project[] = [
  {
    badge: MAINTENANCE,
    year: "2026 – present",
    title: "DevDogs Platform",
    tagline: "Member Portal and Dev Tools",
    titleColor: "text-mauve-950",
    description:
      "The site you're on. A member portal and developer platform for the club: community profiles, documentation, and all the tooling that runs DevDogs.",
    switcher: {
      icon: "HouseIcon",
      color: "text-cyan-400",
      logo: true,
      blurb: "Member Portal",
      url: "/",
      // Where you are standing, rather than how far along it is. The one tile
      // in the switcher whose badge answers a different question.
      badge: { label: "You are Here", bg: "bg-amber-400", text: "text-black" },
    },
    contributions: "closed",
    techStack: [
      "next",
      "typescript",
      "tailwind",
      "drizzle",
      "supabase",
      "postgres",
    ],
  },
  {
    badge: ACTIVE,
    year: "2024 – present",
    icon: "dogdays",
    title: "DogDays",
    tagline: "Schedule Builder",
    titleColor: "text-red-700",
    description:
      "Plan your semester against live UGA registrar data. Answer a short questionnaire, and DogDays generates conflict-free schedules, considering walking distance between buildings and the credits you already have.",
    switcher: {
      icon: "DogDaysIcon",
      color: "text-red-600",
      blurb: "Schedule Builder",
      url: "https://dogdays.dev",
      badge: {
        label: "Public Alpha",
        bg: "bg-emerald-400",
        text: "text-black",
      },
    },
    contributions: "open",
    techStack: [
      "next",
      "typescript",
      "tailwind",
      "drizzle",
      "supabase",
      "postgres",
    ],
    githubUrl: "https://github.com/DevDogsUGA/DogDays",
    liveUrl: { href: "https://dogdays.dev", label: "Public Alpha" },
  },
  {
    badge: ACTIVE,
    year: "2026 – present",
    icon: "dogpack",
    title: "DogPack",
    tagline: "Study Group Finder",
    titleColor: "text-purple-700",
    description:
      "Our first mobile app: find the people already studying what you're studying. Match with classmates by course, form a group, and pick a time and place that works for everyone!",
    switcher: {
      icon: "DogPackIcon",
      color: "text-purple-500",
      blurb: "Study Group Finder",
      // No `url`: there is nothing shipped to open yet.
      badge: { label: "In Development", bg: "bg-cyan-400", text: "text-black" },
    },
    contributions: "open",
    techStack: ["flutter", "dart", "supabase", "postgres"],
    githubUrl: "https://github.com/DevDogsUGA/DogPack",
  },
  {
    badge: PAUSED,
    year: "2025 – 2026",
    title: "Wuphf",
    tagline: "Community Resource Forum",
    titleColor: "text-mauve-950",
    description:
      "A searchable hub connecting UGA students to resources for academic support, campus involvement, and career development. Contributions were paused to due greater interest in other projects.",
    switcher: {
      icon: "MagnifyingGlassIcon",
      color: "text-emerald-400",
      blurb: "Community Directory",
      // No `url`: paused before it ever launched.
      badge: { label: "Paused", bg: "bg-mauve-300", text: "text-mauve-800" },
    },
    contributions: "closed",
    techStack: ["next", "typescript", "drizzle", "supabase", "postgres"],
  },
  {
    badge: PAUSED,
    year: "2023 – 2024",
    title: "Better Bus Tracker",
    tagline: "Campus Transit, Live",
    titleColor: "text-mauve-950",
    description:
      "A native Android app for riding UGA transit: buses moving on the map in real time, and arrival times for the stop you are actually standing at. Contributions were paused to due greater interest in other projects.",
    // No `switcher`: nothing of this one shipped and nothing is being built,
    // so it stays on the homepage as history and off the switcher.
    contributions: "closed",
    // The only project here predating the shared Supabase project, hence its
    // own database and no Postgres.
    techStack: ["android", "kotlin", "java", "spring", "mysql", "maps"],
  },
];

/** A project the switcher lists, meaning one with a `switcher` block. */
export type SwitcherProject = Project & { switcher: ProjectSwitcher };

/** The projects the fullscreen switcher shows as apps, in array order. */
export const SWITCHER_PROJECTS = PROJECTS.filter(
  (project): project is SwitcherProject => project.switcher !== undefined,
);
