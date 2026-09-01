import {
  APPS,
  AppIcon,
  type AppKey,
  Banner,
  EmailSignature,
  EventCard,
  type EventDetail,
  type Format,
  OPAQUE_FORMATS,
  PAGE_CARDS,
  PageCard,
  THEME,
} from "@devdogsuga/og";
import type { ReactElement } from "react";

/**
 * What the club draws pictures OF, as opposed to what size it draws them at.
 *
 * Those are two axes and this file owns one of them; `@devdogsuga/og`'s
 * `formats.ts` owns the other. Keeping them apart is the point: an event poster
 * for the GDG on Campus platform is the pairing "this meeting" x "that
 * platform's banner", and while they were one flat list of hard-coded
 * (content, size) targets, no such pairing could be asked for — only the ones
 * somebody had already written down existed.
 *
 * The matrix is SPARSE, and each graphic declares its own column of it. Every
 * graphic supports the two GDG renditions, because anything the club makes may
 * end up on that platform. Beyond that: `savvycal` is one cover on one
 * scheduling page and belongs to the club lockup alone, the email densities
 * belong to the lockup too, and the icon sizes belong to the apps.
 */

/** Where a rendered file goes, relative to the repo root. */
export interface Destination {
  dir: string;
  file: string;
}

export interface Graphic {
  /** `group/name`, which is what the CLI matches and globs against. */
  name: string;
  group: string;
  /** The leaf. Unique across every graphic — `assertUniqueStems` enforces it. */
  stem: string;
  /** Format names this can be rendered at. */
  formats: string[];
  /** One line: what this picture is. */
  why: string;
  render: (format: Format) => ReactElement;
  /** Where `--default-out` puts it. */
  destination: (format: Format) => Destination;
}

const BRAND = "apps/platform/public/brand";

/** The two renditions anything may need, because anything may reach the GDG platform. */
const GDG = ["gdgc-wide", "gdgc-square"];
const EMAIL = ["email-1x", "email-2x", "email-3x"];

/* ------------------------------------------------------------------- brand */

/**
 * The club lockup, on each of the two grounds it is ever set on.
 *
 * One subject, two grounds, and the rendition decides which template draws it:
 * the email densities want the signature's tight horizontal strip, everything
 * else wants the banner. That is why "the email signature" is not a graphic of
 * its own — it is this lockup at `email-2x`, and its GDG export is the same
 * lockup at `gdgc-square` rather than a second drawing that has to be kept in
 * step with the first.
 */
function brandGraphics(): Graphic[] {
  return (["dark", "light"] as const).map((ground) => ({
    name: ground === "dark" ? "brand/club" : "brand/club-light",
    group: "brand",
    stem: ground === "dark" ? "club" : "club-light",
    formats: [
      "og",
      ...GDG,
      ...(ground === "dark" ? ["savvycal"] : []),
      ...EMAIL,
    ],
    why: `The DevDogs lockup with the GDG chapter cobrand, on a ${ground} ground.`,
    render: (format) =>
      format.family === "email"
        ? EmailSignature({ width: format.width, ground })
        : Banner({ width: format.width, height: format.height, ground }),
    destination: (format) => ({
      dir: format.family === "email" ? `${BRAND}/email` : `${BRAND}/banners`,
      file:
        format.family === "email"
          ? `signature-${ground}${format.scale > 1 ? `@${format.scale}x` : ""}.png`
          : `club-${ground === "dark" ? "" : "light-"}${format.name}.png`,
    }),
  }));
}

/* -------------------------------------------------------------------- pages */

/**
 * One graphic per public page, keyed by the route it belongs to.
 *
 * The platform renders these live from `opengraph-image.tsx`, so the files
 * written here are for looking at — an Open Graph card is otherwise only
 * visible by deploying and pasting a link somewhere, which is a slow way to
 * find out that a title wrapped badly.
 */
