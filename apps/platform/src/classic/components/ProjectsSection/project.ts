import type { ComponentType } from "react";
import type * as icons from "~/config/icons";

import type { TechKey } from "~/classic/config/tech";

/** A status pill: what it says, and the colors it says it in. */
export interface Badge {
  label: string;
  /**
   * Drawn before the label. Optional because the switcher's pills answer
   * "where am I going" and read fine as words alone; the homepage cards carry
   * states you scan repeatedly down a grid, where a shape lands faster.
   */
  icon?: ComponentType<{ className?: string; weight?: "bold" }>;
  bg: string;
  text: string;
}

/**
 * How a project appears in the fullscreen switcher.
 *
 * The switcher answers "where can I go", while the homepage cards answer "what
 * can I join", so it carries its own badge and its own destination rather than
 * reusing the card's. A project can be wide open to contributions and still
 * have nothing to visit yet.
 */
export interface ProjectSwitcher {
  /** The app icon, drawn bare in {@link ProjectSwitcher.color}. */
  icon: keyof typeof icons;
  /**
   * Draw the DevDogs mascot in place of the icon. For the platform, whose
   * icon is the club's logo (its favicon is the same).
   */
  logo?: true;
  /**
   * The icon's color, a Tailwind text class: the same bare filled glyph the
   * docs draw for a project, so keep the two in step.
   */
  color: string;
  /**
   * What it is, in two or three words ("Schedule Builder"). The switcher is
   * for picking a project, not reading about one. The full pitch lives in
   * `description`.
   */
  blurb: string;
  /**
   * Where the tile navigates. Absent means there is nothing to visit yet, and
   * the tile renders disabled. Relative hrefs stay in-app and close the
   * overlay; absolute ones open in a new tab.
   */
  url?: string;
  /** Absent means no pill. */
  badge?: Badge;
}

/** Keys into PROJECT_ICONS: the marks drawn for the apps that have one. */
export type ProjectIconName = "dogdays" | "dogpack";

export interface Project {
  badge: Badge;
  /** Icon mark rendered beside the title, tinted by titleColor. */
  icon?: ProjectIconName;
  year: string;
  title: string;
  titleColor: string;
  /** The "what is it, in four words" line that sits under the title. */
  tagline: string;
  description: string;
  /**
   * Present for the projects the switcher lists as apps. Absent keeps a
   * project on the homepage but out of the switcher, which is a short list of
   * what DevDogs is building now rather than the whole back catalogue.
   */
  switcher?: ProjectSwitcher;
  /**
   * Whether anyone can pick up an issue, or only a closed group can. Drives
   * how prominently the card renders: `"closed"` projects are real work worth
   * listing, but not what a prospective member should click first.
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
