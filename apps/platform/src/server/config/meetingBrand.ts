import { getClubConfig } from "@devdogsuga/events";

/**
 * A meeting's brand (`devdogs` Cosmic, or `gdgc` Paper with the GDG cobrand),
 * as the config resolved it (the meeting's own, else its series').
 *
 * The platform's `meetings` table does not carry it: the brand picks artwork,
 * not behaviour, so it is read from the committed config by slug.
 */
export function meetingBrand(slug: string): "devdogs" | "gdgc" | undefined {
  return getClubConfig().meetings.find((meeting) => meeting.slug === slug)
    ?.brand;
}