function pageGraphics(): Graphic[] {
  return Object.entries(PAGE_CARDS).map(([route, copy]) => {
    const stem = route === "/" ? "home" : route.slice(1).replace(/\//g, "-");

    return {
      name: `page/${stem}`,
      group: "page",
      stem,
      formats: ["og", ...GDG],
      why: `The card ${route} unfurls as.`,
      render: (format) =>
        PageCard({ width: format.width, height: format.height, ...copy }),
      // The format is in the filename, not just the directory: `og` and
      // `gdgc-square` are the same page at two sizes, and without it the second
      // silently overwrites the first.
      destination: (format) => ({
        dir: `${BRAND}/og`,
        file: `${stem}-${format.name}.png`,
      }),
    };
  });
}

/* --------------------------------------------------------------------- apps */

/** Which app's icons go where, and which of them Next serves by convention. */
const APP_HOME: Record<AppKey, { icons: string; app?: string }> = {
  platform: { icons: `${BRAND}/icons`, app: "apps/platform/src/app" },
  dogdays: {
    icons: "apps/schedule-builder/public/icons",
    app: "apps/schedule-builder/src/app",
  },
  // Flutter, and nothing deployed yet, so its icons wait in the club's own
  // brand folder rather than in an app directory that does not exist.
  dogpack: { icons: `${BRAND}/icons` },
};

function appGraphics(): Graphic[] {
  return (Object.keys(APPS) as AppKey[]).map((app) => {
    const home = APP_HOME[app];
    const sizes = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024];

    return {
      name: `app/${app}`,
      group: "app",
      stem: app,
      formats: [
        ...sizes.map((size) => `icon-${size}`),
        ...(home.app ? ["icon-favicon", "icon-apple"] : []),
        "og",
        ...GDG,
      ],
      why: `${APPS[app].name} — its mark as an icon, and its card as a link.`,
      render: (format) =>
        format.family === "icon"
          ? AppIcon({
              app,
              size: format.width,
              background: OPAQUE_FORMATS.has(format.name)
                ? THEME.background
                : undefined,
            })
          : PageCard({
              width: format.width,
              height: format.height,
              title: APPS[app].name,
              description: APPS[app].blurb,
              eyebrow: APPS[app].tagline,
              accent: APPS[app].ground,
              footer: APPS[app].host,
            }),
      destination: (format) => {
        // The two Next reads by name, which have to land in `src/app` under
        // exactly those filenames or the framework does not see them.
        if (home.app && format.name === "icon-favicon") {
          return { dir: home.app, file: "icon.png" };
        }
        if (home.app && format.name === "icon-apple") {
          return { dir: home.app, file: "apple-icon.png" };
        }
        // The platform serves its own link cards per request, so only the apps
        // WITHOUT a live renderer get a static `opengraph-image.png`.
        if (home.app && app !== "platform" && format.name === "og") {
          return { dir: home.app, file: "opengraph-image.png" };
        }

        return format.family === "icon"
          ? {
              dir: home.icons,
              file: `${app}-${format.name.replace("icon-", "")}.png`,
            }
          : { dir: `${BRAND}/og`, file: `app-${app}-${format.name}.png` };
      },
    };
  });
}

/* ------------------------------------------------------------------- events */

/** A meeting, already loaded and formatted, ready to be drawn. */
export interface EventGraphicSource {
  slug: string;
  detail: EventDetail;
  /** For the picker's hint: when it is, and whether it is on. */
  hint: string;
}

/**
 * One graphic per meeting.
 *
 * These are the reason the two axes were split at all: "this meeting" x "the
 * GDG platform's banner" is a pairing nobody could have enumerated in advance.
 *
 * Their default directory is the one that is NOT in the repo. Every other
 * graphic is a committed asset the club re-renders; an event poster is an
 * export headed somewhere else, made once for one night. Writing those into
 * `public/brand` would fill a tracked directory with a growing pile of
 * one-offs, so they go to {@link EVENT_SCRATCH_DIR}, which `.gitignore` covers.
 */
export const EVENT_SCRATCH_DIR = ".images/events";

export function eventGraphics(events: EventGraphicSource[]): Graphic[] {
  return events.map((event) => ({
    name: `event/${event.slug}`,
    group: "event",
    stem: event.slug,
    formats: ["og", ...GDG],
    why: `The ${event.slug} meeting — ${event.hint}.`,
    render: (format) =>
      EventCard({
        width: format.width,
        height: format.height,
        ...event.detail,
      }),
    destination: (format) => ({
      dir: EVENT_SCRATCH_DIR,
      file: `${event.slug}-${format.name}.png`,
    }),
  }));
}

/* --------------------------------------------------------------------- all */

/** Everything that does not need a database. */
export function staticGraphics(): Graphic[] {
  return [...brandGraphics(), ...pageGraphics(), ...appGraphics()];
}

/**
 * Every leaf is unique, so a flat `--out` directory cannot silently overwrite
 * one graphic's file with another's.
 */
export function assertUniqueStems(graphics: Graphic[]): void {
  const seen = new Map<string, string>();

  for (const graphic of graphics) {
    const clash = seen.get(graphic.stem);
    if (clash) {
      throw new Error(
        `${graphic.name} and ${clash} share the leaf "${graphic.stem}", so a flat --out would overwrite one with the other.`,
      );
    }
    seen.set(graphic.stem, graphic.name);
  }
}
