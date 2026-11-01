import type { ComponentType } from "react";
import type { ProjectIconName } from "~/components/ProjectsSection/project-icons";
import {
  AppWindowIcon,
  DogDaysIcon,
  DogPackIcon,
  HouseIcon,
  MagnifyingGlassIcon,
} from "./icons";

/**
 * The registries a project's showcase fields name their look by.
 *
 * A project row stores an `iconKey` and a `colorKey`, never an SVG, a class or
 * a style, so nothing an officer types ever becomes markup or CSS. The key
 * lists below are the whole vocabulary: the `validate_project_showcase`
 * trigger (`supabase/schemas/platform/functions/validate_project_showcase.sql`)
 * refuses any other key at the database, `setProjectShowcase` refuses it
 * before that, and `showcaseKeys.test.ts` fails if the three drift apart. A key
 * that does get through anyway (a row written around the app) falls back to
 * {@link FALLBACK_ICON} and {@link FALLBACK_COLOR} rather than breaking a tile.
 *
 * Adding a key means adding it here, in the trigger and in a migration that
 * replaces the trigger function, in that order of review.
 */

/** What one icon key draws. */
export interface ShowcaseIcon {
  /** The glyph a switcher tile draws, bare, in the project's color. */
  Icon: ComponentType<{ className?: string; weight?: "fill" }>;
  /**
   * Draw the DevDogs mascot in place of {@link ShowcaseIcon.Icon}. For the
   * platform, whose mark is the club's logo (its favicon is the same).
   */
  logo?: true;
  /**
   * The mark the homepage card draws beside the title (`PROJECT_ICONS` in
   * `~/components/ProjectsSection/project-icons`). Absent draws none.
   */
  homeMark?: ProjectIconName;
}

/**
 * Icons by key. The Phosphor-style names (`DogDaysIcon`) are what the switcher
 * tile has always been configured with; the lowercase pair (`dogdays`) are what
 * the homepage card was configured with. They draw the same marks, so a
 * project may use either.
 */
export const SHOWCASE_ICONS = {
  HouseIcon: { Icon: HouseIcon, logo: true },
  DogDaysIcon: { Icon: DogDaysIcon, homeMark: "dogdays" },
  DogPackIcon: { Icon: DogPackIcon, homeMark: "dogpack" },
  MagnifyingGlassIcon: { Icon: MagnifyingGlassIcon },
  dogdays: { Icon: DogDaysIcon, homeMark: "dogdays" },
  dogpack: { Icon: DogPackIcon, homeMark: "dogpack" },
} as const satisfies Record<string, ShowcaseIcon>;

export type ShowcaseIconKey = keyof typeof SHOWCASE_ICONS;

/**
 * Colors by key, as the Tailwind text classes a glyph is tinted with. Full
 * literals so the class scanner sees them; the same bare filled glyph the docs
 * draw for a project (`DOCS_PROJECT_MARKS` in `~/config/docs`), so keep the two
 * in step.
 */
export const SHOWCASE_COLORS = {
  foreground: "text-foreground",
  "cyan-400": "text-cyan-400",
  "red-600": "text-red-600",
  "red-700": "text-red-700",
  "purple-500": "text-purple-500",
  "emerald-400": "text-emerald-400",
} as const;

export type ShowcaseColorKey = keyof typeof SHOWCASE_COLORS;

/** What a project with no usable `iconKey` draws: a generic app window. */
export const FALLBACK_ICON: ShowcaseIcon = { Icon: AppWindowIcon };

/** What a project with no usable `colorKey` is tinted with. */
export const FALLBACK_COLOR = SHOWCASE_COLORS.foreground;

/** Every icon key, for the action's validation. */
export const SHOWCASE_ICON_KEYS = Object.keys(SHOWCASE_ICONS) as [
  ShowcaseIconKey,
  ...ShowcaseIconKey[],
];

/** Every color key, for the action's validation. */
export const SHOWCASE_COLOR_KEYS = Object.keys(SHOWCASE_COLORS) as [
  ShowcaseColorKey,
  ...ShowcaseColorKey[],
];

/** Whether a stored string is a registered icon key. */
export function isShowcaseIconKey(key: string): key is ShowcaseIconKey {
  return Object.hasOwn(SHOWCASE_ICONS, key);
}

/** Whether a stored string is a registered color key. */
export function isShowcaseColorKey(key: string): key is ShowcaseColorKey {
  return Object.hasOwn(SHOWCASE_COLORS, key);
}

/** The icon a key names, or the generic one for an absent or unknown key. */
export function showcaseIcon(key: string | null): ShowcaseIcon {
  return key !== null && isShowcaseIconKey(key)
    ? SHOWCASE_ICONS[key]
    : FALLBACK_ICON;
}

/** The text class a key names, or the neutral one for an absent or unknown key. */
export function showcaseColor(key: string | null): string {
  return key !== null && isShowcaseColorKey(key)
    ? SHOWCASE_COLORS[key]
    : FALLBACK_COLOR;
}
