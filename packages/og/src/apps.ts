import { ACCENT } from "./brand.js";

export type AppKey = "platform" | "dogdays" | "dogpack";

export interface AppBrand {
  name: string;
  /** The four-word "what is it", as `config/projects.ts` writes it. */
  tagline: string;
  /** One sentence, for an Open Graph description. */
  blurb: string;
  /** Where the app lives, or the club site for the one that has no domain. */
  host: string;
  /**
   * The tile fill. Taken from each project's `switcher.iconBg`, which is the
   * colour the app switcher already identifies it by — so an icon on a phone
   * home screen matches the tile the member clicked to get there.
   */
  ground: string;
  /** The mark's colour when it is drawn on {@link AppBrand.ground}. */
  mark: string;
}

/**
 * The three apps that get icons, keyed the way the CLI names them.
 *
 * Copy is kept in step with `apps/platform/src/config/projects.ts`, which is
 * the club's own description of these and the one a member reads. Duplicated
 * rather than imported: this package cannot depend on the app it renders
 * images for, and inverting that (the app owning the copy, this package
 * importing it) would put a React component tree behind a CLI that only wants
 * three strings.
 */
export const APPS: Record<AppKey, AppBrand> = {
  platform: {
    name: "DevDogs",
    tagline: "Member Portal & Dev Tools",
    blurb:
      "DevDogs is a club at UGA devoted to bettering our community through open-source software.",
    host: "devdogsuga.org",
    ground: ACCENT.cyan400,
    // The mascot is full-colour artwork rather than a one-colour mark, so this
    // is the ink its outlines are already drawn in; nothing recolours it.
    mark: "#0a0a17",
  },
  dogdays: {
    name: "DogDays",
    tagline: "Schedule Builder",
    blurb:
      "Plan your semester against live UGA registrar data — conflict-free schedules weighing professor ratings, walking distance, and the credits you already have.",
    host: "dogdays.dev",
    ground: ACCENT.red400,
    mark: "#000000",
  },
  dogpack: {
    name: "DogPack",
    tagline: "Study Group Finder",
    blurb:
      "Find the people already studying what you're studying. Match with classmates by course, form a group, and pick a time that works.",
    host: "dogpack.dev",
    ground: ACCENT.purple400,
    mark: "#000000",
  },
};
