import type { Venue, VenueVerified } from "@devdogsuga/events";
import { isMappedBuilding, locationLine, mapUrls } from "./buildings";
import type { BuildingKey } from "./campusMapMeta";

/**
 * Where a meeting is, as the directions drawer, the meeting page and the
 * terminal twin all read it. A plain module (no catalog lookup, no React) so a
 * client component can take a `Place` as a prop and describe it, while the
 * lookups that need `venues.json` stay in `placeLookup.ts` on the server.
 *
 * Two rules from the directions decisions (Q138, Q140) shape everything here:
 * an unknown place is its own state and never becomes the DLW, and nothing the
 * club has not verified is presented as a route.
 */

/** A venue as one visit uses it: the venue, the room, and a join link. */
export interface KnownPlace {
  state: "known";
  venue: Venue;
  room: string | null;
  /** The HTTPS link for an online night; null otherwise. */
  joinUrl: string | null;
}

/** A building, venue or room nobody here recognises. */
export interface UnknownPlace {
  state: "unknown";
}

export type Place = KnownPlace | UnknownPlace;

export const UNKNOWN_PLACE: UnknownPlace = { state: "unknown" };

export interface PlaceLink {
  label: string;
  url: string;
}

/** Everything the drawer, the page and the terminal print, as plain data. */
export interface PlaceView {
  /** "DLW 124", "Morehouse College, Atlanta", "Virtual", "Location pending". */
  title: string;
  /** Lines under the title: the full name, then the address. */
  subtitle: string[];
  /** The campus building to draw, only for a campus-map venue. */
  mapBuilding: BuildingKey | null;
  /** Labelled facts: building, room, address. */
  rows: { label: string; value: string }[];
  /** Plain-sentence text directions, always shown beside any visual. */
  paragraphs: string[];
  /** What an officer's walkthrough confirmed, or null. */
  verified: VenueVerified | null;
  /** The note for a place with nothing verified, or null when it is verified or has no route to verify. */
  unverifiedNote: string | null;
  /** External navigation and join links. */
  links: PlaceLink[];
}

/** The DLW's neighbours, written when it was the only mapped building. */
const DLW_LANDMARKS =
  "The DLW sits at the corner of E. Cloverhurst Ave and University Court, just below the Hill dorms, across from O-House, and downhill from the Tate Center. Driving? The Tate Deck is the closest visitor parking, about a five-minute walk away.";

/** Maps-app links for a street address. */
export function addressUrls(address: string): {
  google: string;
  apple: string;
} {
  const q = encodeURIComponent(address);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
  };
}

function navigationLinks(venue: Venue): PlaceLink[] {
  const urls =
    venue.building !== undefined && isMappedBuilding(venue.building)
      ? mapUrls(venue.building)
      : venue.address !== undefined
        ? addressUrls(venue.address)
        : null;
  return urls === null
    ? []
    : [
        { label: "Google Maps", url: urls.google },
        { label: "Apple Maps", url: urls.apple },
      ];
}

/** The line a member says: "DLW 124", "Dawson 110", "Virtual — Bevy". */
export function placeTitle(place: Place): string {
  if (place.state === "unknown") return "We don't know that place";
  const { venue, room } = place;
  switch (venue.kind) {
    case "campus": {
      if (venue.building !== undefined) {
        return locationLine(venue.building, room) ?? venue.name;
      }
      const label = venue.shortName ?? venue.name;
      return room === null ? venue.name : `${label} ${room}`;
    }
    case "offCampus": {
      const label = room === null ? venue.name : `${venue.name} ${room}`;
      return venue.locality === undefined
        ? label
        : `${label}, ${venue.locality}`;
    }
    case "virtual":
      return room === null ? venue.name : `${venue.name} — ${room}`;
    case "tba":
      return "Location pending";
  }
}

const NOT_VERIFIED =
  "We haven't verified the entrance or a step-free route yet, so we're not guessing at one. The map shows where the building is, not which door to use.";

