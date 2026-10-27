import {
  EVENT_FORMATS,
  EventCard,
  FORMATS,
  staticBrandGraphics,
  type EventDetail,
  type Format,
} from "@devdogsuga/sdk/brand";
import { UsageError } from "@devdogsuga/cli-core/ui";
import type { ReactElement } from "react";

/**
 * What the club draws pictures OF, as opposed to what size it draws them at.
 *
 * Those are two axes and this file owns one of them; `@devdogsuga/sdk/brand`'s
 * `formats.ts` owns the other. Keeping them apart is the point: an event poster
 * for the GDG on Campus platform is the pairing "this meeting" x "that
 * platform's banner", and while they were one flat list of hard-coded
 * (content, size) targets, no such pairing could be asked for.
 *
 * The matrix is SPARSE, and each graphic declares its own column of it. Every
 * graphic supports the two GDG renditions, because anything the club makes may
 * end up on that platform. Beyond that: `savvycal` is one cover on one
 * scheduling page and belongs to the club lockup alone, the email densities
 * belong to the lockup too, and the icon sizes belong to the apps.
 *
 * There is no `page/*` group: the page cards render per request inside the
 * platform, which owns their copy. And nothing here knows a repository path;
 * every file is written where the caller asked, named by {@link Graphic.stem}.
 */

export interface Graphic {
  /** `group/name`, which is what the CLI matches and globs against. */
  name: string;
  group: "brand" | "app" | "event";
  /** The leaf. Unique across every graphic: `assertUniqueStems` enforces it. */
  stem: string;
  /** Format names this can be rendered at. */
  formats: string[];
  /** One line: what this picture is. */
  why: string;
  render: (format: Format) => ReactElement;
}

/**
 * What every meeting graphic (a night, or one workshop on it) is offered at:
 * `EVENT_FORMATS` in the SDK, shared with the console's graphics page.
 */
const EVENT_FORMAT_NAMES: string[] = [...EVENT_FORMATS];

/* ------------------------------------------------------------------- events */

/** A meeting, already loaded and formatted, ready to be drawn. */
export interface EventGraphicSource {
  slug: string;
  detail: EventDetail;
  /** For the picker's hint: when it is, and whether it is on. */
  hint: string;
  /** Separate cards generated only when the night contains multiple items. */
  items?: Array<{ detail: EventDetail; stem: string }>;
}

/**
 * One graphic per meeting, and one per agenda item when a night has several.
 *
 * These are the reason the two axes were split at all: "this meeting" x "the
 * GDG platform's banner" is a pairing nobody could have enumerated in advance.
 */
export function eventGraphics(events: EventGraphicSource[]): Graphic[] {
  return events.flatMap((event) => {
    const meeting: Graphic = {
      name: `event/${event.slug}/meeting`,
      group: "event",
      stem: event.slug,
      formats: EVENT_FORMAT_NAMES,
      why: `The ${event.slug} meeting: ${event.hint}.`,
      render: (format) =>
        EventCard({
          width: format.width,
          height: format.height,
          cobrand: true,
          ...event.detail,
        }),
    };

    if ((event.items?.length ?? 0) < 2) return [meeting];

    const occurrences = new Map<string, number>();
    const items = event.items!.map((item): Graphic => {
      const occurrence = (occurrences.get(item.stem) ?? 0) + 1;
      occurrences.set(item.stem, occurrence);
      const path = occurrence === 1 ? item.stem : `${item.stem}-${occurrence}`;

      return {
        name: `event/${event.slug}/${path}`,
        group: "event",
        // Output is flat, so the stem still carries the meeting.
        stem: `${event.slug}-${path}`,
        formats: EVENT_FORMAT_NAMES,
        why: `${item.detail.badge?.label ?? "Agenda item"}: ${item.detail.title} (${event.hint}).`,
        render: (format) =>
          EventCard({
            width: format.width,
            height: format.height,
            cobrand: true,
            ...item.detail,
          }),
      };
    });

    return [meeting, ...items];
  });
}

/* --------------------------------------------------------------------- all */

/** Everything that does not depend on the schedule. */
export function staticGraphics(): Graphic[] {
  return staticBrandGraphics();
}

/**
 * Every leaf is unique, so a flat output directory cannot silently overwrite
 * one graphic's file with another's.
 */
export function assertUniqueStems(graphics: Graphic[]): void {
  const seen = new Map<string, string>();

  for (const graphic of graphics) {
    const clash = seen.get(graphic.stem);
    if (clash) {
      throw new UsageError(
        `${graphic.name} and ${clash} share the leaf "${graphic.stem}", so a flat output directory would overwrite one with the other.`,
      );
    }
    seen.set(graphic.stem, graphic.name);
  }
}

export { FORMATS };
