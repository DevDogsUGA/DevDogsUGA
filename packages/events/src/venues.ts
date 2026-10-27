import { z } from "zod";
import { CAMPUS_BUILDING_CODES, SERIES_ID_PATTERN } from "./schema.js";

/**
 * A venue: somewhere the club meets, authored once in `venues.json`. A meeting
 * (or its series) names a venue by id and a room inside it. The campus map's
 * ten buildings are venues with a `building` code; anything else is a venue
 * without one, so an unknown place can never silently become the DLW.
 */

export const VENUE_KINDS = ["campus", "offCampus", "virtual", "tba"] as const;

export type VenueKind = (typeof VENUE_KINDS)[number];

export const VENUE_NAME_MAX_LENGTH = 80;

/**
 * What an officer's walkthrough confirmed about getting in. Absent until
 * someone has walked it: nothing here is a guess, so an empty `verified` is
 * how the site knows not to claim a route.
 */
export const venueVerifiedSchema = z.strictObject({
  verifiedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .meta({ description: "The day the walkthrough happened." }),
  entrance: z.string().min(1).optional().meta({
    description: "Which door to use, in a sentence.",
  }),
  accessibleRoute: z.string().min(1).optional().meta({
    description: "The step-free route from the entrance to the room.",
  }),
  floorPlan: z.string().min(1).optional().meta({
    description: "A floor plan image path or URL.",
  }),
  notes: z.string().min(1).optional(),
});

export type VenueVerified = z.infer<typeof venueVerifiedSchema>;

export const venueSchema = z.strictObject({
  id: z.string().regex(SERIES_ID_PATTERN).meta({
    description:
      "The venue's identity; meetings and series reference it. Changing it detaches everything that names it.",
  }),
  kind: z.enum(VENUE_KINDS).meta({
    description:
      "campus (on the UGA campus), offCampus (needs an address), virtual (online), or tba (not decided yet).",
  }),
  name: z.string().min(1).max(VENUE_NAME_MAX_LENGTH).meta({
    description: 'How the place is named in full ("Dawson Hall").',
  }),
  shortName: z.string().min(1).max(VENUE_NAME_MAX_LENGTH).optional().meta({
    description:
      'What prints before a room number ("Dawson" in "Dawson 110"). Defaults to the name.',
  }),
  building: z.enum(CAMPUS_BUILDING_CODES).optional().meta({
    description:
      "The campus map building this venue is, for the ten the map draws. Campus venues only.",
  }),
  address: z.string().min(1).optional().meta({
    description:
      "A street address a maps app understands. Required off campus.",
  }),
  locality: z.string().min(1).optional().meta({
    description: 'The town, printed after an off-campus name ("Atlanta").',
  }),
  verified: venueVerifiedSchema.optional(),
});

export type Venue = z.infer<typeof venueSchema>;

export const venuesConfigSchema = z.strictObject({
  /** The editor's pointer to `venues.schema.json`; ignored otherwise. */
  $schema: z.string().optional(),
  venues: z.array(venueSchema),
});

export type VenuesConfig = z.infer<typeof venuesConfigSchema>;

/** A venue as one night uses it: the venue, plus the room inside it. */
export type ResolvedVenue = Venue & { room: string | null };

/**
 * The building column and the room line the platform has always stored,
 * derived from a venue and room so every page keeps printing what it printed.
 *
 *   - a campus-map building: its code, and the room alone ("DLW", "124");
 *   - other campus ground and online events: building `Other`, and the
 *     name with the room ("Dawson 110", "Virtual — Bevy (recorded)");
 *   - off campus and to-be-announced: no building ("Morehouse College, Atlanta").
 */
export function legacyPlace(
  venue: Venue,
  room: string | null,
): { building: CampusBuildingOrOther | null; location: string } {
  switch (venue.kind) {
    case "campus": {
      if (venue.building !== undefined) {
        return { building: venue.building, location: room ?? "TBA" };
      }
      const label = venue.shortName ?? venue.name;
      return {
        building: "Other",
        location: room === null ? venue.name : `${label} ${room}`,
      };
    }
    case "offCampus": {
      const label = room === null ? venue.name : `${venue.name} ${room}`;
      return {
        building: null,
        location:
          venue.locality === undefined ? label : `${label}, ${venue.locality}`,
      };
    }
    case "virtual":
      return {
        building: "Other",
        location: room === null ? venue.name : `${venue.name} — ${room}`,
      };
    case "tba":
      return { building: null, location: venue.name };
  }
}

type CampusBuildingOrOther = (typeof CAMPUS_BUILDING_CODES)[number] | "Other";