export function describePlace(place: Place): PlaceView {
  if (place.state === "unknown") {
    return {
      title: placeTitle(place),
      subtitle: [],
      mapBuilding: null,
      rows: [],
      paragraphs: [
        "That link names a building or room we have no record of. Check the link, or look at the events page for where the next night is.",
      ],
      verified: null,
      unverifiedNote: null,
      links: [],
    };
  }
  const { venue, room, joinUrl } = place;
  const title = placeTitle(place);
  const address = venue.address;

  if (venue.kind === "tba") {
    return {
      title,
      subtitle: [],
      mapBuilding: null,
      rows: [],
      paragraphs: [
        "The location is pending. It will be posted on the event page and in the Discord as soon as it's settled.",
      ],
      verified: null,
      unverifiedNote: null,
      links: [],
    };
  }

  if (venue.kind === "virtual") {
    return {
      title,
      subtitle: [venue.name],
      mapBuilding: null,
      rows: room === null ? [] : [{ label: "Where", value: room }],
      paragraphs:
        joinUrl === null
          ? [
              "This is an online night. Join details are on Bevy and the event page.",
            ]
          : ["This is an online night. Use the join link below."],
      verified: null,
      unverifiedNote: null,
      links: joinUrl === null ? [] : [{ label: "Join online", url: joinUrl }],
    };
  }

  const rows: PlaceView["rows"] = [
    {
      label: venue.kind === "offCampus" ? "Venue" : "Building",
      value: venue.name,
    },
  ];
  if (room !== null) rows.push({ label: "Room", value: room });
  if (address !== undefined) rows.push({ label: "Address", value: address });
  const subtitle = [venue.name, ...(address === undefined ? [] : [address])];
  const links = navigationLinks(venue);

  if (venue.kind === "offCampus") {
    return {
      title,
      subtitle,
      mapBuilding: null,
      rows,
      paragraphs: [
        address === undefined
          ? "This one is off campus. The address isn't posted yet."
          : "This one is off campus, so there's no campus map. Use the address below with your maps app.",
      ],
      verified: null,
      unverifiedNote: null,
      links,
    };
  }

  // Campus. The map draws ten buildings; any other campus venue is text only.
  const mapBuilding =
    venue.building !== undefined && isMappedBuilding(venue.building)
      ? venue.building
      : null;
  const paragraphs: string[] = [];
  if (mapBuilding !== null) {
    paragraphs.push(
      room === null
        ? `This meeting is in ${venue.name}, highlighted on the map.`
        : `This meeting is in room ${room} of ${venue.name}, highlighted on the map.`,
    );
    if (mapBuilding === "DLW") paragraphs.push(DLW_LANDMARKS);
  } else {
    paragraphs.push(
      room === null
        ? `This meeting is in ${venue.name}. The campus map doesn't draw it.`
        : `This meeting is in ${room} of ${venue.name}. The campus map doesn't draw it.`,
    );
  }
  const verified = venue.verified ?? null;
  return {
    title,
    subtitle,
    mapBuilding,
    rows,
    paragraphs,
    verified,
    unverifiedNote: verified === null ? NOT_VERIFIED : null,
    links,
  };
}

/**
 * Whether a place has anything worth a "Directions" action: a campus-map
 * building, an address to navigate to, or a join link. A to-be-announced
 * place, an online night without a link and an unmapped campus space with no
 * address have nothing to open that the meeting page does not already say.
 */
export function hasDirections(place: Place): boolean {
  if (place.state === "unknown") return false;
  const { venue, joinUrl } = place;
  if (venue.kind === "virtual") return joinUrl !== null;
  if (venue.kind === "tba") return false;
  return venue.building !== undefined || venue.address !== undefined;
}

/** The sentence under a shared link's title and in its unfurl. */
export function placeBlurb(place: Place): string {
  if (place.state === "unknown") return "That place isn't one we know.";
  const { venue } = place;
  const where = placeTitle(place);
  switch (venue.kind) {
    case "tba":
      return "The location is pending.";
    case "virtual":
      return "This one is online.";
    case "campus":
    case "offCampus":
      return `This one is at ${where}.`;
  }
}

/** The usual meeting place, for the bare `/events/directions` link. */
export const USUAL_VENUE_ID = "dlw";
