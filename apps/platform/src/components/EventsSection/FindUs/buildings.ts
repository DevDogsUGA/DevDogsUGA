import { BUILDING_KEYS, type BuildingKey } from "./campusMapMeta";

/**
 * What a meeting can say about where it is, on the app's side of the line.
 *
 * The keys come from `campusMapMeta`, which the map generator writes, so the
 * set of buildings an officer can pick is the set the map can draw. A building
 * in the dropdown with no footprint behind it is a highlight pointing at
 * nothing, and nobody would notice until a meeting was scheduled in it.
 *
 * `packages/airtable` keeps its own copy, because it sits upstream of this app
 * and importing downward would invert the dependency. `buildings.test.ts`
 * holds the two together.
 */

/** Somewhere the map does not draw. The room text carries the detail. */
export const OTHER_BUILDING = "Other";

/**
 * Where the club meets when nothing says otherwise.
 *
 * Named here rather than typed into the homepage's Directions button and the
 * bare `/events/directions` URL, because those have to agree with the floor
 * plan's own gate or the link on the front door opens a dialog with no floor
 * plan in it.
 */
export const USUAL_ROOM = "124";

export type MeetingBuilding = BuildingKey | typeof OTHER_BUILDING;

/** Every value the Airtable dropdown offers, in the order it offers them. */
export const MEETING_BUILDING_CHOICES: readonly MeetingBuilding[] = [
  ...BUILDING_KEYS,
  OTHER_BUILDING,
];

const DRAWN: ReadonlySet<string> = new Set(BUILDING_KEYS);

/** Whether the map has a footprint for this value: false for `Other`/null. */
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
 * student says. A table rather than the key itself, because the stored key is
 * not always what should be drawn.
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
 * Written to drop into running text, "Meet in the Driftmier Engineering
 * Center", so the article belongs to the name rather than to every call site
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
 * The building's name on its own, for a heading: no article, no sentence.
 * Kept beside {@link BUILDING_NAME} rather than derived from it, because "the"
 * is not the only difference: a heading gets the Oxford comma the running text
 * drops.
 */
export const BUILDING_FULL_NAME: Record<BuildingKey, string> = {
  DLW: "Dining, Learning, and Well-Being Center",
  Driftmier: "Driftmier Engineering Center",
  "Plant Sciences": "Miller Plant Sciences Building",
  Boyd: "Boyd Research Center",
  MLC: "Zell B. Miller Learning Center",
  "Science Learning Center": "Science Learning Center",
  "Science Library": "Science Library",
  "Poultry Science": "Poultry Science Building",
  "Main Library": "Main Library",
  Tate: "Tate Student Center",
};

/**
 * Street addresses, for the line under the building's name in the directions
 * dialog and for anyone pasting one into a maps app by hand. Typed here, not
 * fetched: they change on the order of decades, and a lookup at render time
 * would be a network dependency for ten strings.
 *
 * Sourced from the buildings' own UGA pages and cross-checked against the
 * OpenStreetMap footprints the map is drawn from. The DLW's is the least
 * settled: the building opened in August 2026 on the old Hillside site, whose
 * address this is. Re-check that one first if a member reports a maps app
 * sending them somewhere odd.
 */
export const BUILDING_ADDRESS: Record<BuildingKey, string> = {
  DLW: "301 E Cloverhurst Ave, Athens, GA 30605",
  Driftmier: "597 D. W. Brooks Dr, Athens, GA 30602",
  "Plant Sciences": "120 Carlton St, Athens, GA 30602",
  Boyd: "200 D. W. Brooks Dr, Athens, GA 30602",
  MLC: "48 Baxter St, Athens, GA 30602",
  "Science Learning Center": "130 Carlton St, Athens, GA 30602",
  "Science Library": "210 D. W. Brooks Dr, Athens, GA 30602",
  "Poultry Science": "110 Cedar St, Athens, GA 30602",
  "Main Library": "320 S Jackson St, Athens, GA 30602",
  Tate: "45 Baxter St, Athens, GA 30602",
};

/**
 * Where a meeting is, in one line: the building's short name and the room.
 *
 * Either half can be missing and the answer is still useful: a building with
 * no room is "DLW", a room with no building is whatever the officer typed. It
 * returns null only when there is nothing at all to say, which lets a caller
 * print "Room to be announced" rather than an empty string.
 *
 * `Other` contributes nothing: it means "not one of the buildings on the map",
 * a statement about this app rather than about where to go, and printing it
 * would put the word "Other" on a public page as if it were an address.
 */
export function locationLine(
  building: string | null,
  room: string | null,
): string | null {
  const short = isMappedBuilding(building) ? BUILDING_LABEL[building] : null;
  return [short, room].filter((part) => part !== null).join(" ") || null;
}
