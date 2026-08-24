import { BUILDING_KEYS, type BuildingKey } from "./campusMapMeta";

/**
 * What a meeting can say about where it is, on the app's side of the line.
 *
 * The keys themselves come from `campusMapMeta`, which the map generator
 * writes — so the set of buildings an officer can pick is, by construction,
 * the set the map can draw. That is the whole reason the list lives there
 * rather than here: a building in the dropdown with no footprint behind it is
 * a highlight pointing at nothing, and the failure would not show up until
 * somebody scheduled a meeting in it.
 *
 * `packages/airtable` keeps its own copy, because it sits upstream of this app
 * and importing downward would invert the dependency. The two are held
 * together by a test rather than by discipline — see `buildings.test.ts`.
 */

/** Somewhere the map does not draw. The room text carries the detail. */
export const OTHER_BUILDING = "Other";

/**
 * Where the club meets when nothing says otherwise.
 *
 * Named here rather than typed into the places that want it — the homepage's
 * Directions button and the bare `/events/directions` URL — because those have
 * to agree with the floor plan's own gate or the link on the front door opens
 * a dialog with no floor plan in it.
 */
export const USUAL_ROOM = "124";

export type MeetingBuilding = BuildingKey | typeof OTHER_BUILDING;

/** Every value the Airtable dropdown offers, in the order it offers them. */
export const MEETING_BUILDING_CHOICES: readonly MeetingBuilding[] = [
  ...BUILDING_KEYS,
  OTHER_BUILDING,
];

const DRAWN: ReadonlySet<string> = new Set(BUILDING_KEYS);

/** Whether the map has a footprint for this value — false for `Other`/null. */
export function isMappedBuilding(
  building: string | null,
): building is BuildingKey {
  return building !== null && DRAWN.has(building);
}

/**
 * What the map prints over the pin.
 *
 * Shorter than the name in prose, because this is set at display scale over a
 * building the reader is already looking at: "SLC" is what fits and what a
 * student says. The stored key is not always what should be drawn — hence a
 * table rather than printing the key.
 */
export const BUILDING_LABEL: Record<BuildingKey, string> = {
  DLW: "DLW",
  Driftmier: "Driftmier",
  "Plant Sciences": "Plant Sciences",
  Boyd: "Boyd",
  MLC: "MLC",
  "Science Learning Center": "SLC",
  "Science Library": "Science Library",
  "Poultry Science": "Poultry Science",
  "Main Library": "Main Library",
  Tate: "Tate",
};

/**
 * The building's name in a sentence, article included.
 *
 * Written to be dropped into running text — "Meet in the Driftmier Engineering
 * Center" — so the article belongs to the name rather than to every call site
 * remembering to add one.
 */
export const BUILDING_NAME: Record<BuildingKey, string> = {
  DLW: "the Dining, Learning & Well-Being Center",
  Driftmier: "the Driftmier Engineering Center",
  "Plant Sciences": "the Miller Plant Sciences Building",
  Boyd: "the Boyd Research Center",
  MLC: "the Zell B. Miller Learning Center",
  "Science Learning Center": "the Science Learning Center",
  "Science Library": "the Science Library",
  "Poultry Science": "the Poultry Science Building",
  "Main Library": "the Main Library",
  Tate: "the Tate Student Center",
};

/**
 * Where a meeting is, in one line: the building's short name and the room.
 *
 * Either half can be missing and the answer is still useful — a building with
 * no room is "DLW", a room with no building is whatever the officer typed —
 * so this returns null only when there is nothing at all to say, which is what
 * lets a caller print "Room to be announced" rather than an empty string.
 *
 * `Other` contributes nothing: it means "not one of the buildings on the map",
 * which is a statement about this app rather than about where to go, and
 * printing it would put the word "Other" on a public page as if it were an
 * address.
 */
export function locationLine(
  building: string | null,
  room: string | null,
): string | null {
  const short = isMappedBuilding(building) ? BUILDING_LABEL[building] : null;
  return [short, room].filter((part) => part !== null).join(" ") || null;
}
