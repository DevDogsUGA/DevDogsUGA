import {
  EVENT_SEGMENT_VISUALS,
  meetingCardDetail,
  meetingLocation,
  workshopCardDetail,
} from "@devdogsuga/sdk/brand/event";
import { getClubConfig, type Workshop } from "@devdogsuga/events";
import type { EventGraphicSource } from "./registry.js";

/**
 * Meetings, for the one group of graphics that cannot be drawn from files
 * alone.
 *
 * Every other graphic is a function of the brand package. An event poster is a
 * function of the club's meetings, which `@devdogsuga/events` publishes as its
 * committed config, so reading it directly needs no checkout, no database and
 * no running stack. {@link EventReader} is the seam the command talks to, so
 * tests never read the real schedule.
 */

/** The seam the command talks to, so tests never read the real schedule. */
export interface EventReader {
  meetings(): Promise<EventGraphicSource[]>;
}

/**
 * Builds the reader from `@devdogsuga/events`'s committed data file.
 *
 * `Meeting.slug` is the card's `slug` (its platform URL) and `Meeting.title` is
 * its resolved title (series applied; `nameOverride` on the platform's meetings
 * table), so a poster can never name a night differently from the site.
 */
export function configEvents(): EventReader {
  return {
    async meetings() {
      // Newest first: the picker should offer the most recent meeting first,
      // not whatever order the config file happens to list them in.
      const meetings = [...getClubConfig().meetings].sort(
        (a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt),
      );

      return meetings.map((row) => {
        const meeting = {
          slug: row.slug,
          startsAt: new Date(row.startsAt),
          endsAt: new Date(row.endsAt),
          building: row.building,
          location: row.location,
          category: row.category,
          brand: row.brand,
          kicker: row.kicker,
          cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : null,
          cancellationReason: row.cancellationReason,
        };

        // No competitions: a competition is a mirrored GitHub issue, not
        // config a meeting kicks off. Every agenda item is plain "workshop".
        const items: Array<{
          label: string;
          segment: keyof typeof EVENT_SEGMENT_VISUALS;
        }> = row.agenda.map((workshop) => ({
          label: workshopLabel(workshop),
          segment: "workshop",
        }));

        const detail = meetingCardDetail({
          meeting,
          title: row.title,
          agenda: items.map(
            (item) =>
              `${EVENT_SEGMENT_VISUALS[item.segment].label}: ${item.label}`,
          ),
          location: meetingLocation(row.building, row.location),
        });

        return {
          slug: row.slug,
          hint: describeMeeting(meeting),
          detail,
          items: items.map((item) => ({
            stem: slugPart(item.label),
            detail: workshopCardDetail(detail, item.label),
          })),
        };
      });
    },
  };
}

/** A readable path component for a workshop card. */
function slugPart(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agenda-item"
  );
}

/** `Workshop.title` is non-nullable in the config schema (`workshopSchema`). */
function workshopLabel(row: Workshop): string {
  return row.title;
}

/** One line for the picker: when it is, and whether it is still on. */
function describeMeeting(meeting: {
  startsAt: Date;
  cancelledAt: Date | null;
}): string {
  const when = meeting.startsAt.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
  });

  return meeting.cancelledAt === null ? when : `${when}, cancelled`;
}
