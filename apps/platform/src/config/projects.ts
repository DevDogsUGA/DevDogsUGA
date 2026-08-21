import type { ComponentType } from "react";
import type * as icons from "./icons";
import { PauseIcon, PlayIcon, WrenchIcon } from "./icons";
import type { TechKey } from "./tech";

/** A status pill: what it says, and the colors it says it in. */
export interface Badge {
  label: string;
  /**
   * Drawn before the label. Optional because the switcher's pills answer
   * "where am I going" and read fine as words alone; the homepage cards carry
   * states you scan repeatedly down a grid, where a shape lands faster.
   */
  icon?: ComponentType<{ className?: string }>;
  bg: string;
  text: string;
}

/**
 * How a project appears in the fullscreen switcher.
 *
 * The switcher answers "where can I go", while the homepage cards answer "what
 * can I join" — so it carries its own badge and its own destination rather than
 * reusing the card's. A project can be wide open to contributions and still
 * have nothing to visit yet.
 */
export interface ProjectSwitcher {
  /** The app icon, drawn on {@link ProjectSwitcher.iconBg}. */
  icon: keyof typeof icons;
  /**
   * Fill behind the icon — a solid, saturated background, since the tiles sit
   * on black and the mark is drawn in black on top.
   */
  iconBg: string;
  /**
   * One sentence. The switcher is for picking a project, not reading about
   * one — the full pitch lives in `description`.
   */
  blurb: string;
  /**
   * Where the tile navigates. Absent means there is nothing to visit yet, and
   * the tile renders disabled. Relative hrefs stay in-app and close the
   * overlay; absolute ones open in a new tab.
   */
  url?: string;
  /** Absent means no pill. Every project carries one today. */
  badge?: Badge;
}

/**
 * The DevDogs projects, shared by the homepage Projects section and the
 * fullscreen app switcher so both render from one source.
 *
 * The two surfaces show different amounts of it: the homepage cards carry the
 * full `description`, `techStack`, and repo links, while the switcher shows
 * only what {@link ProjectSwitcher} holds.
 *
 * Array order is the switcher's order — the platform you are standing in
 * first, then the apps by how far along they are. The homepage regroups these
 * by `contributions` instead, so reordering here leaves it untouched.
 */
export interface Project {
  badge: Badge;
  year: string;
  title: string;
  titleColor: string;
  /** The "what is it, in four words" line that sits under the title. */
  tagline: string;
  description: string;
  switcher: ProjectSwitcher;
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

export const PROJECTS: Project[] = [
  {
    badge: MAINTENANCE,
    year: "2026 – present",
    title: "DevDogs Platform",
    tagline: "Member Portal & Dev Tools",
    titleColor: "text-mauve-950",
    description:
      "The site you're on. A member portal and developer platform for the club — profiles, contribution streaks, an OAuth server our other apps sign in against, and the tooling that runs DevDogs.",
    switcher: {
      icon: "HouseIcon",
      iconBg: "bg-cyan-400",
      blurb:
        "The site you're on — member portal, OAuth server, and club tooling.",
      url: "/",
      // Where you are standing, rather than how far along it is — the one
      // tile in the switcher whose badge answers a different question.
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
    title: "DogDays",
    tagline: "Schedule Builder",
    titleColor: "text-red-700",
    description:
      "Plan your semester against live UGA registrar data. Answer a short questionnaire, and DogDays generates conflict-free schedules — weighing professor ratings, walking distance between buildings, and the credits you already have.",
    switcher: {
      icon: "CalendarDotsIcon",
      iconBg: "bg-red-400",
      blurb:
        "Conflict-free semester schedules, built from live registrar data.",
      url: "https://dogdays.dev",
      badge: { label: "Public Beta", bg: "bg-emerald-400", text: "text-black" },
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
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/schedule-builder",
    liveUrl: { href: "https://dogdays.dev", label: "Public Beta" },
  },
  {
    badge: ACTIVE,
    year: "2026 – present",
    title: "DogPack",
    tagline: "Study Group Finder",
    titleColor: "text-purple-700",
    description:
      "Our first mobile app: find the people already studying what you're studying. Match with classmates by course, form a group, and pick a time that works — built in Flutter for iOS and Android.",
    switcher: {
      icon: "UsersIcon",
      iconBg: "bg-purple-400",
      blurb:
        "Find classmates already studying what you're studying, on iOS and Android.",
      // No `url`: there is nothing shipped to open yet.
      badge: { label: "In Development", bg: "bg-cyan-400", text: "text-black" },
    },
    contributions: "open",
    techStack: ["flutter", "dart", "supabase", "postgres"],
    githubUrl:
      "https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/study-group-finder",
  },
  {
    badge: PAUSED,
    year: "2025 – 2026",
    title: "Community Resource Forum",
    tagline: "Athens Services Directory",
    titleColor: "text-emerald-700",
    description:
      "A searchable hub connecting Athens residents to local community services, events, and organizations. Development is paused before launch — the groundwork is built and waiting on a team to carry it the rest of the way.",
    switcher: {
      icon: "MagnifyingGlassIcon",
      iconBg: "bg-emerald-400",
      blurb: "A searchable directory of Athens community services and orgs.",
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
    titleColor: "text-sky-700",
    description:
      "A native Android app for riding UGA transit: buses moving on the map in real time, and arrival times for the stop you are actually standing at. Development is paused, and the source was never published.",
    switcher: {
      icon: "BusIcon",
      iconBg: "bg-sky-400",
      blurb: "Live UGA bus positions and arrival times, on Android.",
      // No `url`, and no `githubUrl` either: nothing of this one shipped.
      badge: PAUSED,
    },
    contributions: "closed",
    // The only project here predating the shared Supabase project, hence its
    // own database and no Postgres.
    techStack: ["android", "kotlin", "java", "spring", "mysql", "maps"],
  },
];
