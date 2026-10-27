import { getClubConfig, getVenues, type Venue } from "@devdogsuga/events";
import { isMappedBuilding } from "./buildings";
import { UNKNOWN_PLACE, USUAL_VENUE_ID, type Place } from "./place";

/**
 * Turns the ids and strings a meeting row or a pasted link carries into a
 * {@link Place}, against the venue catalog. Server-side: it reads
 * `venues.json` and `meetings.json` (the join link has no database column
 * yet), so client components take the finished `Place` as a prop instead.
 *
 * Nothing here falls back to a default venue. An id, building or room that
 * does not resolve is {@link UNKNOWN_PLACE}.
 */

/** The usual room at the usual venue, for a link that names nothing at all. */
export const USUAL_ROOM = "124";

const ROOM_MAX_LENGTH = 40;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function venueById(id: string): Venue | undefined {
  return getVenues().venues.find((venue) => venue.id === id);
}

export function venueForBuilding(building: string): Venue | undefined {
  return getVenues().venues.find(
    (venue) => venue.kind === "campus" && venue.building === building,
  );
}

function joinUrlOf(slug: string): string | null {
  return (
    getClubConfig().meetings.find((meeting) => meeting.slug === slug)
      ?.joinUrl ?? null
  );
}

/** The columns of a meeting row that say where it is. */
export interface MeetingPlaceSource {
  slug: string;
  venue: string | null;
  room: string | null;
  building: string | null;
  location: string | null;
}

/**
 * Where a meeting is. A row reconcile has rewritten names its venue; an older
 * row has only the building and room line, which still identify the ten
 * mapped buildings. Anything else on an old row is unknown rather than
 * guessed.
 */
export function placeOfMeeting(meeting: MeetingPlaceSource): Place {
  if (meeting.venue !== null) {
    const venue = venueById(meeting.venue);
    return venue === undefined
      ? UNKNOWN_PLACE
      : {
          state: "known",
          venue,
          room: meeting.room,
          joinUrl: joinUrlOf(meeting.slug),
        };
  }
  if (meeting.building !== null && isMappedBuilding(meeting.building)) {
    const venue = venueForBuilding(meeting.building);
    if (venue !== undefined) {
      return {
        state: "known",
        venue,
        room: meeting.location,
        joinUrl: null,
      };
    }
  }
  return UNKNOWN_PLACE;
}

type Param = string | string[] | null | undefined;

const present = (value: Param): boolean =>
  value !== undefined && value !== null;

const INVALID = Symbol("invalid room");

function cleanRoom(value: Param): string | null | typeof INVALID {
  if (!present(value)) return null;
  if (typeof value !== "string") return INVALID;
  const room = value.trim();
  if (room === "") return null;
  if (room.length > ROOM_MAX_LENGTH || CONTROL_CHARACTERS.test(room)) {
    return INVALID;
  }
  return room;
}

/**
 * What a `/events/directions?v=…&b=…&r=…` link means. Shared by the page and
 * its terminal twin so a pasted link resolves the same way in both.
 *
 *   - `v` is a venue id from the catalog; `b` is a campus-map building code
 *     (the form meeting links have always used). `v` wins when both are there.
 *   - A link naming nothing at all is the club's standing answer to "where are
 *     you": the usual room at the usual venue.
 *   - A link naming a building, venue or room that does not resolve, or a room
 *     with no place to put it in, is unknown. It never becomes the DLW.
 *   - A bare `b=DLW` still means the usual room, as it did before.
 */
export function directionsTarget(v: Param, b: Param, r: Param): Place {
  const room = cleanRoom(r);
  if (room === INVALID) return UNKNOWN_PLACE;

  if (!present(v) && !present(b)) {
    if (room !== null) return UNKNOWN_PLACE;
    const venue = venueById(USUAL_VENUE_ID);
    return venue === undefined
      ? UNKNOWN_PLACE
      : { state: "known", venue, room: USUAL_ROOM, joinUrl: null };
  }

  let venue: Venue | undefined;
  if (present(v)) {
    venue = typeof v === "string" ? venueById(v) : undefined;
  } else if (typeof b === "string" && isMappedBuilding(b)) {
    venue = venueForBuilding(b);
  }
  if (venue === undefined) return UNKNOWN_PLACE;

  const usual = venue.id === USUAL_VENUE_ID && room === null && !present(v);
  return {
    state: "known",
    venue,
    room: usual ? USUAL_ROOM : room,
    joinUrl: null,
  };
}

/** The query string that reproduces a place, for links handed out. */
export function directionsQuery(place: Place): string {
  if (place.state === "unknown") return "";
  const query = new URLSearchParams({ v: place.venue.id });
  if (place.room !== null) query.set("r", place.room);
  return query.toString();
}
